import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { load } from './pr10-test-helpers.mjs';

const id = randomUUID(), job = randomUUID(), org = randomUUID(), firstContact = randomUUID(), secondContact = randomUUID();
function reader({ row = { id, job_id: job, requested_by_contact_id: firstContact, approval_contact_id: secondContact, edit_revision: 2, change_order_line_items: [], editor_job: { id: job, organization_id: org, archived_at: null } }, error = null, pages = [[]] } = {}) {
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
test('customer and unselected organization jobs skip contact reads; saved IDs use one bounded organization-scoped query', async () => {
  const base = { id, job_id: job, edit_revision: 1, change_order_line_items: [], editor_job: { id: job, organization_id: null, archived_at: null } };
  const individual = reader({row:base});assert.equal((await individual.run()).jobs[0].id,job);assert.equal(individual.calls.length,1);
  const blank = reader({row:{...base,editor_job:{...base.editor_job,organization_id:org}}});assert.deepEqual((await blank.run()).contacts,[]);assert.equal(blank.calls.length,1);
  const rows=[firstContact,secondContact].map(id=>({id,organization_id:org,is_active:true,full_name:'Synthetic contact'})), selected=reader({pages:[rows]}), result=await selected.run();assert.deepEqual(result.contacts,rows);assert.equal(selected.calls.length,2);
  const ops=selected.calls[1].ops;assert.ok(ops.some(x=>x[0]==='eq'&&x[1]==='organization_id'&&x[2]===org));assert.ok(ops.some(x=>x[0]==='eq'&&x[1]==='is_active'&&x[2]===true));assert.deepEqual(ops.find(x=>x[0]==='in'),['in','id',[firstContact,secondContact]]);assert.deepEqual(ops.find(x=>x[0]==='limit'),['limit',2]);assert.equal(ops.some(x=>x[0]==='range'),false);
});
test('duplicate saved IDs hydrate once; unavailable contacts remain in the header for explicit review',async()=>{
 const base={id,job_id:job,edit_revision:2,change_order_line_items:[],editor_job:{id:job,organization_id:org,archived_at:null},requested_by_contact_id:firstContact,approval_contact_id:firstContact}, duplicate=reader({row:base,pages:[[{id:firstContact,organization_id:org,is_active:true,full_name:'Synthetic'}]]});assert.equal((await duplicate.run()).contacts.length,1);assert.deepEqual(duplicate.calls[1].ops.find(x=>x[0]==='limit'),['limit',1]);
 const absent=reader({row:base,pages:[[]]}),result=await absent.run();assert.equal(result.error,null);assert.equal(result.data.approval_contact_id,firstContact);assert.deepEqual(result.contacts,[]);
});
test('unexpected, foreign, inactive or duplicate contact replies cannot mount a partial editor',async()=>{
 for(const rows of [[{id:randomUUID(),organization_id:org,is_active:true,full_name:'Foreign'}],[{id:firstContact,organization_id:randomUUID(),is_active:true,full_name:'Wrong organization'}],[{id:firstContact,organization_id:org,is_active:false,full_name:'Inactive'}],Array.from({length:2},()=>({id:firstContact,organization_id:org,is_active:true,full_name:'Duplicate'}))]){const result=await reader({pages:[rows]}).run();assert.equal(result.data,null);assert.ok(result.error);}
});
test('failed or absent contact pages cannot mount an editor with silently emptied recipients', async () => {
  for (const page of [{ data: null, error: null }, { data: null, error: { message: 'private diagnostic' } }]) { const result = await reader({ pages: [page] }).run(); assert.equal(result.data, null); assert.ok(result.error); assert.deepEqual(result.contacts, []); assert.doesNotMatch(result.error, /private diagnostic/); }
});
test('quote lookup failures remain visible and independent; the reader cannot use privileged fallback', async () => {
  const m = load('../src/lib/data/quote-editor.ts', { 'server-only': {}, '@/lib/supabase/server': { createClient: async () => ({ from(table) { const response = table === 'service_locations' ? { data: null, error: { message: 'private diagnostic' } } : { data: [{ id: table }], error: null }; const q = new Proxy({ then: resolve => Promise.resolve(response).then(resolve) }, { get(target, key) { return key in target ? target[key] : () => q; } }); return q; } }) }, '@/lib/security/errors': { safeStaffMessage: () => 'Locations could not load' } });
  const result = await m.getQuoteEditorLookups(); assert.equal(result.customers.data[0].id, 'customers'); assert.equal(result.organizations.error, null); assert.deepEqual(result.serviceLocations.data, []); assert.equal(result.serviceLocations.error, 'Locations could not load');
});
