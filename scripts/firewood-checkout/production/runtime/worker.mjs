import {randomUUID} from 'node:crypto';
import {CheckoutError} from './policy.mjs';
import {LEASE_MS,CREATE_MS} from './checkout.mjs';
import {purpose} from './provider.mjs';
const paidTypes=new Set(['checkout.session.completed','checkout.session.async_payment_succeeded']);
const sessionTypes=new Set([...paidTypes,'checkout.session.expired','checkout.session.async_payment_failed']);
const refundTypes=new Set(['refund.created','refund.updated','refund.failed']);
const lifecycleTypes=new Set(['charge.refunded','charge.dispute.created','charge.dispute.updated','charge.dispute.closed',...refundTypes]);
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u;
const money=x=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(x/100);
export function createWorker(checkout,{mailer=null,now=checkout.now}={}){
  const {db,provider,config,one,order,audit,crm}=checkout;
  async function ingest(raw,signature){const e=provider.verifyEvent(raw,signature);
    if(e.livemode!==!config.sandbox||(e.account&&e.account!==config.account))throw new CheckoutError('Payment environment mismatch.',400);
    if(!sessionTypes.has(e.type)&&!lifecycleTypes.has(e.type))return {received:true};
    const o=e.data?.object;if(!/^evt_[A-Za-z0-9_]+$/u.test(e.id??'')||!o||!refundTypes.has(e.type)&&o.livemode!==!config.sandbox)throw new CheckoutError('Invalid payment event.',400);
    if(sessionTypes.has(e.type)&&(o.metadata?.purpose!==purpose||o.metadata?.environment!==config.mode))return {received:true};
    if(sessionTypes.has(e.type)&&(!uuid.test(o.metadata?.order??'')||o.client_reference_id!==o.metadata.order))throw new CheckoutError('Invalid order binding.',400);
    // Retain only the identifiers necessary for reconciliation, not the raw
    // provider object (which can contain addresses or payment-method details).
    const payload={paymentIntent:typeof o.payment_intent==='string'?o.payment_intent:o.payment_intent?.id,
      charge:typeof o.charge==='string'?o.charge:o.charge?.id,policyHash:o.metadata?.policy_hash??null};
    const args=[e.id,o.id,e.type,sessionTypes.has(e.type)?o.metadata.order:null,JSON.stringify(payload),now()];
    const saved=(await db.query('INSERT INTO fw_events(id,object_id,event_type,attempt,payload,created_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET id=EXCLUDED.id RETURNING *',args)).rows[0];
    const expected=JSON.parse(args[4]);
    if(saved.object_id!==o.id||saved.event_type!==e.type||sessionTypes.has(e.type)&&saved.attempt!==args[3]||Object.keys({...saved.payload,...expected}).some(k=>saved.payload[k]!==expected[k]))throw new CheckoutError('Conflicting event identity.',400);
    return {received:true};
  }
  async function claim(table){if(!['fw_events','fw_reconcile','fw_outbox','fw_refunds'].includes(table))throw Error('unknown_queue');
    return db.transaction(async tx=>{const r=(await tx.query(`SELECT * FROM ${table} WHERE status='pending' AND retry_at<=$1 AND lease_until<=$1 ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1`,[now()])).rows[0];
      if(!r)return null;const lease=randomUUID();await tx.query(`UPDATE ${table} SET lease=$2,lease_until=$3,tries=tries+1 WHERE id=$1`,[r.id,lease,now()+LEASE_MS]);return {...r,lease,tries:r.tries+1};});}
  async function finish(table,r,status,code=null,delay=0){await db.query(`UPDATE ${table} SET status=$3,last_code=$4,retry_at=$5,lease=NULL,lease_until=0 WHERE id=$1 AND lease=$2`,[r.id,r.lease,status,code,now()+delay]);}
  async function confirm(row,proof){if(!proof.paid||!/^pi_[A-Za-z0-9_]+$/u.test(proof.intent??''))return false;
    return db.transaction(async tx=>{const saved=(await tx.query('SELECT * FROM fw_orders WHERE id=$1 FOR UPDATE',[row.id])).rows[0];
      if(saved.payment_status!=='pending')return true;
      if(!saved.payment_id||saved.terms.hash!==config.policyHash)throw Error('frozen_order_binding_required');
      await tx.query("UPDATE fw_orders SET payment_status='paid',payment_intent=$2,fulfillment='awaiting-scheduling',version=version+1 WHERE id=$1",[row.id,proof.intent]);
      if(crm)await crm.enqueue(tx,saved,proof.intent);
      const text=`Order ${row.number}: ${row.quote.label}${row.quote.stacking?' with stacking':''}. Total ${money(row.quote.totalCents)}. Delivery is free.\nUse confirmed: personal household use at the delivery address.\nAngel will contact you with a delivery date within one week of ordering. Call (540) 388-8715 for more specific scheduling.\nCancel at least 48 hours before the start of the agreed delivery window for a full refund. Less notice is non-refundable. Full refunds also apply before scheduling, if Angel cancels or cannot fulfil, or if you decline a reschedule initiated by Angel.`;
      for(const audience of ['customer','owner']){const message={to:audience==='customer'?row.contact.email:'info@angeltreeservice.org',replyTo:'info@angeltreeservice.org',
        subject:`${config.sandbox?'SANDBOX — ':''}Firewood order ${row.number}`,text:audience==='customer'?text:text+`\nCustomer: ${row.contact.name}\n${row.contact.phone}\n${row.contact.email}\n${row.contact.address} ${row.contact.address2}, ${row.contact.city}, ${row.contact.state} ${row.contact.postal}\nAccess notes: ${row.contact.notes}`};
        await tx.query('INSERT INTO fw_outbox(id,order_id,audience,message) VALUES($1,$2,$3,$4) ON CONFLICT(order_id,audience) DO NOTHING',[randomUUID(),row.id,audience,JSON.stringify(message)]);}
      await audit(tx,row.id,'payment-confirmed',{paymentIntent:proof.intent,totalCents:row.quote.totalCents});return true;});}
  async function reconcile(r){let row=await order(r.id);if(!row)throw Error('missing_order');if(row.payment_status!=='pending')return 'done';
    row=await checkout.ensurePayment(row);const proof=await provider.state(row);if(proof.paid){await confirm(row,proof);return 'done';}return proof.expired?'expired':'pending';}
  async function event(r){if(sessionTypes.has(r.event_type)){let row=await order(r.attempt);if(!row)throw Error('order_not_available');
      if(row.terms.hash!==r.payload.policyHash||row.payment_id&&row.payment_id!==r.object_id)throw Error('event_binding_conflict');
      const proof=await provider.state({...row,payment_id:r.object_id});
      if(!row.payment_id){await db.query('UPDATE fw_orders SET payment_id=$2 WHERE id=$1 AND payment_id IS NULL',[row.id,r.object_id]);row=await order(row.id);}
      if(proof.paid){await confirm(row,proof);await db.query("UPDATE fw_reconcile SET status='done' WHERE id=$1",[row.id]);}
      // Unpaid completion must remain eligible for delayed success/reconciliation.
      return 'done';
    }
    const object={id:r.object_id,charge:r.payload.charge,payment_intent:r.payload.paymentIntent};
    const binding=await provider.lifecycleOrder({type:r.event_type,data:{object}});if(!binding)return 'ignored';
    let row=await order(binding.id);if(row&&row.payment_status==='pending'&&row.payment_id){const proof=await provider.state(row);if(proof.paid){await confirm(row,proof);row=await order(row.id);}}
    if(!row||row.payment_intent!==binding.intent)throw Error('lifecycle_waiting_for_order_binding');
    return db.transaction(async tx=>{const current=(await tx.query('SELECT * FROM fw_orders WHERE id=$1 FOR UPDATE',[row.id])).rows[0];
      if(current.payment_intent!==binding.intent)throw Error('lifecycle_order_binding_mismatch');
      if(refundTypes.has(r.event_type)){
        const job=(await tx.query('SELECT * FROM fw_refunds WHERE order_id=$1 FOR UPDATE',[row.id])).rows[0];
        let proof=await provider.refundState(current,{provider_id:r.object_id});
        const matched=job&&(job.provider_id===proof.id||job.id===proof.operation);
        if(matched){proof=await provider.refundState(current,{...job,provider_id:proof.id});
          const status=proof.status==='succeeded'?'done':proof.status==='pending'?'pending':'review';
          await tx.query('UPDATE fw_refunds SET provider_id=$2,status=$3,last_code=$4,retry_at=$5,lease=NULL,lease_until=0 WHERE id=$1',
            [job.id,proof.id,status,status==='review'?'refund_status_review_required':null,now()+60000]);}
        await tx.query('UPDATE fw_events SET attempt=$2 WHERE id=$1',[r.id,current.id]);
        if(proof.status==='succeeded'){
          const total=await provider.lifecycle({type:'charge.refunded',data:{object:{id:proof.charge}}},current);
          await applyRefund(tx,current,total.refundCents);
          if(total.refundCents===current.quote.totalCents)await tx.query("UPDATE fw_events SET status='done',last_code=NULL WHERE attempt=$1 AND status='review' AND last_code='refund_status_review_required'",[current.id]);
        }
        await audit(tx,current.id,'refund-status',{refundId:proof.id,status:proof.status});
        if(crm)await crm.enqueue(tx,current,current.payment_intent);
        if(['failed','canceled','requires_action'].includes(proof.status))return matched?'done':{status:'review',code:'refund_status_review_required'};
        return !matched&&proof.status==='pending'?'pending':'done';
      }
      // Read mutable provider state after taking this order's lock, so another
      // worker cannot commit a newer dispute state before this snapshot lands.
      const proof=await provider.lifecycle({type:r.event_type,data:{object}},current);
      if(proof.refundCents!==undefined){await applyRefund(tx,current,proof.refundCents);await tx.query('UPDATE fw_events SET attempt=$2 WHERE id=$1',[r.id,current.id]);}
      if(proof.disputed!==undefined)await tx.query('UPDATE fw_orders SET disputed=$2,version=version+1 WHERE id=$1',[row.id,proof.disputed]);
      await audit(tx,row.id,'payment-lifecycle',{type:r.event_type,...proof});
      if(crm)await crm.enqueue(tx,current,current.payment_intent);
      return proof.refundNeedsReview?{status:'review',code:'refund_status_review_required'}:proof.refundPending?'pending':'done';});
  }
  async function applyRefund(tx,row,cents){if(!Number.isInteger(cents)||cents<0||cents>row.quote.totalCents)throw Error('invalid_refund_amount');
    // Preserve confirmed history. A later failed/requires-action refund is
    // represented by explicit review state rather than silently charging again.
    const amount=Math.max(row.refund_cents,cents);await tx.query("UPDATE fw_orders SET refund_cents=$2,payment_status=CASE WHEN $2=(quote->>'totalCents')::int THEN 'refunded' ELSE payment_status END,version=version+1 WHERE id=$1",[row.id,amount]);}
  async function refund(r){return db.transaction(async tx=>{
    const row=(await tx.query('SELECT * FROM fw_orders WHERE id=$1 FOR UPDATE',[r.order_id])).rows[0];
    const job=(await tx.query('SELECT * FROM fw_refunds WHERE id=$1 FOR UPDATE',[r.id])).rows[0];
    if(!row||!job||job.lease!==r.lease||row.fulfillment!=='cancelled'||row.quote.totalCents!==job.amount||!row.payment_intent||row.disputed&&!job.provider_id)throw Error('refund_review_required');
    if(!job.provider_id&&row.payment_status==='refunded')return 'done';
    if(!job.provider_id&&now()-Number(job.created_at)>=CREATE_MS)return 'review';
    const proof=job.provider_id?await provider.refundState(row,job):await provider.refund(row,job);
    await tx.query('UPDATE fw_refunds SET provider_id=$2 WHERE id=$1',[job.id,proof.id]);
    if(proof.status==='succeeded')await applyRefund(tx,row,job.amount);
    await audit(tx,row.id,job.provider_id?'refund-status':'refund-submitted',{operation:job.id,providerId:proof.id,status:proof.status});
    if(crm)await crm.enqueue(tx,row,row.payment_intent);
    return proof.status==='succeeded'?'done':proof.status==='pending'?'pending':{status:'review',code:'refund_status_review_required'};
  });}
  async function email(r){if(!config.emailEnabled&&!mailer)return config.sandbox?'captured':'pending';
    if(!mailer||!config.sandbox&&!config.emailEnabled)throw Error('customer_sending_not_approved');
    if(r.first_send!==null&&now()-Number(r.first_send)>=CREATE_MS)return 'review';
    const first=Number(r.first_send??now());await db.query('UPDATE fw_outbox SET first_send=COALESCE(first_send,$2) WHERE id=$1 AND lease=$3',[r.id,first,r.lease]);
    const id=await mailer.send(r.message,'fw-confirmation-'+r.id);await db.query('UPDATE fw_outbox SET provider_id=$2 WHERE id=$1 AND lease=$3',[r.id,id,r.lease]);return 'accepted';}
  async function work({limit=20}={}){if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('bounded_worker_required');await provider.verifyAccount();
    await db.query('INSERT INTO fw_heartbeat(id,started) VALUES(true,$1) ON CONFLICT(id) DO UPDATE SET started=$1,finished=NULL',[now()]);
    const results={done:0,retry:0,review:0};const deadline=Date.now()+120000;
    for(const [table,fn] of [['fw_events',event],['fw_reconcile',reconcile],['fw_refunds',refund],['fw_outbox',email]]){
      for(let i=0;i<limit&&Date.now()<deadline;i++){const row=await claim(table);if(!row)break;
        try{const value=await fn(row),status=typeof value==='string'?value:value.status,code=typeof value==='string'?null:value.code;
          await finish(table,row,status,code??(status==='review'?'owner_review_required':null),status==='pending'?60000:0);results[status==='review'?'review':'done']++;}
        catch(error){const permission=error.statusCode===403||error.type==='StripePermissionError';
          const conflict=['payment_order_binding_mismatch','event_binding_conflict','frozen_order_binding_required','refund_order_binding_mismatch','lifecycle_order_binding_mismatch','candidate_stripe_account_mismatch','refund_total_review_required'].includes(error.message);
          const review=permission||conflict||row.tries>=12||(table==='fw_refunds'&&!row.provider_id&&now()-Number(row.created_at)>=CREATE_MS);
          await finish(table,row,review?'review':'pending',permission?'provider_permission_required':conflict?'binding_review_required':'operation_pending_review',Math.min(3600000,1000*2**Math.min(row.tries,10)));results[review?'review':'retry']++;}
      }
    }
    if(crm)results.crm=await crm.queue.work({limit});
    await db.query('UPDATE fw_heartbeat SET finished=$1 WHERE id=true',[now()]);return results;}
  async function status(){const queues={},alerts=[];for(const table of ['fw_events','fw_reconcile','fw_refunds','fw_outbox',...(crm?['fw_crm_sync']:[])]){queues[table]=(await db.query(`SELECT status,count(*)::int AS n FROM ${table} GROUP BY status`)).rows;
      if(queues[table].some(q=>q.status==='review'&&q.n>0))alerts.push(table+':owner-review');}
    const heartbeat=await one('SELECT * FROM fw_heartbeat WHERE id=true');
    const progress=Math.max(Number(heartbeat?.started)||0,Number(heartbeat?.finished)||0);
    if(!progress||now()-progress>120000)alerts.push('worker:stale');
    if(!config.sandbox&&!config.emailEnabled)alerts.push('email:disabled');
    return {sandbox:config.sandbox,queues,heartbeat,alerts};}
  return {ingest,work,status,confirm};
}
