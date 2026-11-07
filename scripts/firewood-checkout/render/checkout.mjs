import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { createOrderStore } from '../store-core.mjs';
import { validateOrder, catalog, CheckoutError } from '../model.mjs';
import { SESSION_MS, LEASE_MS, CREATE_WINDOW_MS, tokenPattern } from './config.mjs';

export const token = () => randomBytes(24).toString('hex');
export const digest = value => createHash('sha256').update(value).digest('hex');
export function equal(a, b) {
  const x = Buffer.from(typeof a === 'string' ? a : ''), y = Buffer.from(typeof b === 'string' ? b : '');
  return x.length === y.length && timingSafeEqual(x,y);
}
const fingerprint = order => JSON.stringify({ quote: Object.entries(order.quote).sort(), contact: Object.entries(order.contact).sort() });
export const receiptFor = row => ({ ...row.quote, orderNumber: row.order_number, confirmedBy: row.confirmed_by });

export function paymentLink(payment) {
  let url;
  try { url = new URL(payment?.url); } catch { throw new CheckoutError('The test payment link could not be verified.',502); }
  if (!/^cs_test_[A-Za-z0-9_]+$/u.test(payment?.id ?? '') || url.origin !== 'https://checkout.stripe.com' ||
      url.username || url.password || !url.pathname.includes(payment.id)) throw new CheckoutError('The test payment link could not be verified.',502);
  return url.href;
}

export function createHostedCheckout({ db, config, provider, now = Date.now }) {
  const store = createOrderStore(db, { now, controlledEmail: true });
  const one = async (sql,params) => (await db.query(sql,params)).rows[0] ?? null;
  async function rate(name, limit, window = 60000) {
    const row = await one(`INSERT INTO firewood_render_rate(id,window_start,used) VALUES($1,$2,1)
      ON CONFLICT(id) DO UPDATE SET window_start=CASE WHEN firewood_render_rate.window_start <= $3 THEN $2 ELSE firewood_render_rate.window_start END,
      used=CASE WHEN firewood_render_rate.window_start <= $3 THEN 1 ELSE firewood_render_rate.used+1 END
      WHERE firewood_render_rate.window_start <= $3 OR firewood_render_rate.used < $4 RETURNING used`, [name,now(),now()-window,limit]);
    if (!row) throw new CheckoutError('The QA service is busy. Please wait a minute and try again.',429);
  }
  async function login(value) {
    await rate('login',20);
    if (!equal(value,config.accessToken)) throw new CheckoutError('The QA access code was not accepted.',401);
    const id = token();
    await db.query('INSERT INTO firewood_render_access(id,expires) VALUES($1,$2)',[digest(id),now()+4*60*60*1000]);
    return id;
  }
  async function authorized(value) {
    return tokenPattern.test(value ?? '') && !!await one('SELECT id FROM firewood_render_access WHERE id=$1 AND expires > $2',[digest(value),now()]);
  }
  async function session(id, create = false) {
    let row = tokenPattern.test(id ?? '') ? await one('SELECT * FROM firewood_render_sessions WHERE id=$1 AND expires > $2',[id,now()]) : null;
    if (!row && create) {
      await rate('sessions',60);
      row = {id:token(),csrf:token(),expires:now()+SESSION_MS,attempt:null};
      await db.query('INSERT INTO firewood_render_sessions(id,csrf,expires) VALUES($1,$2,$3)',[row.id,row.csrf,row.expires]);
    }
    if (!row) throw new CheckoutError('This test session expired. Reload the checkout and try again.',403);
    return row;
  }
  async function csrf(id, value) {
    const saved = await session(id);
    if (!equal(value,saved.csrf)) throw new CheckoutError('This test session expired. Reload the checkout and try again.',403);
    return saved;
  }
  async function claim(id,value) {
    const saved = await csrf(id,value), lease = token();
    const row = await one(`UPDATE firewood_render_sessions SET lease_id=$2,lease_until=$3
      WHERE id=$1 AND expires > $4 AND lease_until <= $4 RETURNING *`,[id,lease,now()+LEASE_MS,now()]);
    if (!row) throw new CheckoutError('The test payment is opening. Wait before trying again or changing your order.',409);
    return {...saved,...row,lease};
  }
  async function fenced(operation, callback) {
    return db.transaction(async tx => {
      const row = (await tx.query('SELECT * FROM firewood_render_sessions WHERE id=$1 FOR UPDATE',[operation.id])).rows[0];
      if (!row || row.lease_id !== operation.lease || Number(row.lease_until) <= now() || Number(row.expires) <= now()) throw new CheckoutError('Reload to check the saved payment before trying again.',409);
      return callback(tx,row);
    });
  }
  async function freshAttempt(operation,order) {
    return fenced(operation,async tx => {
      const used = (await tx.query("UPDATE firewood_render_limits SET used=used+1 WHERE id='attempts' AND used<8 RETURNING used")).rows[0];
      if (!used) throw new CheckoutError('This QA batch has reached its eight-attempt limit. Ask the owner to review the results.',409);
      const id = token();
      const row = (await tx.query(`INSERT INTO firewood_test_attempts(id,reference,order_number,quote,contact,created_at)
        VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[id,operation.id,`FW-TEST-${id.slice(0,16).toUpperCase()}`,JSON.stringify(order.quote),JSON.stringify(order.contact),now()])).rows[0];
      await tx.query('INSERT INTO firewood_render_reconciliation(attempt,retry_at) VALUES($1,$2)',[id,now()+60000]);
      await tx.query('UPDATE firewood_render_sessions SET attempt=$2 WHERE id=$1',[operation.id,id]);
      return row;
    });
  }
  async function ensurePayment(row) {
    if (row.crm_binding) throw new Error('crm_binding_refused');
    if (row.status === 'paid') return row;
    // Missing browser navigation is not an uncertain payment creation. A known
    // Session must always remain verifiable, even after idempotency retention.
    if (!row.payment_id) {
      if (now()-Number(row.created_at) >= CREATE_WINDOW_MS) throw new CheckoutError('This older test payment needs owner review before another payment can open.',409);
      const payment = await provider.create({quote:row.quote,contact:row.contact},config.origin,row.reference,row.id);
      paymentLink(payment);
      await store.bindPayment(row.id,payment);
      row = await store.attempt(row.id);
    }
    return row;
  }
  async function verify(row,source = 'return-verification') {
    if (!row || row.crm_binding || row.status === 'paid' || !row.payment_id) return row;
    const proof = await provider.state(row.payment_id,row.quote.totalCents,row.reference,row.id);
    if (proof.paid) {
      await store.confirm(row.id,row.payment_id,source,null,proof);
      await db.query("UPDATE firewood_render_reconciliation SET status='done',last_code=NULL WHERE attempt=$1",[row.id]);
      row = await store.attempt(row.id);
    }
    return {...row,paymentState:proof};
  }
  async function state(id, doVerify = false) {
    const saved = await session(id);
    let row = saved.attempt ? await store.attempt(saved.attempt) : null;
    if (row && row.reference !== id) throw new CheckoutError('This order belongs to another test session.',403);
    if (doVerify) row = await verify(row);
    const paid = row?.status === 'paid';
    return {csrf:saved.csrf,catalog,processor:'stripe-test',confirmationMode:'controlled-email',storageLocation:'isolated-hosted-qa',
      status:paid?'paid':row?'pending':'draft',order:row&&!paid?{quote:row.quote,contact:row.contact}:null,receipt:paid?receiptFor(row):null,crm:null};
  }
  async function start(id,input) {
    const order = validateOrder(input);
    if (!/@[^@\s]+\.invalid$/iu.test(order.contact.email)) throw new CheckoutError('Use a made-up email ending in .invalid for this QA checkout.',400,'email');
    const operation = await claim(id,input.csrf);
    try {
      let row = operation.attempt ? await store.attempt(operation.attempt) : null;
      if (row && row.reference !== id) throw new CheckoutError('This order belongs to another test session.',403);
      if (row) {
        // Recover a possibly accepted create call with the original idempotency
        // key before rotating a quote or making a replacement payment.
        row = await ensurePayment(row);
        row = await verify(row,'retry-verification');
        if (row.status === 'paid') return {next:'/firewood/checkout/result/'};
        if (row.paymentState.closed && !row.paymentState.expired) throw new CheckoutError('This payment is still processing. Wait for confirmation before trying again.',409);
        const changed = fingerprint(order) !== fingerprint({quote:row.quote,contact:row.contact});
        if (changed && !row.paymentState.expired) {
          try { await provider.expire(row.payment_id); } catch { /* A concurrent payment may have completed. Verify before replacing it. */ }
          row = await verify(row,'retry-verification');
          if (row.status === 'paid') return {next:'/firewood/checkout/result/'};
          if (!row.paymentState.expired) throw new CheckoutError('The previous payment could not be closed. Your details are saved; check its status before trying again.',409);
        }
        if (changed || row.paymentState.expired) row = await freshAttempt(operation,order);
      } else row = await freshAttempt(operation,order);
      row = await ensurePayment(row);
      await fenced(operation,async () => {});
      row = await store.attempt(row.id);
      if (row.status !== 'paid' && !row.payment_url) {
        const payment = await provider.link(row.payment_id,row.quote.totalCents,row.reference,row.id);
        if (payment.id !== row.payment_id) throw new CheckoutError('The saved test payment link did not match.',502);
        paymentLink(payment);
        await store.bindPayment(row.id,payment);
        row = await store.attempt(row.id);
      }
      await fenced(operation,async () => {});
      return {next:row.status === 'paid'?'/firewood/checkout/result/':paymentLink({id:row.payment_id,url:row.payment_url})};
    } finally {
      await db.query('UPDATE firewood_render_sessions SET lease_id=NULL,lease_until=0 WHERE id=$1 AND lease_id=$2',[id,operation.lease]).catch(()=>{});
    }
  }
  async function reset(id,value) {
    await csrf(id,value);
    const row = await one('DELETE FROM firewood_render_sessions WHERE id=$1 AND lease_until <= $2 RETURNING id',[id,now()]);
    if (!row) throw new CheckoutError('Wait for the test payment step to finish loading.',409);
  }
  async function confirmation(id) {
    const saved = await session(id), row = saved.attempt ? await store.attempt(saved.attempt) : null;
    if (!row || row.status !== 'paid' || row.reference !== id) throw new CheckoutError('A paid test order is required.',403);
    const message = (await store.confirmations(row.id)).find(value=>value.audience==='customer');
    return {confirmation:message?.message ?? null,status:message?.status ?? 'pending'};
  }
  return {db,store,rate,login,authorized,session,csrf,start,state,reset,confirmation,ensurePayment,verify};
}
