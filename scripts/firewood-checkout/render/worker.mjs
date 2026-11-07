import { randomUUID } from 'node:crypto';
import { CheckoutError } from '../model.mjs';
import { drainControlledEmail } from '../email-worker.mjs';
import { LEASE_MS, CREATE_WINDOW_MS, tokenPattern, ACCOUNT_ID } from './config.mjs';

const types = new Set(['checkout.session.completed','checkout.session.async_payment_succeeded']);
class ReviewError extends Error {}

export function createHostedWorker({ checkout, provider, config, mailer = null, now = Date.now }) {
  if (config.emailEnabled && !mailer) throw new Error('controlled_mailer_required');
  const {db,store} = checkout;
  async function ingest(raw,signature) {
    const event = provider.verifyEvent(raw,signature,config.webhookSecret);
    if (event.livemode !== false || (event.account && event.account !== ACCOUNT_ID)) throw new CheckoutError('Non-sandbox event refused.',400);
    if (!types.has(event.type)) return {received:true};
    const object = event.data?.object;
    if (object?.metadata?.purpose !== 'firewood_test_only') return {received:true};
    if (!/^evt_[A-Za-z0-9_]+$/u.test(event.id ?? '') || object.livemode !== false ||
        !/^cs_test_[A-Za-z0-9_]+$/u.test(object.id ?? '') || !tokenPattern.test(object.metadata?.attempt ?? '') ||
        !tokenPattern.test(object.client_reference_id ?? '')) throw new CheckoutError('Invalid Firewood test event.',400);
    await checkout.rate('webhook',100);
    const args = [event.id,object.metadata.attempt,object.id,object.client_reference_id,event.type,now()];
    const row = (await db.query(`INSERT INTO firewood_render_events(id,attempt,session_id,reference,event_type,received_at)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET id=EXCLUDED.id RETURNING *`,args)).rows[0];
    if (row.attempt !== args[1] || row.session_id !== args[2] || row.reference !== args[3] || row.event_type !== args[4]) throw new CheckoutError('Conflicting test event refused.',400);
    // Durable inbox commit precedes HTTP 200. Stripe reads/confirmation/email
    // happen in the scheduled worker, independent of the browser return.
    return {received:true};
  }
  async function claim(table,key) {
    if (!['firewood_render_events','firewood_render_reconciliation'].includes(table) || !['id','attempt'].includes(key)) throw new Error('invalid_worker_queue');
    return db.transaction(async tx => {
      const row = (await tx.query(`SELECT * FROM ${table} WHERE status='pending' AND retry_at <= $1 AND lease_until <= $1
        ORDER BY ${key} FOR UPDATE SKIP LOCKED LIMIT 1`,[now()])).rows[0];
      if (!row) return null;
      const lease = randomUUID();
      await tx.query(`UPDATE ${table} SET lease_id=$2,lease_until=$3,tries=tries+1 WHERE ${key}=$1`,[row[key],lease,now()+LEASE_MS]);
      return {...row,lease,tries:row.tries+1};
    });
  }
  async function finish(table,key,row,status,code = null,delay = 0) {
    await db.query(`UPDATE ${table} SET status=$3,last_code=$4,retry_at=$5,lease_id=NULL,lease_until=0 WHERE ${key}=$1 AND lease_id=$2`,
      [row[key],row.lease,status,code,now()+delay]);
  }
  async function eventWork(row) {
    const record = await store.attempt(row.attempt);
    if (!record) throw new Error('attempt_not_available_yet');
    if (record.crm_binding || record.reference !== row.reference || (record.payment_id && record.payment_id !== row.session_id)) throw new ReviewError('binding_conflict');
    const proof = await provider.state(row.session_id,record.quote.totalCents,record.reference,record.id);
    if (proof.paid) {
      await store.bindPayment(record.id,{id:row.session_id,url:record.payment_url});
      await store.confirm(record.id,row.session_id,'webhook',row.id,proof);
      await db.query("UPDATE firewood_render_reconciliation SET status='done',last_code=NULL WHERE attempt=$1",[record.id]);
    }
  }
  async function reconcile(row) {
    let record = await store.attempt(row.attempt);
    if (!record || record.crm_binding) throw new ReviewError('binding_conflict');
    if (record.status === 'paid') return 'done';
    if (!record.payment_id && now()-Number(record.created_at) >= CREATE_WINDOW_MS) throw new ReviewError('creation_window_expired');
    record = await checkout.ensurePayment(record);
    record = await checkout.verify(record,'reconciliation');
    return record.status === 'paid'?'done':record.paymentState.expired?'expired':'pending';
  }
  async function work({limit = 8} = {}) {
    if (!Number.isInteger(limit) || limit<1 || limit>20) throw new Error('invalid_worker_limit');
    await provider.verifyAccount();
    await db.query(`INSERT INTO firewood_render_heartbeat(id,started_at) VALUES('worker',$1)
      ON CONFLICT(id) DO UPDATE SET started_at=$1,finished_at=NULL,last_code=NULL`,[now()]);
    const result = {events:0,reconciled:0,retry:0,review:0,email:{disabled:true,accepted:0,review:0}};
    const deadline=now()+120000;
    try {
      for (const [table,key,operation] of [['firewood_render_events','id',eventWork],['firewood_render_reconciliation','attempt',reconcile]]) {
        for (let i=0;i<limit && now()<deadline;i++) {
          const row = await claim(table,key);
          if (!row) break;
          try {
            const status = await operation(row) ?? 'done';
            await finish(table,key,row,status,null,status==='pending'?300000:0);
            if (key==='id') result.events++; else result.reconciled++;
          } catch (error) {
            const review = error instanceof ReviewError || (key==='id' && (row.tries>=10 || now()-Number(row.received_at)>=CREATE_WINDOW_MS));
            await finish(table,key,row,review?'review':'pending',error instanceof ReviewError?error.message:'verification_pending',
              Math.min(300000,30000*2**Math.min(row.tries-1,4)));
            result[review?'review':'retry']++;
          }
        }
      }
      await db.query('DELETE FROM firewood_render_sessions WHERE expires <= $1 AND lease_until <= $1',[now()]);
      await db.query('DELETE FROM firewood_render_access WHERE expires <= $1',[now()]);
      if(config.emailEnabled) {
        result.email={accepted:0,review:0};
        for(let i=0;i<8 && now()<deadline;i++) {
          const batch=await drainControlledEmail(db,mailer,{now,budgetLimit:16});
          result.email.accepted+=batch.accepted;result.email.review+=batch.review;
          if(!batch.accepted&&!batch.review)break;
        }
      }
      await db.query("UPDATE firewood_render_heartbeat SET finished_at=$1,last_code=$2 WHERE id='worker'",[now(),result.review||result.retry||result.email.review?'review_or_retry_pending':null]);
      return result;
    } catch (error) {
      await db.query("UPDATE firewood_render_heartbeat SET last_code='worker_failed' WHERE id='worker'").catch(()=>{});
      throw error;
    }
  }
  async function status() {
    const heartbeat = (await db.query("SELECT * FROM firewood_render_heartbeat WHERE id='worker'")).rows[0];
    const counts = (await db.query(`SELECT
      (SELECT count(*)::int FROM firewood_render_events WHERE status='review') AS event_review,
      (SELECT count(*)::int FROM firewood_render_reconciliation WHERE status='review') AS payment_review,
      (SELECT count(*)::int FROM firewood_test_email_delivery WHERE status='review') AS email_review,
      (SELECT min(received_at) FROM firewood_render_events WHERE status='pending') AS oldest_event,
      (SELECT min(o.paid_at) FROM firewood_test_attempts o JOIN firewood_test_outbox b ON b.attempt=o.id
        JOIN firewood_test_email_delivery d ON d.id=b.id WHERE d.status='pending') AS oldest_email`)).rows[0];
    const stale = !heartbeat?.finished_at || now()-Number(heartbeat.finished_at)>600000;
    const overdue = [counts.oldest_event,config.emailEnabled?counts.oldest_email:null].some(value=>value!==null && now()-Number(value)>600000);
    return {testOnly:true,healthy:!stale&&!overdue&&!heartbeat?.last_code&&!counts.event_review&&!counts.payment_review&&!counts.email_review,
      stale,overdue,review:counts.event_review+counts.payment_review+counts.email_review,emailEnabled:config.emailEnabled};
  }
  return {ingest,work,status};
}
