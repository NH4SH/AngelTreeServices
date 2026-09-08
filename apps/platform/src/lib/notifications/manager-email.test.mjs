import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
function load(file, mocks = {}) {
  const js = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', js)(name => {
    if (name in mocks) return mocks[name];
    throw Error(`Unexpected import ${name}`);
  }, module, module.exports);
  return module.exports;
}
const policy = load('./manager-email-policy.ts');
const now = new Date('2026-09-08T13:00:00Z');
test('Eastern quiet hours, DST, daily identity, bounded retries and escaped HTML', () => {
  assert.equal(policy.managerEmailWindow('handoff', new Date('2026-09-09T00:00:00Z')), false);
  assert.equal(policy.managerEmailWindow('handoff', new Date('2026-01-09T12:00:00Z')), true);
  assert.equal(policy.managerEmailWindow('digest', now, 10), false);
  assert.equal(policy.managerEmailWindow('digest', new Date('2026-09-08T16:00:00Z')), false);
  assert.equal(policy.managerDigestKey('a', now), 'manager-digest:a:2026-09-08');
  assert.equal(policy.canRetryManagerEmail(3, null, now), false);
  assert.equal(policy.canRetryManagerEmail(1, '2026-09-07T13:00:00Z', now), false);
  assert.equal(policy.canRetryManagerEmail(1, now.toISOString(), now), true);
  assert.ok(policy.managerEmailHtml('<script>\nScope').includes('&lt;script&gt;<br />Scope'));
});

function fixture(options = {}) {
  const tables = {
    admin_notification_preferences: [{ user_id: 'manager', handoff_email_enabled: true, daily_summary_email_enabled: false, daily_summary_hour: 7 }],
    profiles: [{ id: 'manager', status: 'active' }],
    user_roles: [{ user_id: 'manager', roles: { name: 'admin' } }],
    follow_up_tasks: [{ id: 'task', title: 'Call about access', due_at: now.toISOString(), assigned_to_user_id: 'manager', status: 'open' }],
    admin_notifications: [{ id: 'notification', recipient_user_id: 'manager', title: 'Assigned handoff', body: 'Saved', destination_path: '/admin/jobs/job', manager_email_kind: 'handoff', manager_email_key: 'handoff:activity', handoff_task_id: 'task', email_status: 'pending', manager_email_attempts: 0, manager_email_next_attempt_at: now.toISOString(), manager_email_claimed_at: null, manager_email_first_attempt_at: null, manager_email_payload: null }],
  };
  const identity = { email: 'manager@example.test', email_confirmed_at: now.toISOString() };
  const db = { auth: { admin: { getUserById: async () => ({ data: { user: identity } }) } }, from(table) {
    const filters = []; let update, upsert, cap = Infinity;
    const query = {
      select() { return this; }, order() { return this; }, limit(n) { cap = n; return this; },
      eq(k,v) { filters.push(r => r[k] === v); return this; },
      in(k,v) { filters.push(r => v.includes(r[k])); return this; },
      not(k,_op,v) { filters.push(r => r[k] !== v); return this; },
      lte(k,v) { filters.push(r => r[k] != null && r[k] <= v); return this; },
      or(value) { const stale = value.split('.lt.')[1]; filters.push(r => r.manager_email_claimed_at == null || r.manager_email_claimed_at < stale); return this; },
      update(value) { update = value; return this; }, upsert(value) { upsert = value; return this; },
      execute(single = false) {
        if (upsert && !tables[table].some(r => r.manager_email_key === upsert.manager_email_key)) tables[table].push({ id: `digest-${tables[table].length}`, email_status: 'pending', manager_email_attempts: 0, manager_email_next_attempt_at: now.toISOString(), manager_email_claimed_at: null, manager_email_first_attempt_at: null, manager_email_payload: null, ...upsert });
        const rows = tables[table].filter(r => filters.every(f => f(r))).slice(0,cap);
        if (update) rows.forEach(r => Object.assign(r, update));
        return Promise.resolve({ data: structuredClone(single ? rows[0] ?? null : rows), error: null });
      }, maybeSingle() { return this.execute(true); }, then(resolve,reject) { return this.execute().then(resolve,reject); },
    }; return query;
  } };
  const sends = [];
  const worker = load('./manager-email-worker.ts', {
    'server-only': {}, '@/lib/supabase/admin': { getServiceRoleClient: () => db },
    '@/lib/activity-log': { recordActivity: async () => ({ id: 'activity' }) },
    '@/lib/email/config': { getEmailProviderConfig: () => ({ from: 'office@example.test', replyTo: 'office@example.test' }) },
    '@/lib/email/send': { sendTransactionalEmail: async () => { throw Error('Real sender forbidden'); } },
    '@/lib/security/app-base-url': { buildCanonicalAppUrl: path => `https://admin.example.test${path}` },
    '@/lib/business-time': { formatBusinessDateTime: value => value },
    './manager-email-summary': { buildManagerSummary: async () => { if (options.summaryFails) throw Error('Unavailable'); return 'New leads: 2'; } },
    './manager-email-policy': policy,
  });
  return { tables, identity, sends, run: (date = now, send) => worker.processManagerEmails({ db, now: date, send: send ?? (async input => { sends.push(input); return { ok: !options.transient, retryable: Boolean(options.transient), historyRecorded: true }; }) }) };
}

test('handoff accepted once; duplicate/concurrent workers cannot send twice', async () => {
  const f = fixture(); await Promise.all([f.run(), f.run()]); await f.run();
  assert.equal(f.sends.length, 1);
  assert.equal(f.tables.admin_notifications[0].email_status, 'sent');
});
test('retry preserves payload and idempotency key even if task changes', async () => {
  const f = fixture({ transient: true }); await f.run();
  f.tables.follow_up_tasks[0].title = 'Edited title';
  await f.run(new Date(now.getTime() + 16 * 60_000));
  assert.equal(f.sends.length, 2);
  assert.equal(f.sends[0].text, f.sends[1].text);
  assert.equal(f.sends[0].idempotencyKey, f.sends[1].idempotencyKey);
});
test('lost response retries a stale claim without changing the message', async () => {
  const f = fixture();
  await f.run(now, async () => { throw Error('Disconnected'); });
  const payload = structuredClone(f.tables.admin_notifications[0].manager_email_payload);
  await f.run(new Date(now.getTime() + 11 * 60_000));
  assert.equal(f.sends.length, 1);
  assert.equal(f.sends[0].text, payload.text);
});
test('disabled, inactive, crew, unverified, completed and reassigned recipients are skipped', async () => {
  for (const change of [
    f => f.tables.admin_notification_preferences[0].handoff_email_enabled = false,
    f => f.tables.profiles[0].status = 'inactive',
    f => f.tables.user_roles[0].roles.name = 'crew',
    f => f.identity.email_confirmed_at = null,
    f => f.tables.follow_up_tasks[0].status = 'completed',
    f => f.tables.follow_up_tasks[0].assigned_to_user_id = 'someone-else',
  ]) {
    const f = fixture(); change(f); await f.run();
    assert.equal(f.sends.length, 0); assert.equal(f.tables.admin_notifications[0].email_status, 'skipped');
  }
});
test('quiet hours, changed recipient and exhausted retries do not send', async () => {
  const quiet = fixture(); await quiet.run(new Date('2026-09-09T02:00:00Z')); assert.equal(quiet.sends.length, 0);
  for (const change of [
    r => r.manager_email_attempts = 3,
    r => r.manager_email_first_attempt_at = '2026-09-07T13:00:00Z',
    r => r.manager_email_payload = { to: 'old@example.test' },
  ]) {
    const f = fixture(); change(f.tables.admin_notifications[0]); await f.run();
    assert.equal(f.sends.length, 0); assert.equal(f.tables.admin_notifications[0].manager_email_next_attempt_at, null);
  }
});
test('digest is opt-in, once per business date; unavailable counts do not produce an empty summary', async () => {
  const f = fixture(); f.tables.admin_notifications.length = 0;
  f.tables.admin_notification_preferences[0].daily_summary_email_enabled = true;
  await f.run(); await f.run(); assert.equal(f.sends.length, 1);
  const failed = fixture({ summaryFails: true }); failed.tables.admin_notifications.length = 0;
  failed.tables.admin_notification_preferences[0].daily_summary_email_enabled = true;
  assert.equal((await failed.run()).errors, 1); assert.equal(failed.sends.length, 0);
});
test('worker endpoint denies missing and malformed credentials before processing', async () => {
  let called = false;
  const route = load('../../app/api/internal/notifications/process/route.ts', {
    '@/lib/security/monitoring-secret': { bearerToken: () => null, monitoringSecretMatches: () => { throw Error('Invalid input'); } },
    '@/lib/notifications/manager-email-worker': { processManagerEmails: async () => { called = true; } },
  });
  assert.equal((await route.POST(new Request('http://localhost/api/internal/notifications/process'))).status, 401);
  assert.equal(called, false);
});

test('summary uses bounded counts, explicit relationships and current date; query errors fail closed', async () => {
  const calls = []; let fail = false;
  const db = { from(table) {
    const query = { then(resolve) { return Promise.resolve({ count: 2, error: fail ? { message: 'unavailable' } : null }).then(resolve); } };
    for (const op of ['select','is','eq','in','gte','lt','neq','or','gt']) query[op] = (...args) => { calls.push([table,op,...args]); return query; };
    return query;
  } };
  const {buildManagerSummary} = load('./manager-email-summary.ts', {
    'server-only': {}, '@/lib/business-time': {getBusinessDayRange: () => ({start:new Date('2026-09-08T04:00:00Z'),endExclusive:new Date('2026-09-09T04:00:00Z')})},
  });
  assert.ok((await buildManagerSummary(db,'manager',now)).includes('New leads: 2'));
  assert.equal(calls.filter(c=>c[1]==='select').length,7);
  assert.ok(calls.filter(c=>c[1]==='select').every(c=>c[3].head && c[3].count==='exact'));
  assert.ok(calls.some(c=>c[1]==='select' && c[2].includes('!schedule_events_job_id_fkey')));
  assert.ok(calls.some(c=>c[1]==='or' && c[2].includes('assigned_to_user_id.eq.manager')));
  fail=true; await assert.rejects(buildManagerSummary(db,'manager',now), /counts unavailable/);
});

test('saving preferences is owner/admin-only, self-scoped, validated and does not send email', async () => {
  let role='crew', saved=null;
  const actions = load('../actions/notifications.ts', {
    'next/cache': {revalidatePath(){}},
    '@/lib/auth/pageContext': {getAuthenticatedPlatformContext:async()=>({configured:true,user:{id:'self'},roles:[role],supabase:{from:()=>({upsert:async value=>{saved=value;return {error:null};}})}})},
    '@/lib/auth/roles': {hasAllowedRole:(roles,allowed)=>roles.some(r=>allowed.includes(r)),platformRoleGroups:{accessApproval:['owner','admin']}},
  });
  const form=new FormData();form.set('daily_summary_hour','9');form.set('handoff_email_enabled','1');form.set('user_id','other');
  assert.equal((await actions.updateNotificationPreferences({},form)).status,'error');assert.equal(saved,null);
  role='admin';assert.equal((await actions.updateNotificationPreferences({},form)).status,'success');
  assert.equal(saved.user_id,'self');assert.equal(saved.handoff_email_enabled,true);assert.equal(saved.daily_summary_email_enabled,false);
  form.set('daily_summary_hour','23');assert.equal((await actions.updateNotificationPreferences({},form)).status,'error');
});
