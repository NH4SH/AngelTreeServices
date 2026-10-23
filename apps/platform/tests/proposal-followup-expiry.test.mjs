import assert from 'node:assert/strict';
import test from 'node:test';
import {communicationReadFixture} from './communication-read-fixture.mjs';
import {appointmentQueueFixture} from './appointment-queue-fixture.mjs';

const quote = (expires_at, id = 'synthetic-quote') => ({
  id, customer_id:'synthetic-customer', organization_id:null, status:'sent',
  quote_number:'SYNTHETIC-EXPIRY', automatic_follow_ups_enabled:true, expires_at,
  sent_at:new Date().toISOString(), updated_at:new Date().toISOString(), quote_line_items:[],
  customers:{id:'synthetic-customer',email:'synthetic@example.invalid',status:'active'}, organizations:null,
});
const worker = (expiresAt, row = {}) => communicationReadFixture({
  type:'quote_follow_up', row:{quote_id:'synthetic-quote',...row}, tables:{quotes:[quote(expiresAt)]},
});

test('past proposal deadlines cancel a queued follow-up without a provider call or source mutation', async () => {
  const f = worker(new Date(Date.now()-60_000).toISOString());
  const source = structuredClone(f.tables.quotes);
  const result = await f.run();
  assert.equal(result.status,'cancelled');
  assert.equal(result.outcome,'not_sent');
  assert.match(result.message,/proposal has expired/);
  assert.equal(f.sent.length,0);
  assert.deepEqual(f.tables.quotes,source);
  await f.run();
  assert.equal(f.sent.length,0);
});

test('the exact deadline is closed, without creating a new grace period', async () => {
  const original = Date.now, now = original();
  Date.now = () => now;
  try {
    const f = worker(new Date(now).toISOString());
    assert.equal((await f.run()).status,'cancelled');
    assert.equal(f.sent.length,0);
  } finally { Date.now = original; }
});

test('future and undated proposals retain existing content, stable delivery identity and one send', async () => {
  for (const expiresAt of [new Date(Date.now()+86_400_000).toISOString(),null,undefined]) {
    const f = worker(expiresAt);
    assert.equal((await f.run()).outcome,'accepted');
    assert.equal(f.sent.length,1);
    assert.equal(f.sent[0].idempotencyKey,'customer-communication/'+f.row.id);
    assert.equal(f.sent[0].relatedQuoteId,'synthetic-quote');
    await f.run();
    assert.equal(f.sent.length,1);
  }
});

test('unusable expiry data fails safely without sending or copying the backend value', async () => {
  const f = worker('PRIVATE_SYNTHETIC_INVALID_EXPIRY');
  const result = await f.run();
  assert.equal(result.status,'failed');
  assert.equal(f.sent.length,0);
  assert.doesNotMatch(JSON.stringify([result,f.row]),/PRIVATE_SYNTHETIC/);
});

test('already accepted or uncertain follow-ups are not reprocessed after expiry', async () => {
  for (const status of ['sent','failed','processing']) {
    const f = worker('2020-01-01T00:00:00Z',{status});
    const before = structuredClone(f.row);
    await f.run();
    assert.deepEqual(f.row,before);
    assert.equal(f.reads.includes('quotes'),false);
    assert.equal(f.sent.length,0);
  }
});

test('automatic planning omits expired proposals and preserves both stages for future/undated sources', async () => {
  const rows = [quote('2020-01-01T00:00:00Z','expired'),quote(new Date(Date.now()+86_400_000).toISOString(),'future'),quote(null,'undated')];
  const f = appointmentQueueFixture({settings:{quote_follow_up_enabled:true,quote_first_follow_up_days:3,quote_second_follow_up_days:7},tables:{schedule_events:[],quotes:rows}});
  assert.equal((await f.run()).error,null);
  assert.equal(f.upserts.length,4);
  assert.deepEqual([...new Set(f.upserts.map(r=>r.quote_id))].sort(),['future','undated']);
  const count = f.tables.customer_communications.length;
  await f.run();
  assert.equal(f.tables.customer_communications.length,count);
});

test('a proposal expiring after planning is cancelled at processing without changing its financial/state record', async () => {
  const f = worker(new Date(Date.now()+86_400_000).toISOString());
  f.tables.quotes[0].expires_at = '2020-01-01T00:00:00Z';
  const before = structuredClone(f.tables.quotes);
  assert.equal((await f.run()).status,'cancelled');
  assert.deepEqual(f.tables.quotes,before);
  assert.equal(f.sent.length,0);
});
