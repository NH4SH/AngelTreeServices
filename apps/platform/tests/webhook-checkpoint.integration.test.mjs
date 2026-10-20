import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync } from 'node:fs';
import { processStripeWebhook } from '../src/lib/payments/webhook-recovery.ts';

const enabled = process.env.WEBHOOK_CHECKPOINT_DISPOSABLE === '1', exec = promisify(execFile);
test('installed webhook checkpoints retain money and hold uncertain mail for review', { skip: !enabled, timeout: 120000 }, async t => {
  assert.equal(process.env.DOCKER_HOST, 'unix:///Users/noelsierra/.lima/pr02-disposable/sock/docker.sock');
  const docker = process.env.WEBHOOK_CHECKPOINT_DOCKER_BIN; assert.ok(docker);
  const actor = randomUUID(), customer = randomUUID(), invoice = randomUUID(), reservation = randomUUID();
  const suffix = randomUUID().replaceAll('-', ''), event = 'evt_checkpoint_' + suffix;
  const base = ['exec', '-i', 'supabase_db_ats_pr02_disposable', 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'];
  const sql = async query => (await exec(docker, [...base, '-c', query], { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 })).stdout.trim();
  // Installed functions run in one outer rollback. These are transaction-state
  // and receipt-compatibility tests, not actual commit/network-loss/concurrency.
  const query = `begin;set local lock_timeout='3s';set local statement_timeout='20s';
    create temporary table checkpoint_packet(value jsonb);grant select,insert on checkpoint_packet to service_role;
    insert into auth.users(id,email,raw_user_meta_data) values('${actor}','checkpoint-${suffix}@example.invalid','{}');
    insert into public.profiles(id,email,full_name,status) values('${actor}','checkpoint-${suffix}@example.invalid','Synthetic checkpoint owner','active')
      on conflict(id) do update set status='active';
    insert into public.user_roles(user_id,role_id) select '${actor}',id from public.roles where name='owner';
    insert into public.customers(id,display_name) values('${customer}','CHECKPOINT_LOCAL');
    insert into public.invoices(id,invoice_number,customer_id,status,subtotal_cents,total_cents,balance_due_cents,sent_at)
      values('${invoice}','CHECKPOINT-${suffix}','${customer}','sent',1000,1000,1000,clock_timestamp());
    insert into public.invoice_checkout_sessions(id,invoice_id,customer_id,status,amount_cents,invoice_principal_cents,surcharge_cents,total_charge_cents,currency,payment_channel,stripe_checkout_session_id,stripe_payment_intent_id)
      values('${reservation}','${invoice}','${customer}','open',1000,1000,0,1000,'usd','ach','cs_${suffix}','pi_${suffix}');
    set local role service_role;set local request.jwt.claims='{"role":"service_role"}';
    do $$ declare c jsonb;busy jsonb;snapshot uuid;a jsonb;r jsonb;send jsonb;review jsonb;after_mail jsonb;
      done jsonb;ignored jsonb;ignored_first jsonb;ignored_replay jsonb;exhausted jsonb;n record;attempt jsonb;own_notice uuid;
      evidence jsonb:=jsonb_build_object('operation','succeeded','reservation_id','${reservation}','invoice_id','${invoice}',
        'session_id','cs_${suffix}','intent_id','pi_${suffix}','charge_id','ch_${suffix}','amount_cents',1000,'currency','usd','refunds','[]'::jsonb);
    begin
      c:=public.claim_stripe_webhook('${event}','checkout.session.completed','cs_${suffix}','2026-10-20T12:00:00Z',false);
      busy:=public.claim_stripe_webhook('${event}','checkout.session.completed','cs_${suffix}','2026-10-20T12:00:00Z',false);
      snapshot:=public.prepare_stripe_webhook_snapshot('${event}',(c->>'token')::uuid,evidence);
      a:=public.apply_stripe_webhook('${event}',(c->>'token')::uuid,evidence||jsonb_build_object('snapshot_token',snapshot));
      perform public.fail_stripe_webhook('${event}',(c->>'token')::uuid,'communication_sync_failed');
      r:=public.claim_stripe_webhook('${event}','checkout.session.completed','cs_${suffix}','2026-10-20T12:00:00Z',false);
      perform public.mark_stripe_webhook_sync('${event}',(r->>'token')::uuid);
      -- Only newly generated fixture-event inbox rows are touched. Skip other
      -- recipients without emitting their addresses or making any provider call.
      for n in select id from public.admin_notifications where stripe_event_id='${event}' and recipient_user_id<>'${actor}' loop
        attempt:=public.begin_stripe_notification_email('${event}',(r->>'token')::uuid,n.id);
        if attempt->>'status'='send' then perform public.finish_stripe_notification_email(n.id,(r->>'token')::uuid,'skipped',null);end if;
      end loop;
      select id into strict own_notice from public.admin_notifications where stripe_event_id='${event}' and recipient_user_id='${actor}';
      send:=public.begin_stripe_notification_email('${event}',(r->>'token')::uuid,own_notice);
      -- No result acknowledgement is stored. Reclaiming must convert this
      -- reserved submission to review instead of granting another submission.
      perform public.fail_stripe_webhook('${event}',(r->>'token')::uuid,'notification_delivery_uncertain');
      after_mail:=public.claim_stripe_webhook('${event}','checkout.session.completed','cs_${suffix}','2026-10-20T12:00:00Z',false);
      review:=public.begin_stripe_notification_email('${event}',(after_mail->>'token')::uuid,own_notice);
      perform public.complete_stripe_webhook('${event}',(after_mail->>'token')::uuid);
      done:=public.claim_stripe_webhook('${event}','checkout.session.completed','cs_${suffix}','2026-10-20T12:00:00Z',false);
      ignored:=public.claim_stripe_webhook('${event}_ignored','fixture.unhandled','obj_fixture','2026-10-20T12:00:00Z',false);
      ignored_first:=public.apply_stripe_webhook('${event}_ignored',(ignored->>'token')::uuid,'{"operation":"ignored"}');
      ignored_replay:=public.apply_stripe_webhook('${event}_ignored',(ignored->>'token')::uuid,'{"operation":"ignored"}');
      for i in 1..12 loop
        exhausted:=public.claim_stripe_webhook('${event}_limit','fixture.unhandled','obj_fixture','2026-10-20T12:00:00Z',false);
        perform public.fail_stripe_webhook('${event}_limit',(exhausted->>'token')::uuid,'processing_failed');
      end loop;
      exhausted:=public.claim_stripe_webhook('${event}_limit','fixture.unhandled','obj_fixture','2026-10-20T12:00:00Z',false);
      insert into pg_temp.checkpoint_packet values(jsonb_build_object('claim',c,'busy',busy,'snapshot',snapshot,'applied',a,
        'resume',r,'send',send,'after_mail',after_mail,'review',review,'done',done,'notice',own_notice,
        'ignored_claim',ignored,'ignored_first',ignored_first,'ignored_replay',ignored_replay,'exhausted',exhausted));
    end $$;
    reset role;
    select value||jsonb_build_object('payment_count',(select count(*) from public.payments where invoice_id='${invoice}'),
      'balance',(select balance_due_cents from public.invoices where id='${invoice}'),
      'notice_state',(select stripe_email_state from public.admin_notifications where id=(value->>'notice')::uuid),
      'receipt_problem',(select last_problem from public.stripe_webhook_events where event_id='${event}')) from pg_temp.checkpoint_packet;
    rollback;`;
  const packet = JSON.parse(await sql(query)), proof = [];
  const run = (name, fn) => t.test(name, async () => { await fn(); proof.push({ name, pass: true }); });
  await run('SQL failure/reclaim preserves one payment, paid balance, review state and minimal terminal claims', () => {
    assert.equal(packet.payment_count, 1); assert.equal(packet.balance, 0); assert.equal(packet.resume.phase, 'effects_ready');
    assert.equal(packet.resume.communications_synced, false); assert.equal(packet.after_mail.communications_synced, true);
    assert.equal(packet.notice_state, 'review'); assert.equal(packet.receipt_problem, 'notification_review');
    assert.deepEqual(packet.busy, { status: 'busy' }); assert.deepEqual(packet.done, { status: 'completed' }); assert.deepEqual(packet.exhausted, { status: 'review' });
  });
  const invoke = async ({ claim = packet.resume, applied = packet.ignored_first, attempt = packet.review, sync = { error: null }, list = [{ id: packet.notice }], emailResult } = {}) => {
    const calls = [], sends = [], planned = [];
    const reply = data => { const q = { abortSignal() { return q; }, then(resolve, reject) { return Promise.resolve({ data, error: null }).then(resolve, reject); } }; return q; };
    const db = { rpc(name, args) {
      calls.push({ name, args });
      const responses = { claim_stripe_webhook: claim, apply_stripe_webhook: applied, mark_stripe_webhook_sync: true,
        begin_stripe_notification_email: attempt, finish_stripe_notification_email: true, complete_stripe_webhook: true, fail_stripe_webhook: true };
      assert.ok(Object.hasOwn(responses, name), 'Resume must not repeat financial observations'); return reply(responses[name]);
    }, from(table) { assert.equal(table, 'admin_notifications'); const q = { select() { return q; }, eq() { return q; }, in() { return q; }, order() { return q; }, limit() { return q; }, abortSignal() { return q; },
      then(resolve, reject) { return Promise.resolve({ data: list, error: null }).then(resolve, reject); } }; return q; } };
    let result, error;
    try { result = await processStripeWebhook({ id: event, type: 'fixture.unhandled', created: 1792497600, livemode: false, data: { object: { id: 'obj_fixture' } } }, {
      supabase: db, stripe: null, livemode: false, syncCommunications: async id => { planned.push(id); return sync; },
      sendEmail: async input => { sends.push(input); return emailResult ?? { ok: true, configured: true, retryable: false, providerMessageId: 'local_synthetic_message' }; },
    }); } catch (e) { error = e; }
    return { result, error, calls, sends, planned };
  };
  await run('actual downstream and send receipt shapes pass without financial reapply', async () => {
    const f = await invoke({ attempt: packet.send }); assert.ifError(f.error); assert.equal(f.result.status, 'completed'); assert.equal(f.sends.length, 1);
    assert.equal(f.sends[0].invoice_id, invoice); assert.equal(f.calls.filter(c => c.name === 'apply_stripe_webhook').length, 0); assert.deepEqual(f.planned, [invoice]);
  });
  await run('actual review-replay receipt never resubmits mail', async () => {
    const f = await invoke({ claim: packet.after_mail }); assert.ifError(f.error); assert.equal(f.result.status, 'completed'); assert.equal(f.sends.length, 0); assert.equal(f.planned.length, 0);
  });
  await run('both actual ignored apply acknowledgements pass', async () => {
    for (const applied of [packet.ignored_first, packet.ignored_replay]) {
      const f = await invoke({ claim: packet.ignored_claim, applied, list: [] }); assert.ifError(f.error); assert.equal(f.result.status, 'completed'); assert.equal(f.planned.length, 0);
    }
  });
  await run('actual completed/busy/exhausted claim shapes retain existing semantics', async () => {
    for (const claim of [packet.done, packet.busy, packet.exhausted]) {
      const f = await invoke({ claim }); assert.ifError(f.error); assert.equal(f.result.status, claim.status); assert.equal(f.calls.length, 1);
    }
  });
  await run('unconfirmed planning against a real checkpoint cannot mark sync or complete', async () => {
    const f = await invoke({ sync: {} }); assert.equal(f.error.applicationErrorCode, 'communication_sync_failed');
    assert.equal(f.calls.some(c => ['mark_stripe_webhook_sync', 'complete_stripe_webhook'].includes(c.name)), false);
  });
  await run('unconfirmed provider result against actual send shape records review and fails completion', async () => {
    const f = await invoke({ attempt: packet.send, emailResult: {} }); assert.equal(f.error.applicationErrorCode, 'notification_delivery_uncertain');
    assert.equal(f.calls.find(c => c.name === 'finish_stripe_notification_email').args.p_outcome, 'review'); assert.equal(f.calls.some(c => c.name === 'complete_stripe_webhook'), false);
  });
  await run('explicit unknown transport outcome remains review even when retries are disabled', async () => {
    const f = await invoke({ attempt: packet.send, emailResult: { ok: false, configured: true, retryable: false, providerMessageId: null, outcome: 'unknown' } });
    assert.ifError(f.error); assert.equal(f.result.status, 'completed');
    assert.equal(f.calls.find(c => c.name === 'finish_stripe_notification_email').args.p_outcome, 'review');
  });
  assert.equal(await sql(`select (select count(*) from auth.users where id='${actor}')+(select count(*) from public.invoices where id='${invoice}')+(select count(*) from public.stripe_webhook_events where event_id in('${event}','${event}_ignored','${event}_limit'))`), '0');
  if (process.env.WEBHOOK_CHECKPOINT_RESULTS_FILE) writeFileSync(process.env.WEBHOOK_CHECKPOINT_RESULTS_FILE, JSON.stringify({ proof, fixturesRolledBack: true,
    moneyRowsWithinTransaction: packet.payment_count, providerRequests: 0, boundary: 'Installed SQL state transitions and collected receipt shapes; controlled application adapters, not interleaved HTTP or real commits.' }, null, 2) + '\n');
});
