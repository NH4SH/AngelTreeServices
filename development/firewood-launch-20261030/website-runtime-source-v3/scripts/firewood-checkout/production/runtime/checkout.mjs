import {randomBytes,randomUUID,createHash,timingSafeEqual} from 'node:crypto';
import {catalog,orderInput,CheckoutError,policy,policyHash,refundEligibility} from './policy.mjs';
export const token=()=>randomBytes(24).toString('hex');
export const digest=x=>createHash('sha256').update(x).digest('hex');
export function equal(a,b){const x=Buffer.from(typeof a==='string'?a:''),y=Buffer.from(typeof b==='string'?b:'');return x.length===y.length&&timingSafeEqual(x,y);}
export const SESSION_MS=86400000,LEASE_MS=60000,CREATE_MS=23*3600000;
export function createCheckout({db,config,provider,crm=null,now=Date.now}) {
  if(crm){crm.assertConfiguration(config);if(provider.crm!==crm)throw Error('same_candidate_crm_adapter_required');}
  const one=async(sql,p=[])=>(await db.query(sql,p)).rows[0]??null;
  const audit=async(tx,id,action,detail={})=>tx.query('INSERT INTO fw_audit VALUES($1,$2,$3,$4,$5)',[randomUUID(),id,action,JSON.stringify(detail),now()]);
  async function rate(id,limit,window=60000){const row=await one(`INSERT INTO fw_rate VALUES($1,$2,1) ON CONFLICT(id) DO UPDATE SET
    window_start=CASE WHEN fw_rate.window_start <= $3 THEN $2 ELSE fw_rate.window_start END,
    used=CASE WHEN fw_rate.window_start <= $3 THEN 1 ELSE fw_rate.used+1 END WHERE fw_rate.window_start <= $3 OR fw_rate.used < $4 RETURNING used`,[id,now(),now()-window,limit]);
    if(!row)throw new CheckoutError('Please wait a minute before trying again.',429);}
  async function login(code){await rate('qa-login',20);if(!equal(code,config.accessToken))throw new CheckoutError('Access code not accepted.',401);const id=token();await db.query('INSERT INTO fw_access VALUES($1,$2)',[digest(id),now()+4*3600000]);return id;}
  async function authorized(value){return !config.sandbox||/^[a-f0-9]{48}$/u.test(value??'')&&!!await one('SELECT id FROM fw_access WHERE id=$1 AND expires>$2',[digest(value),now()]);}
  async function session(value,create=false){let s=/^[a-f0-9]{48}$/u.test(value??'')?await one('SELECT * FROM fw_sessions WHERE id=$1 AND expires>$2',[digest(value),now()]):null;
    if(!s&&create){await rate('sessions',120);value=token();s=(await db.query('INSERT INTO fw_sessions(id,csrf,expires) VALUES($1,$2,$3) RETURNING *',[digest(value),token(),now()+SESSION_MS])).rows[0];}
    if(!s)throw new CheckoutError('Your checkout session expired. Reload to start again, or call Angel about a payment already made.',403);
    return {...s,cookie:value};}
  async function csrf(s,value){if(!equal(value,s.csrf)||Number(s.expires)<=now())throw new CheckoutError('Reload the checkout before continuing.',403);}
  const order=id=>one('SELECT * FROM fw_orders WHERE id=$1',[id]);
  async function state(s){s=await session(s.cookie);const row=s.order_id?await order(s.order_id):null;if(row&&row.session_id!==s.id)throw Error('customer_session_mismatch');
    if(row?.payment_status==='pending')await db.query("UPDATE fw_reconcile SET retry_at=LEAST(retry_at,$2) WHERE id=$1 AND status='pending'",[row.id,now()]);
    const paid=row&&['paid','refunded'].includes(row.payment_status),control=await one('SELECT paused FROM fw_control WHERE id=true');
    const refund=paid?await one(`SELECT status FROM (
      SELECT status FROM fw_refunds WHERE order_id=$1
      UNION ALL SELECT status FROM fw_events WHERE attempt=$1 AND (event_type LIKE 'refund.%' OR event_type='charge.refunded') AND status IN ('pending','review')
      ) states ORDER BY CASE status WHEN 'review' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END LIMIT 1`,[row.id]):null;
    return {csrf:s.csrf,catalog,sandbox:config.sandbox,paused:control.paused,policy,status:paid?row.payment_status:row?'pending':'draft',
      order:row&&!paid?{quote:row.quote,contact:row.contact,termsAccepted:row.terms.accepted===true,householdUseConfirmed:row.terms.householdUseConfirmed===true}:null,assistedQuote:row?.quote.officeApproved?row.quote:null,receipt:paid?{...row.quote,orderNumber:row.number,fulfillment:row.fulfillment,refundCents:row.refund_cents,refundStatus:refund?.status??null}:null};}
  async function ensurePayment(row){if(row.payment_id||row.payment_status!=='pending')return row;
    if(now()-Number(row.created_at)>=CREATE_MS)throw new CheckoutError('This payment needs office review before another can open. Please call Angel.',409);
    const p=await provider.create(row);
    await db.query('UPDATE fw_orders SET payment_id=$2,payment_url=$3 WHERE id=$1 AND (payment_id IS NULL OR payment_id=$2)',[row.id,p.id,p.url]);
    const saved=await order(row.id);if(saved.payment_id!==p.id)throw Error('payment_binding_conflict');return saved;}
  async function start(s,input){await csrf(s,input.csrf);
    if(!config.sandbox&&!config.emailEnabled)throw new CheckoutError('Online ordering is temporarily unavailable. Please call Angel for availability.',503);
    const chosen=orderInput(input,config);await rate('start:'+s.id,12);
    const lease=token();if(!await one('UPDATE fw_sessions SET lease=$2,lease_until=$3 WHERE id=$1 AND expires>$4 AND lease_until<=$4 RETURNING id',[s.id,lease,now()+LEASE_MS,now()]))throw new CheckoutError('Your payment is opening. Wait a moment before trying again.',409);
    const fenced=callback=>db.transaction(async tx=>{const row=(await tx.query('SELECT * FROM fw_sessions WHERE id=$1 FOR UPDATE',[s.id])).rows[0];
      if(row.lease!==lease||Number(row.lease_until)<=now())throw new CheckoutError('Reload to check the saved payment before trying again.',409);return callback(tx,row);});
    try{let current=await one('SELECT * FROM fw_sessions WHERE id=$1',[s.id]),row=current.order_id?await order(current.order_id):null;
      if(row?.quote.officeApproved&&!input.assistedQuote){if(row.quote.quantity!==chosen.quote.quantity||row.quote.stacking!==chosen.quote.stacking||row.contact.email.toLowerCase()!==chosen.contact.email.toLowerCase())throw new CheckoutError('Contact Angel before changing an office-approved order.',409);chosen.quote=row.quote;}
      if(input.assistedQuote){if(typeof input.assistedQuote!=='string'||!/^[a-f0-9]{48}$/u.test(input.assistedQuote))throw new CheckoutError('Invalid office quote.');
        const q=await one('SELECT * FROM fw_quotes WHERE id=$1',[digest(input.assistedQuote)]);
        if(!q||Number(q.expires)<=now()||(q.used_by&&q.used_by!==row?.id)||q.email_hash!==digest(chosen.contact.email.toLowerCase())||q.quantity!==chosen.quote.quantity||q.stacking!==chosen.quote.stacking)throw new CheckoutError('This office quote does not match your order. Contact Angel before paying.',409);
        chosen.quote=q.quote;}
      if(row){row=await ensurePayment(row);if(row.payment_status!=='pending')return {next:'/firewood/checkout/result/'};
        const proof=await provider.state(row);if(proof.paid||proof.processing)return {next:'/firewood/checkout/result/'};
        const changed=['quote','contact'].some(k=>Object.keys({...row[k],...chosen[k]}).some(name=>JSON.stringify(row[k][name])!==JSON.stringify(chosen[k][name])));
        if(changed&&!proof.expired){try{await provider.expire(row);}catch{}const again=await provider.state(row);if(!again.expired)throw new CheckoutError('The existing payment is still active or processing. Your details are saved; check its status before paying again.',409);}
        if(!changed&&!proof.expired)return {next:(await provider.link(row)).url};
        if(row.quote.officeApproved&&!input.assistedQuote)throw new CheckoutError('Contact Angel to renew the office-approved payment before another opens.',409);
        row=null;
      }
      row=await fenced(async(tx)=>{const c=(await tx.query('SELECT * FROM fw_control WHERE id=true FOR UPDATE')).rows[0];if(c.paused)throw new CheckoutError('Online ordering is paused. Please call Angel for availability.',409);
        if(input.assistedQuote){const q=(await tx.query('SELECT * FROM fw_quotes WHERE id=$1 FOR UPDATE',[digest(input.assistedQuote)])).rows[0];
          if(!q||Number(q.expires)<=now()||q.used_by||q.email_hash!==digest(chosen.contact.email.toLowerCase())||q.quantity!==chosen.quote.quantity||q.stacking!==chosen.quote.stacking)throw new CheckoutError('This office-approved quote is expired or does not match your order. Contact Angel before paying.',409);
          chosen.quote=q.quote;
        }
        const id=randomUUID(),number='FW-'+id.slice(0,8).toUpperCase(),created_at=now();
        const values=[id,s.id,number,JSON.stringify(chosen.quote),JSON.stringify(chosen.contact),JSON.stringify(chosen.terms),created_at];
        if(crm)values.push(JSON.stringify(crm.binding({id,number,created_at,...chosen})));
        const row=(await tx.query(crm?
          'INSERT INTO fw_orders(id,session_id,number,quote,contact,terms,created_at,crm_binding) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *':
          'INSERT INTO fw_orders(id,session_id,number,quote,contact,terms,created_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',values)).rows[0];
        await tx.query('INSERT INTO fw_reconcile(id,created_at,retry_at) VALUES($1,$2,$3)',[id,now(),now()+60000]);
        await tx.query('UPDATE fw_sessions SET order_id=$2 WHERE id=$1',[s.id,id]);
        if(input.assistedQuote)await tx.query('UPDATE fw_quotes SET used_by=$2 WHERE id=$1',[digest(input.assistedQuote),id]);
        await audit(tx,id,'order-saved',{terms:policyHash,totalCents:row.quote.totalCents});return row;});
      row=await ensurePayment(row);await fenced(async()=>{});return {next:row.payment_url};
    }finally{await db.query('UPDATE fw_sessions SET lease=NULL,lease_until=0 WHERE id=$1 AND lease=$2',[s.id,lease]).catch(()=>{});}}
  async function reset(s,value){return db.transaction(async tx=>{
    const current=(await tx.query('SELECT * FROM fw_sessions WHERE id=$1 FOR UPDATE',[s.id])).rows[0];
    if(!current||Number(current.expires)<=now()||!equal(current.csrf,value))throw new CheckoutError('Reload the checkout before continuing.',403);
    if(Number(current.lease_until)>now())throw new CheckoutError('Your payment is opening. Check its status before starting another order.',409);
    if(current.order_id){const row=(await tx.query('SELECT payment_status FROM fw_orders WHERE id=$1',[current.order_id])).rows[0];
      if(!row||row.payment_status==='pending')throw new CheckoutError('Check the pending payment before starting another order.',409);}
    await tx.query('DELETE FROM fw_access WHERE expires<=$1',[now()]);
    await tx.query('UPDATE fw_sessions SET expires=$2 WHERE id=$1',[s.id,now()]);
  });}
  async function confirmation(s){s=await session(s.cookie);const row=s.order_id?await order(s.order_id):null;if(!row||row.session_id!==s.id||row.payment_status==='pending')throw new CheckoutError('Confirmation is still pending. Please check again shortly.',409);
    const message=await one("SELECT message,status FROM fw_outbox WHERE order_id=$1 AND audience='customer'",[row.id]);return {confirmation:message?.message,status:message?.status??'pending'};}
  async function owner(action,input={}){
    if(action==='status')return {paused:(await one('SELECT paused FROM fw_control WHERE id=true')).paused,orders:(await db.query('SELECT id,number,payment_status,fulfillment,delivery_start,delivery_end,version,quote,created_at,refund_cents,disputed FROM fw_orders ORDER BY created_at DESC LIMIT 100')).rows};
    if(action==='details'){const r=await order(input.id);if(!r)throw new CheckoutError('Order not found.',404);return r;}
    if(action==='pause'){if(typeof input.paused!=='boolean')throw new CheckoutError('Choose paused or open.');return db.transaction(async tx=>{await tx.query('UPDATE fw_control SET paused=$1,updated_at=$2 WHERE id=true',[input.paused,now()]);await audit(tx,null,'availability',{paused:input.paused});return {paused:input.paused};});}
    if(action==='quote'){
      // The office explicitly approves the price. No automatic discount stacking
      // or inference about which base a veterans reduction should use.
      const base=orderInput({...input,termsAccepted:true},config).quote;
      if(input.residential!==true||input.singleDiscountConfirmed!==true||!Number.isInteger(input.woodCents)||!Number.isInteger(input.stackingCents)||input.woodCents<1||
        input.stackingCents<0||input.stackingCents>base.stackingCents||input.woodCents>base.woodCents)throw new CheckoutError('An explicit residential, single-discount office quote is required.');
      const id=token(),quote={...base,woodCents:input.woodCents,stackingCents:input.stackingCents,totalCents:input.woodCents+input.stackingCents,officeApproved:true};
      if(crm)quote.officeApproval={approval_id:randomUUID(),approved_at_ms:now(),residential:true,single_discount_confirmed:true};
      await db.transaction(async tx=>{await tx.query('INSERT INTO fw_quotes(id,email_hash,quantity,stacking,quote,expires) VALUES($1,$2,$3,$4,$5,$6)',[digest(id),digest(input.email.trim().toLowerCase()),base.quantity,base.stacking,JSON.stringify(quote),now()+86400000]);await audit(tx,null,'office-quote-approved',{quantity:base.quantity,totalCents:quote.totalCents});});return {quoteToken:id,quote,expires:now()+86400000};
    }
    return db.transaction(async tx=>{const row=(await tx.query('SELECT * FROM fw_orders WHERE id=$1 FOR UPDATE',[input.id])).rows[0];if(!row)throw new CheckoutError('Order not found.',404);
      if(row.version!==input.version)throw new CheckoutError('The order changed. Reload it before continuing.',409);
      if(action==='schedule'){
        if(row.payment_status!=='paid'||row.fulfillment==='cancelled'||row.disputed||!Number.isSafeInteger(input.start)||!Number.isSafeInteger(input.end)||input.start<=now()||input.end<=input.start||input.end-input.start>86400000)throw new CheckoutError('Choose a future delivery window for a paid, active order.');
        if(row.delivery_start!==null&&input.customerAgreed!==true)throw new CheckoutError('Confirm the customer agreed to the new delivery window.');
        await tx.query("UPDATE fw_orders SET delivery_start=$2,delivery_end=$3,fulfillment='scheduled',version=version+1 WHERE id=$1",[row.id,input.start,input.end]);
        await audit(tx,row.id,'delivery-scheduled',{start:input.start,end:input.end,previousStart:row.delivery_start});return {scheduled:true};
      }
      if(action==='cancel'){
        if(row.fulfillment==='cancelled')return {cancelled:true,refundPending:(await tx.query('SELECT id FROM fw_refunds WHERE order_id=$1',[row.id])).rows.length>0};
        const eligibility=refundEligibility(row,input.reason,now());if(row.payment_status!=='paid'||row.fulfillment==='delivered')throw new CheckoutError('Only a paid, undelivered order can be cancelled.',409);
        if(!['customer-cancels','angel-cancels','cannot-fulfill','declined-angel-reschedule'].includes(input.reason))throw new CheckoutError('Choose a cancellation reason.');
        await tx.query("UPDATE fw_orders SET fulfillment='cancelled',version=version+1 WHERE id=$1",[row.id]);
        if(eligibility.eligible)await tx.query('INSERT INTO fw_refunds(id,order_id,amount,reason,created_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(order_id) DO NOTHING',[randomUUID(),row.id,row.quote.totalCents,input.reason,now()]);
        await audit(tx,row.id,'cancelled',{reason:input.reason,refundEligible:eligibility.eligible,basis:eligibility.code});return {cancelled:true,refundPending:eligibility.eligible};
      }
      if(action==='delivered'){if(row.payment_status!=='paid'||row.fulfillment!=='scheduled'||row.disputed)throw new CheckoutError('A scheduled, paid order is required.');await tx.query("UPDATE fw_orders SET fulfillment='delivered',version=version+1 WHERE id=$1",[row.id]);await audit(tx,row.id,'delivered');return {delivered:true};}
      throw new CheckoutError('Unknown owner action.',404);
    });
  }
  return {db,config,provider,crm,now,one,order,audit,rate,login,authorized,session,csrf,state,start,reset,confirmation,ensurePayment,owner};
}
