import test from 'node:test';
import assert from 'node:assert/strict';
import { quoteEditFixture, other } from './quote-edit-confirmation-fixture.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));

test('independent preflight reads overlap, but no write starts before all validations complete', async () => {
  const fixture = quoteEditFixture();
  const started = new Set(), release = {};
  const gates = Object.fromEntries(['customers', 'service_locations'].map(table => [table, new Promise(resolve => { release[table] = resolve; })]));
  const from = fixture.db.from;
  fixture.db.from = table => {
    const query = from(table), single = query.single;
    query.single = async () => { started.add(table); await gates[table]; return single(); };
    return query;
  };
  const result = fixture.run();
  await tick();
  assert.ok(started.has('customers') && started.has('service_locations'));
  assert.equal(fixture.calls.length, 0);
  release.customers();
  await tick();
  assert.equal(fixture.calls.length, 0);
  release.service_locations();
  assert.equal((await result).status, 'success');
  assert.equal(fixture.calls.length, 1);
});

test('parallel read failures preserve account-first validation and never write', async () => {
  const fixture = quoteEditFixture(), from = fixture.db.from;
  fixture.db.from = table => {
    const query = from(table);
    if (table === 'customers') query.single = async () => ({ data: { id: other, status: 'inactive' }, error: null });
    if (table === 'service_locations') query.single = async () => ({ data: null, error: { message: 'Location unavailable' } });
    return query;
  };
  const result = await fixture.run();
  assert.equal(result.status, 'error');
  assert.equal(result.message, 'The selected contracting party is not active.');
  assert.equal(fixture.calls.length, 0);
  assert.deepEqual(fixture.paths, []);
});

test('an estimate-derived location is still checked against the contracting party', async () => {
  const fixture = quoteEditFixture(), from = fixture.db.from;
  fixture.form.set('service_location_id', '');
  fixture.form.set('estimate_schedule_event_id', other);
  fixture.db.from = table => {
    const query = from(table);
    if (table === 'schedule_events') query.single = async () => ({ data: { id: other, service_location_id: other }, error: null });
    if (table === 'service_locations') query.single = async () => ({ data: { id: other, customer_id: null, organization_id: other }, error: null });
    return query;
  };
  const result = await fixture.run();
  assert.equal(result.status, 'error');
  assert.equal(result.message, 'Selected service location does not belong to the selected contracting party.');
  assert.equal(fixture.calls.length, 0);
});
