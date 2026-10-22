import {localPaymentTarget} from './local-payment-target.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID, randomBytes, createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {spawn, execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createClient} from '@supabase/supabase-js';

const enabled = process.env.CO_SEND_DISPOSABLE === '1' && Boolean(process.env.CO_SEND_STATUS_FILE);
const exec = promisify(execFile);

test('version-bound additional-work sending and recovery through the API', {skip: !enabled, timeout: 180000}, async t => {
  const status = JSON.parse(readFileSync(process.env.CO_SEND_STATUS_FILE));
  const environment = JSON.parse(readFileSync(process.env.CO_SEND_ENV_FILE));
  if(process.env.DOCUMENT_EMAIL_DISPOSABLE!==undefined){const target=localPaymentTarget(status);assert.equal(environment.container,target.container);}else{
  assert.ok(
    status.API_URL === 'http://127.0.0.1:64421' && /^supabase_db_ats_cosend_[a-f0-9]+$/.test(environment.container)
      || status.API_URL === 'http://127.0.0.1:65421' && /^supabase_db_ats_colink_[a-f0-9]+$/.test(environment.container),
    'Sending regression checks require an explicitly paired disposable local stack',
  );
  }
  const docker = process.env.CO_SEND_DOCKER_BIN || 'docker';
  const base = ['--host', process.env.DOCKER_HOST || 'unix:///var/run/docker.sock', 'exec', '-i', environment.container,
    'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'];
  const sql = async query => (await exec(docker, [...base, '-c', query], {encoding: 'utf8', timeout: 30000})).stdout.trim();
  const lit = value => value == null ? 'null' : "'" + String(typeof value === 'object' ? JSON.stringify(value) : value).replaceAll("'", "''") + "'";
  const ok = result => { assert.equal(result.error?.code ?? null, null, result.error?.message); return result.data; };
  const denied = result => {
    assert.ok(result.error, 'An unresolved or changed source must reject a new email');
    assert.ok(['PT409', '23514', '40001'].includes(result.error.code), result.error.message);
  };
  const clientOptions = {auth: {persistSession: false, autoRefreshToken: false}};
  const service = createClient(status.API_URL, status.SERVICE_ROLE_KEY, clientOptions);
  const office = createClient(status.API_URL, status.ANON_KEY, clientOptions);
  const proof = [];
  const email = 'cosend-' + randomUUID() + '@example.invalid';
  const password = randomBytes(30).toString('base64url');
  const actor = ok(await service.auth.admin.createUser({email, password, email_confirm: true})).user.id;
  let browserFixtureRetained = false;

  // No provider transport is imported or called. Claim/finish below record only
  // synthetic outcomes inside this explicitly guarded, disposable local stack.
  t.after(async () => {
    await office.auth.signOut();
    if (!browserFixtureRetained) await sql(`update profiles set status='disabled' where id=${lit(actor)};
      update employee_records set is_active=false,employment_status='separated' where auth_user_id=${lit(actor)}`);
    if (process.env.CO_SEND_RESULTS_FILE) writeFileSync(process.env.CO_SEND_RESULTS_FILE,
      JSON.stringify({proof, realProviderCalls: 0, productionChanged: false, browserFixtureRetained}, null, 2) + '\n', {mode: 0o600});
  });
  await sql(`update profiles set status='active' where id=${lit(actor)};
    insert into employee_records(auth_user_id,legal_name,is_active,employment_status) values(${lit(actor)},'Synthetic sending reviewer',true,'active');
    insert into roles(name) values('owner') on conflict(name) do nothing;
    insert into user_roles(user_id,role_id) select ${lit(actor)},id from roles where name='owner'`);
  ok(await office.auth.signInWithPassword({email, password}));

  const run = (name, fn) => t.test(name, async () => { await fn(); proof.push({name, passed: true}); });
  const line = {title: 'Synthetic additional scope', quantity: 1, unit: 'each', unit_price_cents: 10000, amount_cents: 10000};
  const revision = async fixture => Number(await sql(`select edit_revision from change_orders where id=${lit(fixture.id)}`));
  const deliveryCount = fixture => sql(`select count(*) from app_private.outbound_deliveries where context->>'change_order_id'=${lit(fixture.id)}`);
  const requestArgs = (fixture, additionalCopy = false, requestId = randomUUID()) => ({p_request_id: requestId,
    p_change_order_id: fixture.id, p_expected_revision: fixture.edit_revision, p_actor_id: actor, p_additional_copy: additionalCopy});
  const sourceArgs = fixture => ({p_change_order_id: fixture.id, p_expected_revision: fixture.edit_revision, p_actor_id: actor});

  async function fixture() {
    const customer = randomUUID(), location = randomUUID(), job = randomUUID();
    const recipient = 'cosend-customer-' + customer + '@example.invalid';
    await sql(`insert into customers(id,display_name,email) values(${lit(customer)},'Synthetic sending customer',${lit(recipient)});
      insert into service_locations(id,customer_id,street,city,state) values(${lit(location)},${lit(customer)},'123 Synthetic Lane','Fredericksburg','VA');
      insert into jobs(id,customer_id,service_location_id,status,service_type,requested_scope)
      values(${lit(job)},${lit(customer)},${lit(location)},'accepted','other','Synthetic local sending scope')`);
    const draft = ok(await office.rpc('save_change_order_draft', {p_request_id: randomUUID(), p_change_order_id: null,
      p_expected_revision: null, p_header: {job_id: job, title: 'Synthetic additional work'}, p_lines: [line]}));
    const reviewed = ok(await office.rpc('transition_change_order_workflow', {p_request_id: randomUUID(), p_change_order_id: draft.id,
      p_expected_revision: draft.edit_revision, p_intent: 'approve_internal'}));
    return {id: draft.id, job, customer, recipient, lineId: draft.line_ids[0], edit_revision: reviewed.edit_revision};
  }

  async function prepareArgs(fixture, additionalCopy = false, requestId = randomUUID()) {
    const source = ok(await service.rpc('get_change_order_send_source', sourceArgs(fixture)));
    assert.equal(source.order.id, fixture.id);
    assert.equal(source.context.change_order_send_version, 1);
    assert.equal(source.context.change_order_id, fixture.id);
    const raw = randomBytes(32).toString('base64url'), tokenId = randomUUID();
    await sql(`insert into change_order_portal_tokens(id,change_order_id,customer_id,token_hash,token_encrypted,expires_at,created_by_user_id)
      values(${lit(tokenId)},${lit(fixture.id)},${lit(fixture.customer)},${lit(createHash('sha256').update(raw).digest('hex'))},'synthetic-local-token-not-for-decryption',now()+interval '1 day',${lit(actor)})`);
    const url = 'https://customer.example.invalid/change-order/' + raw;
    return {...requestArgs(fixture, additionalCopy, requestId), p_payload: {
      from: 'Synthetic office <office@example.invalid>', reply_to: 'office@example.invalid', to: [fixture.recipient], cc: [],
      subject: source.order.change_order_number + ': ' + source.order.title,
      text: 'Synthetic local approval request. Review additional work: ' + url,
    }, p_portal_token_id: tokenId, p_expected_snapshot: source.snapshot};
  }

  async function hold(job) {
    const process = spawn(docker, base);
    let output = '';
    const done = new Promise((resolve, reject) => {
      process.on('exit', code => code ? reject(Error('Synthetic lock session failed')) : resolve());
      process.on('error', reject);
    });
    const ready = new Promise(resolve => process.stdout.on('data', chunk => {
      output += chunk;
      if (output.includes('LOCK_READY:')) resolve(Number(/LOCK_READY:(\d+)/.exec(output)[1]));
    }));
    process.stdin.write(`begin;select id from jobs where id=${lit(job)} for update;select 'LOCK_READY:'||pg_backend_pid();\n`);
    return {
      pid: await ready,
      change: async query => {
        const marker = 'CHANGE_READY_' + randomUUID();
        const changed = new Promise((resolve, reject) => {
          const listener = chunk => {
            if (String(chunk).includes(marker)) { process.stdout.off('data', listener); resolve(); }
          };
          process.stdout.on('data', listener);
          done.catch(reject);
        });
        process.stdin.write(query + `;select '${marker}';\n`);
        await changed;
      },
      release: async (commit = false) => { process.stdin.end(commit ? 'commit;\n' : 'rollback;\n'); await done; },
    };
  }

  async function blocked(pid) {
    for (let i = 0; i < 100; i++) {
      if (Number(await sql(`select count(*) from pg_stat_activity where ${pid}=any(pg_blocking_pids(pid))`))) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw Error('Expected an actual PostgreSQL parent-row lock wait');
  }

  const prepare = args => service.rpc('prepare_change_order_send', args);
  const claim = async id => ok(await service.rpc('claim_outbound_delivery', {p_delivery_id: id}));
  const finish = async (id, attempt, outcome = 'accepted') => ok(await service.rpc('finish_outbound_delivery', {
    p_delivery_id: id, p_attempt_id: attempt, p_outcome: outcome,
    p_provider_message_id: outcome === 'accepted' ? 'synthetic_local_' + randomUUID().replaceAll('-', '') : null,
  }));

  async function newRequestDenied(fixture, additionalCopy = false) {
    const source = await service.rpc('get_change_order_send_source', sourceArgs(fixture));
    if (source.error) { denied(source); return; }
    denied(await prepare(await prepareArgs(fixture, additionalCopy)));
  }

  await run('concurrent identical preparations retain one request, one saved body and one dispatch claim', async () => {
    const f = await fixture(), args = await prepareArgs(f);
    const receipts = (await Promise.all([prepare(args), prepare(args)])).map(ok);
    assert.equal(receipts[0].delivery_id, receipts[1].delivery_id);
    assert.equal(receipts[0].request_id, args.p_request_id);
    assert.equal(receipts[0].id, f.id);
    assert.equal(receipts[0].reviewed_revision, f.edit_revision);
    assert.equal(receipts[0].additional_copy, false);
    assert.equal(receipts.filter(receipt => receipt.replayed).length, 1);
    assert.equal(await deliveryCount(f), '1');
    const claims = await Promise.all([claim(receipts[0].delivery_id), claim(receipts[0].delivery_id)]);
    assert.equal(claims.filter(Boolean).length, 1);
    const accepted = claims.find(Boolean);
    await finish(receipts[0].delivery_id, accepted.attempt_id);
    assert.equal(await claim(receipts[0].delivery_id), null);
    assert.equal(await sql(`select count(*) from email_events where outbound_delivery_id=${lit(receipts[0].delivery_id)}`), '1');
  });

  await run('different initial request IDs for the same reviewed addition coalesce one immutable email', async () => {
    const f = await fixture(), a = await prepareArgs(f), b = await prepareArgs(f);
    const receipts = (await Promise.all([prepare(a), prepare(b)])).map(ok);
    assert.equal(receipts[0].delivery_id, receipts[1].delivery_id);
    assert.equal(await deliveryCount(f), '1');
    const stored = JSON.parse(await sql(`select payload from app_private.outbound_deliveries where id=${lit(receipts[0].delivery_id)}`));
    assert.ok([a.p_payload.text, b.p_payload.text].includes(stored.text), 'The first committed body is preserved');
    for (const args of [a, b]) {
      const receipt = ok(await service.rpc('get_change_order_send_request', {
        p_request_id: args.p_request_id, p_change_order_id: f.id, p_expected_revision: f.edit_revision,
        p_actor_id: actor, p_additional_copy: false,
      }));
      assert.equal(receipt.delivery_id, receipts[0].delivery_id);
    }
  });

  await run('offboarding during a preparation parent-lock wait rejects the formerly authorized actor', async () => {
    const f = await fixture(), args = await prepareArgs(f), lock = await hold(f.job);
    const pending = Promise.resolve(prepare(args));
    try {
      await blocked(lock.pid);
      await sql(`update profiles set status='disabled' where id=${lit(actor)}`);
    } finally { await lock.release(); }
    try {
      assert.equal((await pending).error?.code, '42501');
      assert.equal(await deliveryCount(f), '0');
    } finally { await sql(`update profiles set status='active' where id=${lit(actor)}`); }
  });

  await run('cancellation and editing during a preparation wait prevent stale saved customer requests', async () => {
    for (const change of ['cancel', 'edit']) {
      const f = await fixture(), args = await prepareArgs(f), lock = await hold(f.job);
      const pending = Promise.resolve(prepare(args));
      try {
        await blocked(lock.pid);
        await lock.change(change === 'cancel'
          ? `update change_orders set status='cancelled',cancelled_at=clock_timestamp() where id=${lit(f.id)}`
          : `update change_order_line_items set description='Synthetic changed scope during send wait' where change_order_id=${lit(f.id)}`);
      } finally { await lock.release(true); }
      denied(await pending);
      assert.equal(await deliveryCount(f), '0', change);
      assert.equal(await sql(`select count(*) from job_change_order_scope_items where change_order_id=${lit(f.id)}`), '0');
    }
  });

  await run('a lost accepted response recovers the original request after a later source edit without another email', async () => {
    const f = await fixture(), args = await prepareArgs(f), receipt = ok(await prepare(args));
    const claimed = await claim(receipt.delivery_id);
    assert.ok(claimed);
    await finish(receipt.delivery_id, claimed.attempt_id); // Intentionally discard the acknowledgement.
    await sql(`update change_orders set title='Synthetic later customer scope' where id=${lit(f.id)}`);
    const recovered = ok(await service.rpc('get_change_order_send_request', requestArgs(f, false, args.p_request_id)));
    assert.equal(recovered.delivery_id, receipt.delivery_id);
    assert.equal(recovered.replayed, true);
    assert.equal(recovered.current_revision, await revision(f));
    const replay = ok(await prepare(args));
    assert.equal(replay.delivery_id, receipt.delivery_id);
    assert.equal(replay.replayed, true);
    assert.equal(await deliveryCount(f), '1');
    assert.equal(await claim(receipt.delivery_id), null);
    assert.equal(await sql(`select count(*) from email_events where outbound_delivery_id=${lit(receipt.delivery_id)}`), '1');
    assert.equal(await sql(`select count(*) from activity_log where subject_id=${lit(f.id)} and event_type='change_order_sent'`), '1');
    assert.equal(await sql(`select title from change_orders where id=${lit(f.id)}`), 'Synthetic later customer scope');
    assert.equal(await sql(`select count(*) from change_order_portal_tokens where change_order_id=${lit(f.id)} and revoked_at is null`), '1');
  });

  await run('dispatching and unknown family outcomes cannot be bypassed by editing, a new UUID or an additional-copy request', async () => {
    for (const outcome of ['dispatching', 'unknown']) {
      const f = await fixture(), args = await prepareArgs(f), receipt = ok(await prepare(args));
      const claimed = await claim(receipt.delivery_id);
      assert.ok(claimed);
      if (outcome === 'unknown') await finish(receipt.delivery_id, claimed.attempt_id, 'unknown');
      await sql(`update change_orders set title=${lit('Synthetic changed scope after ' + outcome)} where id=${lit(f.id)}`);
      f.edit_revision = await revision(f);
      const reviewed = ok(await office.rpc('transition_change_order_workflow', {p_request_id: randomUUID(),
        p_change_order_id: f.id, p_expected_revision: f.edit_revision, p_intent: 'approve_internal'}));
      f.edit_revision = reviewed.edit_revision;
      await newRequestDenied(f);
      await newRequestDenied(f, true);
      assert.equal(await deliveryCount(f), '1');
      assert.equal(await sql(`select state from app_private.outbound_deliveries where id=${lit(receipt.delivery_id)}`), outcome);
      assert.equal(await claim(receipt.delivery_id), null);
      assert.equal(await sql(`select attempt_count from app_private.outbound_deliveries where id=${lit(receipt.delivery_id)}`), '1');
    }
  });

  await run('accepted but unreconciled evidence holds every new request until no-send history repair', async () => {
    const f = await fixture(), args = await prepareArgs(f), receipt = ok(await prepare(args));
    const claimed = await claim(receipt.delivery_id);
    assert.ok(claimed);
    await sql(`alter table email_events add constraint cosend_synthetic_history_failure
      check(outbound_delivery_id is distinct from ${lit(receipt.delivery_id)}::uuid) not valid`);
    try {
      await finish(receipt.delivery_id, claimed.attempt_id);
      assert.equal(await sql(`select state||':'||repair_state from app_private.outbound_deliveries where id=${lit(receipt.delivery_id)}`), 'accepted:needs_review');
      await newRequestDenied(f);
      await newRequestDenied(f, true);
      assert.equal(await deliveryCount(f), '1');
    } finally { await sql('alter table email_events drop constraint cosend_synthetic_history_failure'); }
    const repaired = ok(await office.rpc('review_outbound_delivery', {p_delivery_id: receipt.delivery_id, p_action: 'reconcile',
      p_reason: 'Synthetic local accepted receipt repair only', p_request_id: randomUUID()}));
    assert.equal(repaired.repaired, true);
    assert.equal(await claim(receipt.delivery_id), null);
    assert.equal(await sql(`select count(*) from email_events where outbound_delivery_id=${lit(receipt.delivery_id)}`), '1');
    assert.equal(await sql(`select attempt_count from app_private.outbound_deliveries where id=${lit(receipt.delivery_id)}`), '1');
  });

  await run('an explicitly reviewed additional copy creates one extra saved email and retries keep its original request', async () => {
    const f = await fixture(), first = ok(await prepare(await prepareArgs(f)));
    const originalClaim = await claim(first.delivery_id);
    await finish(first.delivery_id, originalClaim.attempt_id);
    f.edit_revision = await revision(f);
    const args = await prepareArgs(f, true);
    const copies = (await Promise.all([prepare(args), prepare(args)])).map(ok);
    assert.equal(copies[0].delivery_id, copies[1].delivery_id);
    assert.notEqual(copies[0].delivery_id, first.delivery_id);
    assert.equal(copies.filter(receipt => receipt.replayed).length, 1);
    assert.equal(copies[0].additional_copy, true);
    assert.equal(await deliveryCount(f), '2');
    const copyClaim = await claim(copies[0].delivery_id);
    assert.ok(copyClaim);
    assert.notEqual(copyClaim.idempotency_key, originalClaim.idempotency_key);
    await finish(copies[0].delivery_id, copyClaim.attempt_id);
    const replay = ok(await service.rpc('get_change_order_send_request', requestArgs(f, true, args.p_request_id)));
    assert.equal(replay.delivery_id, copies[0].delivery_id);
    assert.equal(await claim(copies[0].delivery_id), null);
    assert.equal(await sql(`select count(*) from email_events where related_change_order_id=${lit(f.id)}`), '2');
    assert.equal(await deliveryCount(f), '2');
  });

  await run('two queued copies admit only one dispatch and preserve the other intent during an uncertain outcome', async () => {
    const f = await fixture(), original = ok(await prepare(await prepareArgs(f)));
    const originalClaim = await claim(original.delivery_id);
    assert.ok(originalClaim);
    await finish(original.delivery_id, originalClaim.attempt_id);
    f.edit_revision = await revision(f);
    const first = ok(await prepare(await prepareArgs(f, true)));
    const second = ok(await prepare(await prepareArgs(f, true)));
    assert.notEqual(first.delivery_id, second.delivery_id);
    assert.equal(await deliveryCount(f), '3');
    const claims = await Promise.all([claim(first.delivery_id), claim(second.delivery_id)]);
    assert.equal(claims.filter(Boolean).length, 1, 'Only one queued copy may cross the dispatch boundary');
    const winner = claims.find(Boolean);
    assert.ok(winner.attempt_id);
    const held = claims[0] ? second.delivery_id : first.delivery_id;
    assert.equal(await sql(`select state||':'||repair_state||':'||attempt_count from app_private.outbound_deliveries where id=${lit(held)}`), 'prepared:needs_review:0');
    await finish(winner.id, winner.attempt_id, 'unknown');
    assert.equal(await claim(held), null, 'An unknown family result must keep the other queued copy on hold');
    assert.equal(await sql(`select state||':'||repair_state||':'||attempt_count from app_private.outbound_deliveries where id=${lit(held)}`), 'prepared:needs_review:0');
    assert.equal(await sql(`select count(*) from email_events where related_change_order_id=${lit(f.id)}`), '1', 'Only the synthetic original acceptance has recorded email history');
  });

  if (process.env.CO_SEND_FIXTURES_FILE) {
    const browser = await fixture();
    writeFileSync(process.env.CO_SEND_FIXTURES_FILE, JSON.stringify({email, password, actor, order: browser.id, job: browser.job,
      customer: browser.customer, recipient: browser.recipient, initialRevision: browser.edit_revision}) + '\n', {mode: 0o600});
    browserFixtureRetained = true;
  }
});
