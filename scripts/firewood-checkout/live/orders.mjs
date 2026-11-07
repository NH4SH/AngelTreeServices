// Candidate production order service; only the explicit isolated in-process
// review fixture can construct it until real runtime admission is installed.
import {randomUUID} from 'node:crypto';
import {token,digest,equal,SESSION_MS} from '../production/runtime/checkout.mjs';
import {catalog,orderInput,CheckoutError} from './policy.mjs';
import {canonicalHandoff,handoffDigest,PAYMENT_POLICY,LIVE_TERMS_POLICY,LIVE_TERMS_HASH,LIVE_PAYMENT_POLICY_HASH,HANDOFF_SOURCE} from './contract.mjs';
import {prepareOrderBinding,assertLiveClient} from './client.mjs';
import {installHandoffStore,handoffStore,queuePreparation} from './store.mjs';

export async function installOrderStore(db,client){
  assertLiveClient(client,{isolated:true});
  await installHandoffStore(db,client);
  await db.transaction(async tx=>{
    await tx.query('SELECT pg_advisory_xact_lock(987134230)');
    await tx.query('CREATE TABLE IF NOT EXISTS fwlive_sessions(id text PRIMARY KEY,csrf text NOT NULL,expires bigint NOT NULL,order_id uuid UNIQUE)');
    await tx.query('CREATE TABLE IF NOT EXISTS fwlive_rate(id text PRIMARY KEY,window_start bigint NOT NULL,used integer NOT NULL)');
    await tx.query('CREATE TABLE IF NOT EXISTS fwlive_control(id boolean PRIMARY KEY CHECK(id),paused boolean NOT NULL)');
    await tx.query('INSERT INTO fwlive_control VALUES(true,true) ON CONFLICT DO NOTHING');
    await tx.query(`CREATE TABLE IF NOT EXISTS fwlive_orders(id uuid PRIMARY KEY,session_id text UNIQUE NOT NULL REFERENCES fwlive_sessions(id),
      number text UNIQUE NOT NULL,quote jsonb NOT NULL,contact jsonb NOT NULL,terms jsonb NOT NULL,payment_policy jsonb NOT NULL,created_at bigint NOT NULL)`);
    await tx.query(`CREATE OR REPLACE FUNCTION fwlive_order_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'immutable_accepted_order';END $$;`);
    await tx.query('DROP TRIGGER IF EXISTS fwlive_order_guard ON fwlive_orders');
    await tx.query('CREATE TRIGGER fwlive_order_guard BEFORE UPDATE OR DELETE ON fwlive_orders FOR EACH ROW EXECUTE FUNCTION fwlive_order_immutable()');
    await tx.query(`CREATE TABLE IF NOT EXISTS fwlive_confirmations(order_id uuid PRIMARY KEY REFERENCES fwlive_orders(id),
      observation_revision integer NOT NULL,original_paid_evidence jsonb NOT NULL,message jsonb NOT NULL,status text NOT NULL CHECK(status='captured'),created_at bigint NOT NULL)`);
    await tx.query('DROP TRIGGER IF EXISTS fwlive_confirmation_guard ON fwlive_confirmations');
    await tx.query('CREATE TRIGGER fwlive_confirmation_guard BEFORE UPDATE OR DELETE ON fwlive_confirmations FOR EACH ROW EXECUTE FUNCTION fwlive_order_immutable()');
    await tx.query(`CREATE TABLE IF NOT EXISTS fwlive_outbox(order_id uuid NOT NULL REFERENCES fwlive_orders(id),
      kind text NOT NULL CHECK(kind IN ('customer_order','owner_order')),recipient text NOT NULL,
      message jsonb NOT NULL,idempotency_key text UNIQUE NOT NULL,status text NOT NULL CHECK(status='held'),
      created_at bigint NOT NULL,PRIMARY KEY(order_id,kind))`);
    await tx.query('DROP TRIGGER IF EXISTS fwlive_outbox_guard ON fwlive_outbox');
    await tx.query('CREATE TRIGGER fwlive_outbox_guard BEFORE UPDATE OR DELETE ON fwlive_outbox FOR EACH ROW EXECUTE FUNCTION fwlive_order_immutable()');
  });
}
const money=c=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(c/100);
export function orderConfirmation(order,status){
  if(status.fulfillment_ready!==true||status.payment_state!=='paid'||!status.original_paid_evidence)throw Error('verified_paid_order_required');
  const t=status.totals;
  return {subject:'Firewood order '+order.number+' — order details',
    text:[`Order ${order.number}`,`${order.quote.label}${order.quote.stacking?' with stacking':' delivered'}`,
      `Order subtotal: ${money(t.invoice_principal_cents)}`,`Credit-card surcharge collected: ${money(t.surcharge_collected_cents)}`,
      `Total payment collected: ${money(t.gross_collected_cents)}`,`Delivery to: ${order.contact.address}${order.contact.address2?', '+order.contact.address2:''}, ${order.contact.city}, ${order.contact.state} ${order.contact.postal}`,
      'Angel Tree Services has recorded payment for your order. The CRM provides the separate payment receipt.',
      'Angel will contact you with a delivery date within one week of ordering. Call (540) 388-8715 for more specific scheduling.',
      'Cancel at least 48 hours before the start of the agreed delivery window for a full refund. Cancellations with less notice are non-refundable.',
      'A full refund also applies before scheduling, if Angel cancels or cannot fulfil the order, or if the customer declines a reschedule initiated by Angel.'].join('\n')};
}
export function handoffOrders({db,client,now=Date.now}){
  assertLiveClient(client,{isolated:true});
  const scope=client.scope,handoff=handoffStore({db,client,now});
  const one=async(sql,args=[])=>(await db.query(sql,args)).rows[0]??null;
  async function rate(id,limit){const row=await one(`INSERT INTO fwlive_rate VALUES($1,$2,1) ON CONFLICT(id) DO UPDATE SET
    window_start=CASE WHEN fwlive_rate.window_start<=$3 THEN $2 ELSE fwlive_rate.window_start END,
    used=CASE WHEN fwlive_rate.window_start<=$3 THEN 1 ELSE fwlive_rate.used+1 END
    WHERE fwlive_rate.window_start<=$3 OR fwlive_rate.used<$4 RETURNING id`,[id,now(),now()-60000,limit]);
    if(!row)throw new CheckoutError('Please wait a minute before trying again.',429);
  }
  async function session(value,create=false){
    let s=/^[a-f0-9]{48}$/u.test(value??'')?await one('SELECT * FROM fwlive_sessions WHERE id=$1 AND expires>$2',[digest(value),now()]):null;
    if(!s&&create){await rate('sessions',120);value=token();s=(await db.query('INSERT INTO fwlive_sessions(id,csrf,expires) VALUES($1,$2,$3) RETURNING *',[digest(value),token(),now()+SESSION_MS])).rows[0];}
    if(!s)throw new CheckoutError('Your checkout session expired. Reload to start, or call Angel about a saved payment.',403);
    return {...s,cookie:value};
  }
  const checkCsrf=(s,value)=>{if(!equal(s.csrf,value)||Number(s.expires)<=now())throw new CheckoutError('Reload the checkout before continuing.',403);};
  const order=id=>one('SELECT * FROM fwlive_orders WHERE id=$1',[id]);
  async function own(s){const current=await session(s.cookie),row=current.order_id?await order(current.order_id):null;if(row&&row.session_id!==current.id)throw Error('session_order_mismatch');return{current,row};}
  async function capture(row,status){if(status.fulfillment_ready!==true)return;
    await db.transaction(async tx=>{
      await tx.query(`INSERT INTO fwlive_confirmations VALUES($1,$2,$3,$4,'captured',$5) ON CONFLICT DO NOTHING`,
        [row.id,status.observation_revision,JSON.stringify(status.original_paid_evidence),JSON.stringify(orderConfirmation(row,status)),now()]);
      const saved=(await tx.query('SELECT * FROM fwlive_confirmations WHERE order_id=$1 FOR UPDATE',[row.id])).rows[0];
      if(canonicalHandoff(saved.original_paid_evidence)!==canonicalHandoff(status.original_paid_evidence))throw Error('live_confirmation_proof_conflict');
      // Capture only. No dispatcher/provider exists in this unbound profile.
      for(const [kind,recipient,message] of [
        ['customer_order',row.contact.email,saved.message],
        ['owner_order','info@angeltreeservice.org',{subject:'Paid firewood order '+row.number,
          text:saved.message.text+'\nCustomer: '+row.contact.name+'\nEmail: '+row.contact.email+'\nPhone: '+row.contact.phone}],
      ])await tx.query("INSERT INTO fwlive_outbox VALUES($1,$2,$3,$4,$5,'held',$6) ON CONFLICT DO NOTHING",
        [row.id,kind,recipient,JSON.stringify(message),handoffDigest({source:HANDOFF_SOURCE,order:row.id,kind}),now()]);
    });
  }
  async function refresh(row){try{const status=await handoff.observe(row.id);await capture(row,status);return{status,verified:true};}
    catch{return{status:await handoff.observation(row.id),verified:false};}}
  async function state(s){const {current,row}=await own(s),control=await one('SELECT paused FROM fwlive_control WHERE id=true');
    const checked=row?await refresh(row):{status:null,verified:true},prepared=row?await handoff.saved(row.id):null;
    return {csrf:current.csrf,catalog,sandbox:false,terms:LIVE_TERMS_POLICY,termsHash:LIVE_TERMS_HASH,paymentPolicyHash:LIVE_PAYMENT_POLICY_HASH,paused:control.paused,status:row?'saved':'draft',
      order:row?{quote:row.quote,contact:row.contact,termsAccepted:row.terms.accepted,householdUseConfirmed:row.terms.householdUseConfirmed,orderNumber:row.number,frozen:true}:null,
      payment:checked.status,verificationPending:!checked.verified,preparation:prepared?.status??null,
      paymentExecutionReady:prepared?.receipt?.payment_execution_ready===true};
  }
  async function start(s,input){const {current}=await own(s);checkCsrf(current,input.csrf);await rate('start:'+current.id,12);
    const chosen=orderInput(input,client);
    if(chosen.contact.state!=='VA')throw new CheckoutError('Online household orders use Virginia delivery addresses. Call Angel about an address outside Virginia.',400,'state');
    // This flow does not accept customer-supplied invoice IDs, prices, fees or
    // assisted quotes. A future office-quote adapter must supply signed proof.
    if(input.assistedQuote!==undefined||input.officeApproval!==undefined)throw new CheckoutError('Please contact Angel to use an office-approved price.',409);
    const row=await db.transaction(async tx=>{
      const locked=(await tx.query('SELECT * FROM fwlive_sessions WHERE id=$1 AND expires>$2 FOR UPDATE',[current.id,now()])).rows[0];
      if(!locked)throw new CheckoutError('Reload the checkout before continuing.',403);
      if(locked.order_id){const existing=(await tx.query('SELECT * FROM fwlive_orders WHERE id=$1',[locked.order_id])).rows[0];
        if(canonicalHandoff({quote:existing.quote,contact:existing.contact,terms:existing.terms})!==canonicalHandoff(chosen))throw new CheckoutError('Your accepted order is saved. Call Angel before changing its amount or delivery details.',409);
        return existing;
      }
      const control=(await tx.query('SELECT paused FROM fwlive_control WHERE id=true FOR UPDATE')).rows[0];if(control.paused)throw new CheckoutError('Online ordering is paused. Please call Angel for availability.',409);
      const id=randomUUID(),value={id,number:'FW-'+id.slice(0,8).toUpperCase(),...chosen,created_at:now()};
      const request=prepareOrderBinding(value,client);
      await tx.query('INSERT INTO fwlive_orders VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,current.id,value.number,JSON.stringify(chosen.quote),JSON.stringify(chosen.contact),JSON.stringify(chosen.terms),JSON.stringify(PAYMENT_POLICY),value.created_at]);
      await queuePreparation(tx,request,now(),client);await tx.query('UPDATE fwlive_sessions SET order_id=$2 WHERE id=$1',[current.id,id]);return value;
    });
    await handoff.work({limit:1});return{next:'/firewood/checkout/result/',orderSaved:true,orderNumber:row.number};
  }
  async function resume(s,input){const {current,row}=await own(s);checkCsrf(current,input.csrf);if(!row)throw new CheckoutError('Save your order before choosing payment.',409);await rate('resume:'+current.id,12);
    const checked=await refresh(row);
    if(!checked.verified)throw new CheckoutError('Your saved payment status is being checked. Please try again shortly; do not start another order.',503);
    const status=checked.status;
    if(status.original_paid_evidence||status.payment_pending||status.review_required||!['unpaid','failed','offline_pending'].includes(status.payment_state))return{next:'/firewood/checkout/result/'};
    try{return{next:(await handoff.paymentLink(row.id)).url};}
    catch(e){if(['live_capability_renewal_required','live_payment_execution_not_ready'].includes(e.code)){
        try{await handoff.renew(row.id);return{next:(await handoff.paymentLink(row.id)).url};}
        catch{throw new CheckoutError('Your order is saved. Payment options are not available yet. Check again shortly or call Angel.',503);}}
      throw new CheckoutError('Your order is saved. Payment options are being prepared; please check again shortly or call Angel.',503);}
  }
  async function confirmation(s){const {row}=await own(s);if(!row)throw new CheckoutError('No saved order was found.',404);
    const message=await one('SELECT message,status FROM fwlive_confirmations WHERE order_id=$1',[row.id]);
    return {confirmation:message?.message??null,status:message?.status??'pending'};
  }
  async function work(){const result=await handoff.work({limit:20});let checked=0;
    const rows=(await db.query("SELECT o.* FROM fwlive_orders o JOIN fwlive_prepare p ON p.order_id=o.id WHERE p.status='prepared' ORDER BY o.created_at DESC LIMIT 50")).rows;
    for(const row of rows){const v=await refresh(row);if(v.verified)checked++;}return{...result,checked,emailsSent:0};
  }
  return{scope,session,state,start,resume,confirmation,work,handoff,order};
}
