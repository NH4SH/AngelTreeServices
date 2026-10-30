import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createIsolatedLiveDatabase } from '../live/isolated-database.mjs';
import { fixtureInput } from '../live/test-fixture.mjs';
import { officeFixture } from '../office-v2/test-fixture.mjs';
import { installOfficeOrderStore, officeOrders } from '../office-v2/orders.mjs';
import { installConfirmationStore, captureConfirmation, drainConfirmations, CONFIRMATION_WINDOW_MS } from './confirmations.mjs';
async function setup(t) {
  const db = await createIsolatedLiveDatabase(); t.after(() => db.stop()); const crm = officeFixture();
  await installOfficeOrderStore(db, crm.live, crm.office); await installConfirmationStore(db);
  await db.query('UPDATE fwofficev2_control SET paused=false');
  const orders = officeOrders({ db, live: crm.live, office: crm.office, now: crm.now });
  const session = await orders.session(null, true), input = { ...fixtureInput(), stacking: true, csrf: session.csrf };
  input.notes = 'Wheelbarrow beside garage.\nKeep both instruction lines.';
  await orders.start(session.cookie, input); const row = (await db.query('SELECT * FROM fwofficev2_orders')).rows[0];
  const freshStatus = async () => { const value = await orders.state(session.cookie);
    return value.verificationPending ? null : (await db.query('SELECT receipt FROM fwofficev2_observations WHERE id=$1', [row.id])).rows[0].receipt; };
  const paid = async () => { crm.source.observe('paid', { fee: 1800, channel: 'card' }); return freshStatus(); };
  return { db, crm, orders, session, row, freshStatus, paid, now: crm.now };
}
const rows = async f => (await f.db.query('SELECT * FROM fwofficev2_outbox ORDER BY kind')).rows;
test('fresh paid capture freezes two singular order messages with exact accepted price, fee and instructions', async t => {
  const f = await setup(t), receipt = await f.paid();
  await Promise.all([captureConfirmation(f.db,f.row.id,receipt,f.now),captureConfirmation(f.db,f.row.id,receipt,f.now)]);
  const outbox = await rows(f); assert.equal(outbox.length,2);
  for (const item of outbox) { assert.equal(item.status,'pending'); assert.match(item.message.text,/Order subtotal: \$600.00/);
    assert.match(item.message.text,/Credit-card surcharge collected: \$18.00/); assert.match(item.message.text,/\$618.00/);
    assert.match(item.message.text,/Wheelbarrow beside garage.\nKeep both instruction lines./);
    assert.match(item.message.text,/separate payment receipt/); assert.match(item.idempotency_key,/^fw-order-v2-[a-f0-9]{64}$/); }
  assert.equal(outbox.find(x=>x.kind==='owner_order').recipient,'info@angeltreeservice.org');
  await assert.rejects(f.db.query("UPDATE fwofficev2_outbox SET recipient='other@checkout.invalid'"),/immutable_order_confirmation/);
  await assert.rejects(f.db.query('DELETE FROM fwofficev2_confirmations'),/immutable_office_history/);
});
test('stale paid capture after cancellation cannot queue a confirmation', async t => {
  const f = await setup(t), paid = await f.paid(); f.crm.hold('cancellation_requested'); await f.freshStatus();
  assert.deepEqual(await captureConfirmation(f.db,f.row.id,paid,f.now),{captured:false}); assert.equal((await rows(f)).length,0);
});
test('pending, refunded, credited, unknown and cancellation states do not send or fabricate confirmations', async t => {
  const f = await setup(t);
  assert.deepEqual(await captureConfirmation(f.db,f.row.id,await f.freshStatus(),f.now),{captured:false});
  const paid = await f.paid(); await captureConfirmation(f.db,f.row.id,paid,f.now);
  f.crm.hold('cancellation_requested'); f.crm.source.observe('refunded'); await f.freshStatus(); f.crm.credit();
  let sends=0; const result=await drainConfirmations({...f,admitted:async()=>true,mailer:{send(){sends++;assert.fail('Held order cannot send');}}});
  assert.equal(result.accepted,0); assert.equal(sends,0); assert.ok((await rows(f)).every(x=>x.status==='suppressed'));
});
test('unavailable status or closed sending/admission never reaches the email provider', async t => {
  const f=await setup(t);await captureConfirmation(f.db,f.row.id,await f.paid(),f.now);
  const mailer={send(){assert.fail('No provider call permitted');}};
  assert.equal((await drainConfirmations({...f,admitted:async()=>false,mailer})).held,true);
  assert.equal((await drainConfirmations({...f,admitted:async()=>true,mailer:null})).held,true);
  f.crm.unavailable(true);assert.equal((await drainConfirmations({...f,admitted:async()=>true,mailer})).accepted,0);
  assert.ok((await rows(f)).every(x=>x.first_send_at===null));
});
test('an accepted provider reply lost in transit retries the same message/key once without duplicate delivery', async t => {
  const f=await setup(t);await captureConfirmation(f.db,f.row.id,await f.paid(),f.now);
  const accepted=new Map(),attempts=[];let lose=true;
  const mailer={async send(message,key){attempts.push({message,key});if(!accepted.has(key))accepted.set(key,randomUUID());
    if(lose){lose=false;throw Error('Controlled lost reply');}return accepted.get(key);}};
  await drainConfirmations({...f,admitted:async()=>true,mailer,limit:1}); assert.equal(accepted.size,1);
  const first=(await rows(f)).find(x=>x.first_send_at!==null); f.crm.advance(6000);
  await drainConfirmations({...f,admitted:async()=>true,mailer,limit:2});
  assert.equal(accepted.size,2);assert.ok((await rows(f)).every(x=>x.status==='accepted'));
  assert.deepEqual(attempts[0],attempts[1]);const count=attempts.length;
  await drainConfirmations({...f,admitted:async()=>true,mailer}); assert.equal(attempts.length,count);
  await assert.rejects(f.db.query("UPDATE fwofficev2_outbox SET status='pending' WHERE status='accepted'"),/immutable_order_confirmation/);
  assert.equal((await rows(f)).find(x=>x.kind===first.kind).first_send_at,first.first_send_at);
});
test('provider idempotency age expiry requires review rather than minting a new identity', async t => {
  const f=await setup(t);await captureConfirmation(f.db,f.row.id,await f.paid(),f.now);
  let sends=0;const mailer={async send(){sends++;throw Error('Uncertain provider acceptance');}};
  await drainConfirmations({...f,admitted:async()=>true,mailer});assert.equal(sends,2);
  const before=(await rows(f)).map(x=>({key:x.idempotency_key,message:x.message,first:x.first_send_at}));
  f.crm.advance(CONFIRMATION_WINDOW_MS+1);await drainConfirmations({...f,admitted:async()=>true,mailer});assert.equal(sends,2);
  assert.ok((await rows(f)).every(x=>x.status==='review'));
  assert.deepEqual((await rows(f)).map(x=>({key:x.idempotency_key,message:x.message,first:x.first_send_at})),before);
});
test('parallel workers lease each message at most once and recheck admission before sending', async t => {
  const f=await setup(t);await captureConfirmation(f.db,f.row.id,await f.paid(),f.now);
  const calls=[];const mailer={async send(message,key){calls.push(key);return randomUUID();}};
  await Promise.all([drainConfirmations({...f,admitted:async()=>true,mailer}),drainConfirmations({...f,admitted:async()=>true,mailer})]);
  assert.equal(calls.length,2);assert.equal(new Set(calls).size,2);
});
