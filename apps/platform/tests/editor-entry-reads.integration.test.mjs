import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { load } from './pr10-test-helpers.mjs';
import { safeStaffMessage } from '../src/lib/security/errors.ts';

test('lean editor reads retain caller-scoped choices, all selected document values and access denials', { skip: process.env.EDITOR_ENTRY_DISPOSABLE !== '1', timeout: 180000 }, async () => {
  const c = JSON.parse(readFileSync(process.env.EDITOR_ENTRY_CONFIG)), local = c.supabaseUrl === 'http://127.0.0.1:62321'; assert.ok(local || c.supabaseUrl === 'https://gbyhdsuiqeslgjdnbqng.supabase.co');
  const s = local ? JSON.parse(readFileSync(c.statusFile)) : null, keys = local ? null : JSON.parse(readFileSync(c.keysFile)), opts = { auth: { persistSession: false, autoRefreshToken: false } }, db = createClient(c.supabaseUrl, local ? s.ANON_KEY : keys.find(x => x.name === 'anon').api_key, opts), service = createClient(c.supabaseUrl, local ? s.SERVICE_ROLE_KEY : keys.find(x => x.name === 'service_role').api_key, opts), ok = r => { if (r.error) throw Error(r.error.message); return r.data; };
  const marker = 'BENCH_' + randomBytes(6).toString('hex').toUpperCase(), email = marker.toLowerCase() + '-reader@example.invalid', password = randomBytes(30).toString('base64url') + 'aA1!', user = ok(await service.auth.admin.createUser({ email, password, email_confirm: true })).user, checks = [];
  const data = () => load('../src/lib/data/change-orders.ts', { 'server-only': {}, '@/lib/email/delivery-commands': {}, '@/lib/portal/tokens': {}, '@/lib/portal/urls': {}, '@/lib/supabase/server': { createClient: async () => db }, '@/lib/supabase/admin': { getServiceRoleClient: () => assert.fail('Privileged fallback forbidden') }, '@/lib/security/errors': { safeStaffMessage } });
  const lookups = () => load('../src/lib/data/quote-editor.ts', { 'server-only': {}, '@/lib/supabase/server': { createClient: async () => db }, '@/lib/security/errors': { safeStaffMessage } });
  try {
    ok(await service.from('profiles').update({ status: 'active' }).eq('id', user.id)); ok(await service.from('employee_records').insert({ auth_user_id: user.id, legal_name: marker, employment_status: 'active', is_active: true })); const role = ok(await service.from('roles').select('id').eq('name', 'owner').single()); ok(await service.from('user_roles').insert({ user_id: user.id, role_id: role.id })); ok(await db.auth.signInWithPassword({ email, password }));
    const old = await data().getChangeOrderDetail(c.changeOrderId), current = await data().getChangeOrderForEditing(c.changeOrderId); assert.equal(old.error, null); assert.equal(current.error, null); assert.ok(old.data.title.startsWith(c.marker));
    for (const [key, value] of Object.entries(current.data)) assert.deepEqual(value, old.data[key], key); assert.equal(current.data.jobs, undefined); assert.equal(current.data.approval_contact, undefined);
    const job = ok(await db.from('jobs').select('id, customer_id, organization_id, service_location_id, source_quote_id, status, service_type, customers:customers!jobs_customer_id_fkey(display_name), organizations(name), service_locations(label, street, city)').eq('id', old.data.job_id).single()); assert.deepEqual(current.jobs, [job]);
    const contacts = ok(await db.from('organization_contacts').select('id, organization_id, full_name, email, role_title, contact_roles, is_active').eq('organization_id', job.organization_id).eq('is_active', true).order('full_name').order('id')); assert.deepEqual(current.contacts, contacts); assert.deepEqual(current.contacts.map(x => x.id).sort(), [...c.contactIds].sort()); assert.ok(current.contacts.every(x => x.notes === undefined));
    checks.push('Change-order header, totals, revision, lines, selected work order and active contacts match authoritative caller-RLS reads');
    const q = await lookups().getQuoteEditorLookups(); for (const value of Object.values(q)) assert.equal(value.error, null);
    const expected = {
      customers: ok(await db.from('customers').select('id, display_name, email, phone, billing_address').is('archived_at', null).order('display_name', { ascending: true })).map(({ id, display_name }) => ({ id, display_name })),
      organizations: ok(await db.from('organizations').select('*').is('archived_at', null).order('name')).map(({ id, name }) => ({ id, name })),
      organizationContacts: ok(await db.from('organization_contacts').select('*').eq('is_active', true).order('full_name')).map(({ id, organization_id, full_name, contact_roles, email }) => ({ id, organization_id, full_name, contact_roles, email })),
      serviceLocations: ok(await db.from('service_locations').select('*').is('archived_at', null).order('created_at', { ascending: false })).map(({ id, customer_id, organization_id, label, street, city, state, postal_code }) => ({ id, customer_id, organization_id, label, street, city, state, postal_code })),
    }; for (const [key, rows] of Object.entries(expected)) assert.deepEqual(q[key].data, rows, key);
    const bytes = { projectedExpectedQuoteLookups: Buffer.byteLength(JSON.stringify(expected)), afterQuoteLookups: Buffer.byteLength(JSON.stringify(Object.fromEntries(Object.entries(q).map(([k, v]) => [k, v.data])))), afterChangeOrderEditor: Buffer.byteLength(JSON.stringify(current)) };
    assert.ok(q.customers.data.length > 160); assert.ok(q.serviceLocations.data.every(x => !('gate_code' in x) && !('access_notes' in x) && !('service_notes' in x))); assert.ok(q.organizationContacts.data.every(x => !('notes' in x)));
    checks.push('Every quote customer, organization, contact and location choice matches the original active filters and labels; unused private details are omitted');
    ok(await service.from('profiles').update({ status: 'disabled' }).eq('id', user.id)); assert.equal(ok(await db.rpc('has_effective_platform_access')), false); assert.equal((await data().getChangeOrderForEditing(c.changeOrderId)).data, null); for (const value of Object.values(await lookups().getQuoteEditorLookups())) assert.deepEqual(value.data, []);
    const crewRole = ok(await service.from('roles').select('id').eq('name', 'crew').single()); ok(await service.from('user_roles').update({ role_id: crewRole.id }).eq('user_id', user.id)); ok(await service.from('profiles').update({ status: 'active' }).eq('id', user.id)); assert.equal((await data().getChangeOrderForEditing(c.changeOrderId)).data, null);
    await db.auth.signOut(); assert.equal((await data().getChangeOrderForEditing(c.changeOrderId)).data, null); for (const value of Object.values(await lookups().getQuoteEditorLookups())) assert.deepEqual(value.data, []);
    checks.push('Disabled old sessions, active crew and anonymous clients gain no draft-editor access; disabled and anonymous lookup reads remain denied');
    writeFileSync(process.env.EDITOR_ENTRY_RESULTS, JSON.stringify({ passed: true, environment: local ? 'local' : 'staging', syntheticOnly: true, checks, bytes, productionTouched: false }, null, 2), { mode: 0o600 });
  } finally { ok(await service.from('profiles').update({ status: 'disabled' }).eq('id', user.id)); ok(await service.auth.admin.updateUserById(user.id, { ban_duration: '876000h' })); }
});
