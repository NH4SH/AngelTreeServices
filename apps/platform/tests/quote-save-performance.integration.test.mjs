import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { load } from './pr10-test-helpers.mjs';
import { quoteEditFixture } from './quote-edit-confirmation-fixture.mjs';

test('quote editor reads and saves preserve native access, conflicts and uncertain-write recovery', {
  skip: process.env.QUOTE_PERF_DISPOSABLE !== '1', timeout: 180000,
}, async () => {
  const config = JSON.parse(readFileSync(process.env.QUOTE_PERF_CONFIG));
  const local = config.supabaseUrl === 'http://127.0.0.1:62321';
  assert.ok(local || config.supabaseUrl === 'https://gbyhdsuiqeslgjdnbqng.supabase.co');
  const status = local ? JSON.parse(readFileSync(config.statusFile)) : null;
  const keys = local ? null : JSON.parse(readFileSync(config.keysFile));
  const anon = local ? status.ANON_KEY : keys.find(key => key.name === 'anon').api_key;
  const secret = local ? status.SERVICE_ROLE_KEY : keys.find(key => key.name === 'service_role').api_key;
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const service = createClient(config.supabaseUrl, secret, options);
  const ok = result => { if (result.error) throw Error(result.error.message); return result.data; };
  const accounts = [], checks = [];
  async function actor(role) {
    const marker = 'BENCH_' + randomBytes(6).toString('hex').toUpperCase();
    const email = marker.toLowerCase() + '-' + role + '@example.invalid', password = randomBytes(30).toString('base64url') + 'aA1!';
    const user = ok(await service.auth.admin.createUser({ email, password, email_confirm: true })).user;
    accounts.push(user.id);
    ok(await service.from('profiles').update({ status: 'active' }).eq('id', user.id));
    const record = ok(await service.from('roles').select('id').eq('name', role).single());
    ok(await service.from('user_roles').insert({ user_id: user.id, role_id: record.id }));
    ok(await service.from('employee_records').insert({ auth_user_id: user.id, legal_name: marker, employment_status: 'active', is_active: true }));
    const db = createClient(config.supabaseUrl, anon, options);
    ok(await db.auth.signInWithPassword({ email, password }));
    return { db, user, marker };
  }
  try {
    const owner = await actor('owner'), crew = await actor('crew');
    const customer = ok(await service.from('customers').insert({ display_name: owner.marker, email: owner.marker.toLowerCase() + '@example.invalid' }).select('id').single());
    const location = ok(await service.from('service_locations').insert({ customer_id: customer.id, street: '100 Synthetic Way', city: 'Test City', state: 'VA' }).select('id').single());
    const draft = ok(await owner.db.rpc('create_quote_draft_request', { p_request_id: randomUUID(), p_header: { customer_id: customer.id, service_location_id: location.id, customer_message: owner.marker }, p_lines: [{ name: 'Synthetic work', quantity: 1, unit_price_cents: 1000, total_cents: 1000 }] }));
    const read = () => owner.db.from('quotes').select('*, quote_line_items(*)').eq('id', draft.id).single().then(ok);
    function fixture(db = owner.db, rpc) {
      const f = quoteEditFixture({ id: draft.id, party: customer.id, location: location.id, actor: owner.user.id, retainedId: draft.line_ids[0], rpc: rpc ?? ((name, args) => db.rpc(name, args)) });
      f.db.from = db.from.bind(db); f.db.auth = db.auth;
      return f;
    }
    for (const db of [owner.db, crew.db]) {
      const readers = load('../src/lib/data/quotes.ts', { '@/lib/supabase/server': { createClient: async () => db }, '@/lib/data/admin-search': {}, '@/lib/security/errors': {} });
      const full = await readers.getQuoteDetail(draft.id), lean = await readers.getQuoteForEditing(draft.id);
      assert.equal(Boolean(lean.data), Boolean(full.data));
      if (full.data) {
        const { jobs, customers, organizations, recipient_contact, approval_contact, onsite_contact, billing_contact, service_locations, schedule_events, notes, invoices, ...headerAndLines } = full.data;
        assert.deepEqual(lean.data, headerAndLines);
      }
    }
    checks.push('Caller-RLS editor header and lines match the full detail read; crew does not gain access');

    const before = await read(), saved = fixture();
    saved.form.set('expected_revision', String(before.edit_revision));
    assert.equal((await saved.run()).status, 'success');
    assert.equal(saved.calls.length, 1);
    const after = await read();
    assert.equal(after.total_cents, 1500);
    assert.equal(after.quote_line_items.length, 2);
    assert.ok(after.quote_line_items.some(line => line.id === draft.line_ids[0]));
    assert.ok(after.edit_revision > before.edit_revision);
    const stale = fixture(); stale.form.set('expected_revision', String(before.edit_revision));
    assert.equal((await stale.run()).conflict.currentRevision, after.edit_revision);
    assert.deepEqual(await read(), after);
    checks.push('One atomic save retains ordered identities and totals; stale edits cannot overwrite it');

    const lost = fixture(owner.db, async (name, args) => { ok(await owner.db.rpc(name, args)); throw Error('Synthetic lost acknowledgement'); });
    lost.form.set('expected_revision', String(after.edit_revision));
    const uncertain = await lost.run();
    assert.equal(uncertain.status, 'error'); assert.equal(uncertain.savedRevision, undefined); assert.equal(lost.calls.length, 1);
    assert.deepEqual(lost.paths, []);
    const committed = await read(); assert.ok(committed.edit_revision > after.edit_revision);
    const retry = fixture(); retry.form.set('expected_revision', String(after.edit_revision));
    assert.equal((await retry.run()).conflict.currentRevision, committed.edit_revision);
    assert.deepEqual(await read(), committed);
    checks.push('A lost acknowledgement stays uncertain; explicit retry conflicts without duplicating writes');

    const race = fixture(owner.db, async (name, args) => {
      ok(await service.from('profiles').update({ status: 'disabled' }).eq('id', owner.user.id));
      return owner.db.rpc(name, args);
    });
    race.form.set('expected_revision', String(committed.edit_revision));
    assert.equal((await race.run()).status, 'error'); assert.equal(race.calls.length, 1);
    assert.equal(ok(await owner.db.rpc('has_effective_platform_access')), false);
    const actual = ok(await service.from('quotes').select('edit_revision, total_cents').eq('id', draft.id).single());
    assert.deepEqual(actual, { edit_revision: committed.edit_revision, total_cents: committed.total_cents });
    checks.push('Disabling the actor after preflight is still rejected inside the transaction');
    writeFileSync(process.env.QUOTE_PERF_RESULTS, JSON.stringify({ passed: true, environment: local ? 'local' : 'staging', syntheticOnly: true, checks, productionTouched: false }, null, 2), { mode: 0o600 });
  } finally {
    for (const id of accounts) {
      await service.from('profiles').update({ status: 'disabled' }).eq('id', id);
      await service.auth.admin.updateUserById(id, { ban_duration: '876000h' });
    }
  }
});
