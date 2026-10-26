import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { load } from './pr10-test-helpers.mjs';
import { invoiceEditFixture } from './invoice-edit-fixture.mjs';
import { safeStaffMessage } from '../src/lib/security/errors.ts';

test('invoice editor performance preserves native reads, payment locks, access and uncertain-save recovery', {
  skip: process.env.INVOICE_PERF_DISPOSABLE !== '1', timeout: 180000,
}, async () => {
  const c = JSON.parse(readFileSync(process.env.INVOICE_PERF_CONFIG));
  const local = c.supabaseUrl === 'http://127.0.0.1:62321';
  assert.ok(local || c.supabaseUrl === 'https://gbyhdsuiqeslgjdnbqng.supabase.co');
  const s = local ? JSON.parse(readFileSync(c.statusFile)) : null, keys = local ? null : JSON.parse(readFileSync(c.keysFile));
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const service = createClient(c.supabaseUrl, local ? s.SERVICE_ROLE_KEY : keys.find(x => x.name === 'service_role').api_key, options);
  const db = createClient(c.supabaseUrl, local ? s.ANON_KEY : keys.find(x => x.name === 'anon').api_key, options);
  const ok = r => { if (r.error) throw Error(r.error.message); return r.data; };
  const marker = 'BENCH_' + randomBytes(6).toString('hex').toUpperCase(), email = marker.toLowerCase() + '-owner@example.invalid', password = randomBytes(30).toString('base64url') + 'aA1!';
  const user = ok(await service.auth.admin.createUser({ email, password, email_confirm: true })).user, checks = [];
  try {
    ok(await service.from('profiles').update({ status: 'active' }).eq('id', user.id));
    const role = ok(await service.from('roles').select('id').eq('name', 'owner').single());
    ok(await service.from('user_roles').insert({ user_id: user.id, role_id: role.id }));
    ok(await service.from('employee_records').insert({ auth_user_id: user.id, legal_name: marker, employment_status: 'active', is_active: true }));
    ok(await db.auth.signInWithPassword({ email, password }));
    const customer = ok(await service.from('customers').insert({ display_name: marker, email: marker.toLowerCase() + '@example.invalid' }).select('id').single());
    async function invoice() {
      const created = ok(await db.rpc('create_standalone_invoice', { p_request_id: randomUUID(), p_header: { customer_id: customer.id, organization_id: null, service_location_id: null, due_at: '2026-11-15T17:00:00Z' },
        p_lines: [{ name: marker, quantity: 1, unit_price_cents: 1500, total_cents: 1500 }], p_notes: null, p_new_customer: null }));
      ok(await service.from('invoices').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', created.invoice_id));
      return created.invoice_id;
    }
    const snapshot = async id => ok(await service.from('invoices').select('*, invoice_line_items(*), payments(*)').eq('id', id).single());
    function fixture(row, rpc = (name, args) => db.rpc(name, args)) {
      const f = invoiceEditFixture({ id: row.id, retainedId: row.invoice_line_items[0].id, version: row.updated_at, rpc });
      f.db.auth = db.auth; f.db.from = db.from.bind(db); return f;
    }
    const id = await invoice(), before = await snapshot(id);
    const readers = load('../src/lib/data/invoices.ts', { '@/lib/supabase/server': { createClient: async () => db }, '@/lib/data/admin-search': {}, '@/lib/security/errors': { safeStaffMessage } });
    const full = await readers.getInvoiceDetail(id), lean = await readers.getInvoiceForEditing(id);
    assert.equal(lean.error, null); assert.equal(full.error, null);
    for (const key of ['updated_at', 'customer_id', 'organization_id', 'due_at', 'status', 'total_cents', 'balance_due_cents', 'document_terms_version', 'invoice_line_items']) assert.deepEqual(lean.data[key], full.data[key]);
    assert.equal(lean.data.customers.display_name, full.data.customers.display_name);
    assert.equal(lean.data.payments, undefined); assert.equal(lean.data.notes, undefined);
    checks.push('Editor fields, balances, terms and lines match the full caller-RLS read');
    const saved = fixture(before); assert.equal((await saved.run()).status, 'success'); assert.equal(saved.calls.length, 1);
    const after = await snapshot(id); assert.equal(after.total_cents, 1500); assert.equal(after.invoice_line_items.length, 2);
    assert.ok(after.invoice_line_items.some(line => line.id === before.invoice_line_items[0].id));
    const stale = fixture(before); assert.equal((await stale.run()).status, 'error'); assert.deepEqual(await snapshot(id), after);
    checks.push('Atomic save retains identities and balances; stale revisions never overwrite');
    const lost = fixture(after, async (name, args) => { ok(await db.rpc(name, args)); throw Error('Synthetic lost receipt'); });
    assert.equal((await lost.run()).status, 'error'); assert.equal(lost.calls.length, 1); assert.deepEqual(lost.paths, []);
    const committed = await snapshot(id); assert.notEqual(committed.updated_at, after.updated_at);
    assert.equal((await fixture(after).run()).status, 'error'); assert.deepEqual(await snapshot(id), committed);
    checks.push('Lost acknowledgement remains uncertain and an explicit retry conflicts without duplicate writes');

    // Provider processing is represented by a pending payment and/or a processing checkout.
    for (const status of ['pending']) {
      const target = await invoice();
      ok(await service.from('payments').insert({ invoice_id: target, customer_id: customer.id, amount_cents: 400, total_collected_cents: 400, surcharge_cents: 0, currency: 'usd', payment_method: 'cash', provider: 'manual', status }));
      const initial = await snapshot(target), blocked = fixture(initial);
      assert.equal((await blocked.run()).status, 'error'); assert.deepEqual(await snapshot(target), initial);
    }
    for (const status of ['open', 'processing']) {
      const target = await invoice();
      ok(await service.from('invoice_checkout_sessions').insert({ invoice_id: target, customer_id: customer.id, amount_cents: 1500, invoice_principal_cents: 1500, surcharge_cents: 0, total_charge_cents: 1500, currency: 'usd', payment_channel: 'card', status, processing_expires_at: new Date(Date.now() + 600000).toISOString() }));
      const initial = await snapshot(target); assert.equal((await fixture(initial).run()).status, 'error'); assert.deepEqual(await snapshot(target), initial);
    }
    checks.push('Pending payments and open/processing checkouts continue to block edits');
    const revoke = fixture(committed, async (name, args) => { ok(await service.from('profiles').update({ status: 'disabled' }).eq('id', user.id)); return db.rpc(name, args); });
    assert.equal((await revoke.run()).status, 'error'); assert.equal(ok(await db.rpc('has_effective_platform_access')), false); assert.deepEqual(await snapshot(id), committed);
    checks.push('SQL rechecks effective access after application preflight');
    writeFileSync(process.env.INVOICE_PERF_RESULTS, JSON.stringify({ passed: true, syntheticOnly: true, environment: local ? 'local' : 'staging', checks, productionTouched: false }, null, 2), { mode: 0o600 });
  } finally { await service.from('profiles').update({ status: 'disabled' }).eq('id', user.id); await service.auth.admin.updateUserById(user.id, { ban_duration: '876000h' }); }
});
