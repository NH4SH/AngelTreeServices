import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

test('change-order save transport retains native replay, concurrency, approval and access guarantees', {
  skip: process.env.CO_PERF_DISPOSABLE !== '1', timeout: 180000,
}, async () => {
  const c = JSON.parse(readFileSync(process.env.CO_PERF_CONFIG)), local = c.supabaseUrl === 'http://127.0.0.1:62321';
  assert.ok(local || c.supabaseUrl === 'https://gbyhdsuiqeslgjdnbqng.supabase.co');
  const s = local ? JSON.parse(readFileSync(c.statusFile)) : null, keys = local ? null : JSON.parse(readFileSync(c.keysFile));
  const options = { auth: { persistSession: false, autoRefreshToken: false } }, service = createClient(c.supabaseUrl, local ? s.SERVICE_ROLE_KEY : keys.find(x => x.name === 'service_role').api_key, options), db = createClient(c.supabaseUrl, local ? s.ANON_KEY : keys.find(x => x.name === 'anon').api_key, options);
  const ok = r => { if (r.error) throw Error(r.error.message); return r.data; }, marker = 'BENCH_' + randomBytes(6).toString('hex').toUpperCase(), email = marker.toLowerCase() + '-owner@example.invalid', password = randomBytes(30).toString('base64url') + 'aA1!';
  const user = ok(await service.auth.admin.createUser({ email, password, email_confirm: true })).user, checks = [];
  try {
    ok(await service.from('profiles').update({ status: 'active' }).eq('id', user.id)); const role = ok(await service.from('roles').select('id').eq('name', 'owner').single());
    ok(await service.from('user_roles').insert({ user_id: user.id, role_id: role.id })); ok(await service.from('employee_records').insert({ auth_user_id: user.id, legal_name: marker, employment_status: 'active', is_active: true })); ok(await db.auth.signInWithPassword({ email, password }));
    const customer = ok(await service.from('customers').insert({ display_name: marker, email }).select('id').single()), location = ok(await service.from('service_locations').insert({ customer_id: customer.id, street: '100 Synthetic Way', city: 'Test City', state: 'VA' }).select('id').single()), job = ok(await service.from('jobs').insert({ customer_id: customer.id, service_location_id: location.id, status: 'accepted', service_type: 'other', requested_scope: marker }).select('*').single());
    const line = { title: marker + ' Added scope', quantity: 1, unit: 'each', unit_price_cents: 10000, amount_cents: 10000 };
    const create = async () => ok(await db.rpc('save_change_order_draft', { p_request_id: randomUUID(), p_change_order_id: null, p_expected_revision: null, p_header: { job_id: job.id, title: marker }, p_lines: [line] }));
    const snapshot = async id => ok(await service.from('change_orders').select('*, change_order_line_items(*)').eq('id', id).single());
    const args = row => ({ p_request_id: randomUUID(), p_change_order_id: row.id, p_expected_revision: row.edit_revision, p_header: { title: marker + ' Edited' }, p_lines: row.change_order_line_items.map(x => ({ ...line, id: x.id })) });
    const audit = async id => ok(await service.from('activity_log').select('id,event_type,metadata_json').eq('subject_type', 'change_order').eq('subject_id', id).eq('event_type', 'change_order_edited').order('id'));
    const created = await create(), initial = await snapshot(created.id), edit = args(initial), saved = ok(await db.rpc('save_change_order_draft', edit)), after = await snapshot(created.id);
    assert.ok(saved.edit_revision > initial.edit_revision); assert.deepEqual(saved.line_ids, initial.change_order_line_items.map(x => x.id)); assert.equal(after.total_cents, 10000); assert.equal((await audit(created.id)).length, 1);
    const replay = ok(await db.rpc('save_change_order_draft', edit)); assert.equal(replay.replayed, true); assert.equal(replay.edit_revision, saved.edit_revision); assert.deepEqual(await snapshot(created.id), after); assert.equal((await audit(created.id)).length, 1);
    checks.push('Explicit retry of a committed request returns its original receipt without another write or audit event');
    const next = ok(await db.rpc('save_change_order_draft', args(after))), later = await snapshot(created.id), old = ok(await db.rpc('save_change_order_draft', edit)); assert.equal(old.replayed, true); assert.equal(old.current_revision, next.edit_revision); assert.equal(old.edit_revision, saved.edit_revision); assert.deepEqual(await snapshot(created.id), later);
    const stale = await db.rpc('save_change_order_draft', { ...edit, p_request_id: randomUUID() }); assert.equal(stale.error?.code, 'PT409'); assert.deepEqual(await snapshot(created.id), later);
    checks.push('Old receipts cannot overwrite a later edit; a new request with an old revision conflicts');
    const racing = await snapshot((await create()).id), raceArgs = args(racing), contenders = await Promise.all([db.rpc('save_change_order_draft', raceArgs), db.rpc('save_change_order_draft', { ...raceArgs, p_request_id: randomUUID(), p_header: { title: marker + ' Other edit' } })]);
    assert.equal(contenders.filter(r => !r.error).length, 1); assert.equal(contenders.find(r => r.error).error.code, 'PT409'); assert.equal((await audit(racing.id)).length, 1);
    checks.push('Concurrent editors have one winner and one audit entry');
    const approval = await snapshot((await create()).id), approvalArgs = { p_request_id: randomUUID(), p_change_order_id: approval.id, p_expected_revision: approval.edit_revision, p_approval: { name: 'Synthetic approver', method: 'phone', notes: 'Synthetic scope and price confirmed', contact_id: null } };
    const competing = await Promise.all([db.rpc('record_change_order_manual_approval', approvalArgs), db.rpc('save_change_order_draft', args(approval))]); assert.equal(competing.filter(r => !r.error).length, 1); assert.equal(competing.find(r => r.error).error.code, 'PT409');
    const state = await snapshot(approval.id); assert.equal(state.title, state.status === 'approved' ? marker : marker + ' Edited');
    const approved = await snapshot((await create()).id); ok(await db.rpc('record_change_order_manual_approval', { ...approvalArgs, p_request_id: randomUUID(), p_change_order_id: approved.id, p_expected_revision: approved.edit_revision })); const closed = await snapshot(approved.id); assert.ok((await db.rpc('save_change_order_draft', args(closed))).error); assert.deepEqual(await snapshot(approved.id), closed);
    checks.push('Approval races cannot authorize unseen scope, and approved work cannot be edited');
    const bad = args(later); bad.p_lines.push({ ...line, material_id: randomUUID() }); const rejected = await db.rpc('save_change_order_draft', bad); assert.ok(rejected.error); assert.deepEqual(await snapshot(later.id), later);
    checks.push('A late invalid line rolls back the complete draft');
    ok(await service.from('profiles').update({ status: 'disabled' }).eq('id', user.id)); assert.equal(ok(await db.rpc('has_effective_platform_access')), false); assert.equal((await db.rpc('save_change_order_draft', args(later))).error?.code, '42501'); assert.deepEqual(await snapshot(later.id), later);
    checks.push('Revoked effective access denies the old session inside the unchanged transaction');
    // Approval may add derived scope rows; it must not reschedule or replace the parent job.
    const currentJob = ok(await service.from('jobs').select('*').eq('id', job.id).single()); for (const key of ['customer_id', 'service_location_id', 'status', 'requested_scope', 'scheduled_start', 'scheduled_end']) assert.deepEqual(currentJob[key], job[key]);
    writeFileSync(process.env.CO_PERF_RESULTS, JSON.stringify({ passed: true, environment: local ? 'local' : 'staging', syntheticOnly: true, checks, productionTouched: false }, null, 2), { mode: 0o600 });
  } finally { ok(await service.from('profiles').update({ status: 'disabled' }).eq('id', user.id)); ok(await service.auth.admin.updateUserById(user.id, { ban_duration: '876000h' })); }
});
