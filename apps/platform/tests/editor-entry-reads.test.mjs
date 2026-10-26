import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { load } from './pr10-test-helpers.mjs';

const id = randomUUID(), job = randomUUID(), org = randomUUID();
function reader({ row = { id, job_id: job, edit_revision: 2, change_order_line_items: [], editor_job: { id: job, organization_id: org, archived_at: null } }, error = null, pages = [[]] } = {}) {
  const calls = [], db = { from(table) {
    const ops = [], call = { table, ops }; calls.push(call);
    const q = new Proxy({ then(resolve, reject) { return Promise.resolve(table === 'change_orders' ? { data: row, error } : pages.shift()).then(resolve, reject); } }, { get(target, key) { if (key in target) return target[key]; return (...args) => { ops.push([key, ...args]); return q; }; } }); return q;
  } };
  // Empty successful pages have the same shape as PostgREST, not an absent body.
  pages = pages.map(p => Array.isArray(p) ? { data: p, error: null } : p);
  const m = load('../src/lib/data/change-orders.ts', { 'server-only': {}, '@/lib/email/delivery-commands': {}, '@/lib/portal/tokens': {}, '@/lib/portal/urls': {}, '@/lib/supabase/server': { createClient: async () => db }, '@/lib/supabase/admin': { getServiceRoleClient: () => assert.fail('Editor reads must use caller RLS') }, '@/lib/security/errors': { safeStaffMessage: () => 'Details could not load' } });
  return { calls, run: () => m.getChangeOrderForEditing(id) };
}
test('missing, denied and malformed change orders never become global lookup reads', async () => {
  for (const options of [{ row: null }, { row: null, error: { message: 'private diagnostic' } }, { row: {} }, { row: { id, edit_revision: 1 } }]) {
    const r = reader(options), result = await r.run(); assert.equal(result.data, null); assert.deepEqual(result.jobs, []); assert.deepEqual(result.contacts, []); assert.equal(r.calls.length, 1); assert.doesNotMatch(result.error ?? '', /private diagnostic/);
  }
  for (const parent of [null, { id: randomUUID(), archived_at: null }, { id: job, archived_at: '2026-10-26T00:00:00Z' }]) {
    const r = reader({ row: { id, job_id: job, edit_revision: 1, change_order_line_items: [], editor_job: parent } }); assert.ok((await r.run()).error); assert.equal(r.calls.length, 1);
  }
});
test('a customer job skips contact lookup; organization contacts remain explicitly scoped through every page', async () => {
  const r = reader({ row: { id, job_id: job, edit_revision: 1, change_order_line_items: [], editor_job: { id: job, organization_id: null, archived_at: null } } }); assert.equal((await r.run()).jobs[0].id, job); assert.equal(r.calls.length, 1);
  const pages = [Array.from({ length: 1000 }, () => ({ id: randomUUID() })), [{ id: randomUUID() }]], many = reader({ pages }), result = await many.run(); assert.equal(result.contacts.length, 1001); assert.equal(many.calls.length, 3);
  for (const call of many.calls.slice(1)) { assert.equal(call.table, 'organization_contacts'); assert.ok(call.ops.some(x => x[0] === 'eq' && x[1] === 'organization_id' && x[2] === org)); assert.ok(call.ops.some(x => x[0] === 'eq' && x[1] === 'is_active' && x[2] === true)); assert.deepEqual(call.ops.filter(x => x[0] === 'order').map(x => x[1]), ['full_name', 'id']); }
  assert.deepEqual(many.calls[2].ops.find(x => x[0] === 'range'), ['range', 1000, 1999]);
});
test('failed or absent contact pages cannot mount an editor with silently emptied recipients', async () => {
  for (const page of [{ data: null, error: null }, { data: null, error: { message: 'private diagnostic' } }]) { const result = await reader({ pages: [page] }).run(); assert.equal(result.data, null); assert.ok(result.error); assert.deepEqual(result.contacts, []); assert.doesNotMatch(result.error, /private diagnostic/); }
});
test('quote lookup failures remain visible and independent; the reader cannot use privileged fallback', async () => {
  const m = load('../src/lib/data/quote-editor.ts', { 'server-only': {}, '@/lib/supabase/server': { createClient: async () => ({ from(table) { const response = table === 'service_locations' ? { data: null, error: { message: 'private diagnostic' } } : { data: [{ id: table }], error: null }; const q = new Proxy({ then: resolve => Promise.resolve(response).then(resolve) }, { get(target, key) { return key in target ? target[key] : () => q; } }); return q; } }) }, '@/lib/security/errors': { safeStaffMessage: () => 'Locations could not load' } });
  const result = await m.getQuoteEditorLookups(); assert.equal(result.customers.data[0].id, 'customers'); assert.equal(result.organizations.error, null); assert.deepEqual(result.serviceLocations.data, []); assert.equal(result.serviceLocations.error, 'Locations could not load');
});
