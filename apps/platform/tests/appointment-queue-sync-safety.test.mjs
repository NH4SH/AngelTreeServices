import assert from 'node:assert/strict';
import test from 'node:test';
import {appointmentQueueFixture} from './appointment-queue-fixture.mjs';

for (const kind of ['schedule_event','appointment']) {
  test(kind + ': an unsuccessful cleanup cannot report successful reminder preparation', async () => {
    for (const fault of ['error','throw','lost','lost-throw']) {
      const f = appointmentQueueFixture({kind,fault});
      const before = structuredClone(f.tables.customer_communications);
      const result = await f.run();
      assert.equal(result.created,0);
      assert.match(result.error,/reminders could not be reconciled/);
      assert.doesNotMatch(result.error,/PRIVATE_SYNTHETIC|57014/);
      assert.equal(f.upserts.length,0);
      if (['error','throw'].includes(fault)) assert.deepEqual(f.tables.customer_communications,before);
      else assert.ok(f.tables.customer_communications.filter(r => ['obsolete','legacy'].includes(r.id)).every(r => r.status === 'cancelled'));
      for (const row of before.filter(r => !['obsolete','legacy'].includes(r.id))) assert.deepEqual(f.tables.customer_communications.find(r => r.id === row.id),row);
    }
  });

  test(kind + ': real batch processing stops before claiming a delivery after cleanup failure', async () => {
    const f = appointmentQueueFixture({kind,fault:'error'});
    const result = await f.worker();
    assert.equal(result.claimed,0);
    assert.match(result.error,/synchronization could not be confirmed/);
    assert.equal(f.calls.some(c => c.rpc === 'claim_due_customer_communications'),false);
    assert.equal(f.upserts.length,0);
  });

  test(kind + ': accepted delivery keeps recovery pending until cleanup succeeds, without resending', async () => {
    const f = appointmentQueueFixture({kind,fault:'error'});
    const accepted = structuredClone(f.delivery);
    const first = await f.followups();
    assert.equal(first.ok,true);
    assert.equal(first.sourceReconciled,false);
    assert.equal(first.retryable,false);
    assert.match(first.message,/do not send the email again/);
    assert.equal(f.acks,0);
    assert.deepEqual(f.delivery,accepted);
    f.setFault(null);
    const repaired = await f.followups();
    assert.equal(repaired.sourceReconciled,true);
    assert.equal(f.acks,1);
    assert.equal(f.delivery.state,'accepted');
    assert.equal(f.delivery.provider_message_id,accepted.provider_message_id);
    const count = f.tables.customer_communications.length;
    assert.equal((await f.followups()).sourceReconciled,true);
    assert.equal(f.acks,1);
    assert.equal(f.tables.customer_communications.length,count);
  });

  test(kind + ': successful cleanup preserves current, nonpending and unrelated history and stable keys', async () => {
    const f = appointmentQueueFixture({kind});
    const preserved = structuredClone(f.tables.customer_communications.filter(r => !['obsolete','legacy'].includes(r.id)));
    assert.equal((await f.run()).error,null);
    assert.equal(f.upserts.length,2);
    for (const row of preserved) assert.deepEqual(f.tables.customer_communications.find(r => r.id === row.id),row);
    for (const row of f.tables.customer_communications.filter(r => ['obsolete','legacy'].includes(r.id))) assert.equal(row.status,'cancelled');
    const first = f.upserts.map(r => ({key:r.idempotency_key,type:r.communication_type,recipient:r.recipient_email,version:r.source_version}));
    const count = f.tables.customer_communications.length;
    assert.equal((await f.run()).error,null); // Zero obsolete rows is a valid, idempotent success.
    assert.deepEqual(f.upserts.slice(2).map(r => ({key:r.idempotency_key,type:r.communication_type,recipient:r.recipient_email,version:r.source_version})),first);
    assert.equal(f.tables.customer_communications.length,count);
  });

  test(kind + ': recovery after a lost cleanup acknowledgement is idempotent', async () => {
    const f = appointmentQueueFixture({kind,fault:'lost'});
    assert.ok((await f.run()).error);
    f.setFault(null);
    assert.equal((await f.run()).error,null);
    const count = f.tables.customer_communications.length;
    await f.run();
    assert.equal(f.tables.customer_communications.length,count);
  });

  test(kind + ': a later visit failure retains earlier cleanup but withholds the buffered family', async () => {
    const f = appointmentQueueFixture({kind,fault:'error',failCleanupAt:2});
    const first = f.tables[f.sourceTable][0];
    const second = {...first,id:'10000000-0000-4000-8000-000000000002',starts_at:new Date(Date.parse(first.starts_at) + 24 * 60 * 60_000).toISOString()};
    f.tables[f.sourceTable].push(second);
    assert.ok((await f.run()).error);
    assert.equal(f.upserts.length,0);
    assert.equal(f.tables.customer_communications.find(r => r.id === 'obsolete').status,'cancelled');
    f.setFault(null);
    assert.equal((await f.run()).error,null);
    assert.equal(f.upserts.length,4);
    const count = f.tables.customer_communications.length;
    await f.run();
    assert.equal(f.tables.customer_communications.length,count);
  });
}

test('coverage suppression and the automatic-sending OFF switch retain existing behavior', async () => {
  for (const kind of ['schedule_event','appointment']) {
    const held = appointmentQueueFixture({kind,settings:{appointment_change_notices_enabled:true},coverage:[{source_kind:kind,source_id:'10000000-0000-4000-8000-000000000001',suppress_reminder:true}]});
    assert.equal((await held.run()).error,null);
    assert.equal(held.upserts.length,0);
    const off = appointmentQueueFixture({kind,fault:'error',settings:{automated_sending_enabled:false}});
    assert.deepEqual(await off.run(),{created:0,error:null});
    assert.equal(off.calls.some(c => c.operation === 'update'),false);
  }
});

test('concurrent successful preparations preserve one queue row per stable key', async () => {
  const f = appointmentQueueFixture();
  await Promise.all([f.run(),f.run()]);
  const keys = f.tables.customer_communications.filter(r => r.idempotency_key).map(r => r.idempotency_key);
  assert.equal(keys.length,2);
  assert.equal(new Set(keys).size,2);
});
