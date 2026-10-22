import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID, randomBytes} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {spawn, execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createClient} from '@supabase/supabase-js';

const enabled = process.env.CO_LINK_DISPOSABLE === '1' && Boolean(process.env.CO_LINK_STATUS_FILE);
const exec = promisify(execFile);

test('atomic additional-work link management through the authenticated API', {skip: !enabled, timeout: 180000}, async t => {
  const status = JSON.parse(readFileSync(process.env.CO_LINK_STATUS_FILE));
  const environment = JSON.parse(readFileSync(process.env.CO_LINK_ENV_FILE));
  assert.equal(status.API_URL, 'http://127.0.0.1:65421');
  assert.match(environment.container, /^supabase_db_ats_colink_[a-f0-9]+$/);
  const docker = process.env.CO_LINK_DOCKER_BIN || 'docker';
  const base = ['--host', process.env.DOCKER_HOST || 'unix:///var/run/docker.sock', 'exec', '-i', environment.container,
    'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'];
  const sql = async query => (await exec(docker, [...base, '-c', query], {encoding: 'utf8', timeout: 30000})).stdout.trim();
  const lit = value => value == null ? 'null' : "'" + String(typeof value === 'object' ? JSON.stringify(value) : value).replaceAll("'", "''") + "'";
  const ok = result => { assert.equal(result.error?.code ?? null, null, result.error?.message); return result.data; };
  const clientOptions = {auth: {persistSession: false, autoRefreshToken: false}};
  const service = createClient(status.API_URL, status.SERVICE_ROLE_KEY, clientOptions);
  const office = createClient(status.API_URL, status.ANON_KEY, clientOptions);
  const anonymous = createClient(status.API_URL, status.ANON_KEY, clientOptions);
  const proof = [];
  const email = 'colink-' + randomUUID() + '@example.invalid';
  const password = randomBytes(30).toString('base64url');
  const actor = ok(await service.auth.admin.createUser({email, password, email_confirm: true})).user.id;
  let browserFixtureRetained = false;

  // Capability strings and recipients are synthetic. No provider transport is
  // imported; the one email-claim race never invokes an external sender.
  t.after(async () => {
    await office.auth.signOut();
    if (!browserFixtureRetained) await sql(`update profiles set status='disabled' where id=${lit(actor)};
      update employee_records set is_active=false,employment_status='separated' where auth_user_id=${lit(actor)}`);
    if (process.env.CO_LINK_RESULTS_FILE) writeFileSync(process.env.CO_LINK_RESULTS_FILE,
      JSON.stringify({proof, realProviderCalls: 0, productionChanged: false, browserFixtureRetained}, null, 2) + '\n', {mode: 0o600});
  });
  await sql(`update profiles set status='active' where id=${lit(actor)};
    insert into employee_records(auth_user_id,legal_name,is_active,employment_status) values(${lit(actor)},'Synthetic link reviewer',true,'active');
    insert into roles(name) values('owner') on conflict(name) do nothing;
    insert into user_roles(user_id,role_id) select ${lit(actor)},id from roles where name='owner'`);
  ok(await office.auth.signInWithPassword({email, password}));

  const run = (name, fn) => t.test(name, async () => { await fn(); proof.push({name, passed: true}); });
  const line = {title: 'Synthetic added scope', quantity: 1, unit: 'each', unit_price_cents: 10000, amount_cents: 10000};
  const candidate = () => ({token_hash: randomBytes(32).toString('hex'), token_hint: randomBytes(3).toString('hex'),
    token_encrypted: 'v1.' + 'A'.repeat(16) + '.' + 'A'.repeat(58) + '.' + 'A'.repeat(22),
    expires_at: new Date(Date.now() + 86400000).toISOString()});
  const linkState = async fixture => {
    const result = ok(await office.rpc('get_change_order_link_state', {p_change_order_id: fixture.id}));
    assert.match(result.link_version, /^[a-f0-9]{64}$/);
    assert.ok(Array.isArray(result.tokens));
    return result;
  };
  const activeCount = fixture => sql(`select count(*) from change_order_portal_tokens where change_order_id=${lit(fixture.id)}
    and revoked_at is null and (expires_at is null or expires_at>now())`);
  const tokenCount = fixture => sql(`select count(*) from change_order_portal_tokens where change_order_id=${lit(fixture.id)}`);
  const revision = fixture => sql(`select edit_revision from change_orders where id=${lit(fixture.id)}`);
  const identity = (fixture, version, intent, requestId = randomUUID()) => ({p_request_id: requestId, p_change_order_id: fixture.id,
    p_expected_revision: fixture.edit_revision, p_expected_link_version: version, p_intent: intent});
  const manage = args => office.rpc('manage_change_order_portal_link', args);
  const argsFor = async (fixture, intent, extra = {}) => ({...identity(fixture, (await linkState(fixture)).link_version, intent),
    p_candidate: intent === 'revoke' ? null : candidate(), ...extra});
  const receiptIdentity = args => ({p_request_id: args.p_request_id, p_change_order_id: args.p_change_order_id,
    p_expected_revision: args.p_expected_revision, p_expected_link_version: args.p_expected_link_version, p_intent: args.p_intent});

  async function fixture() {
    const customer = randomUUID(), location = randomUUID(), job = randomUUID();
    const recipient = 'colink-customer-' + customer + '@example.invalid';
    await sql(`insert into customers(id,display_name,email) values(${lit(customer)},'Synthetic link customer',${lit(recipient)});
      insert into service_locations(id,customer_id,street,city,state) values(${lit(location)},${lit(customer)},'123 Synthetic Lane','Fredericksburg','VA');
      insert into jobs(id,customer_id,service_location_id,status,service_type,requested_scope)
      values(${lit(job)},${lit(customer)},${lit(location)},'accepted','other','Synthetic local link scope')`);
    const draft = ok(await office.rpc('save_change_order_draft', {p_request_id: randomUUID(), p_change_order_id: null,
      p_expected_revision: null, p_header: {job_id: job, title: 'Synthetic additional work'}, p_lines: [line]}));
    const reviewed = ok(await office.rpc('transition_change_order_workflow', {p_request_id: randomUUID(), p_change_order_id: draft.id,
      p_expected_revision: draft.edit_revision, p_intent: 'approve_internal'}));
    return {id: draft.id, job, customer, recipient, lineId: draft.line_ids[0], edit_revision: reviewed.edit_revision};
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
          const listener = chunk => { if (String(chunk).includes(marker)) { process.stdout.off('data', listener); resolve(); } };
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

  await run('simultaneous regeneration retries rotate once and recover the first committed candidate', async () => {
    const f = await fixture(), generated = ok(await manage(await argsFor(f, 'generate')));
    const args = await argsFor(f, 'regenerate');
    const receipts = (await Promise.all([manage(args), manage({...args, p_candidate: candidate()})])).map(ok);
    assert.equal(receipts[0].token_id, receipts[1].token_id);
    assert.equal(receipts.filter(receipt => receipt.replayed).length, 1);
    assert.equal(receipts[0].outcome, 'regenerated');
    assert.equal(receipts[0].revoked_count, 1);
    assert.equal(await tokenCount(f), '2');
    assert.equal(await activeCount(f), '1');
    assert.equal(await revision(f), String(f.edit_revision), 'Link rotation does not pretend the business document was edited');
    assert.notEqual(receipts[0].token_id, generated.token_id);
    const replay = ok(await manage({...args, p_candidate: candidate()}));
    assert.equal(replay.replayed, true);
    assert.equal(replay.token_id, receipts[0].token_id);
    assert.equal(replay.token_encrypted, receipts[0].token_encrypted);
    assert.equal(await tokenCount(f), '2');
  });

  await run('competing regeneration and revocation of the same link digest have one mutation winner', async () => {
    const f = await fixture();
    ok(await manage(await argsFor(f, 'generate')));
    const version = (await linkState(f)).link_version;
    const rotate = {...identity(f, version, 'regenerate'), p_candidate: candidate()};
    const revoke = {...identity(f, version, 'revoke'), p_candidate: null};
    const results = await Promise.all([manage(rotate), manage(revoke)]);
    assert.equal(results.filter(result => !result.error).length, 1);
    assert.equal(results.find(result => result.error).error.code, 'PT409');
    const winner = ok(results.find(result => !result.error));
    assert.equal(await activeCount(f), winner.intent === 'regenerate' ? '1' : '0');
    assert.equal(await revision(f), String(f.edit_revision));
  });

  await run('different initial generation requests cannot create competing active capabilities', async () => {
    const f = await fixture(), version = (await linkState(f)).link_version;
    const results = await Promise.all([manage({...identity(f, version, 'generate'), p_candidate: candidate()}),
      manage({...identity(f, version, 'generate'), p_candidate: candidate()})]);
    assert.equal(results.filter(result => !result.error).length, 1);
    assert.equal(results.find(result => result.error).error.code, 'PT409');
    assert.equal(ok(results.find(result => !result.error)).outcome, 'created');
    assert.equal(await tokenCount(f), '1');
    assert.equal(await activeCount(f), '1');
  });

  await run('offboarding during a link parent-lock wait refuses the old authenticated session', async () => {
    const f = await fixture(), original = ok(await manage(await argsFor(f, 'generate')));
    const args = await argsFor(f, 'regenerate'), lock = await hold(f.job);
    const pending = Promise.resolve(manage(args));
    try {
      await blocked(lock.pid);
      await sql(`update profiles set status='disabled' where id=${lit(actor)}`);
    } finally { await lock.release(); }
    try {
      assert.equal((await pending).error?.code, '42501');
      assert.equal(await tokenCount(f), '1');
      assert.equal(await sql(`select revoked_at is null from change_order_portal_tokens where id=${lit(original.token_id)}`), 't');
    } finally { await sql(`update profiles set status='active' where id=${lit(actor)}`); }
  });

  await run('a committed document edit during the lock wait rejects stale rotation without revoking the existing link', async () => {
    const f = await fixture(), original = ok(await manage(await argsFor(f, 'generate')));
    const args = await argsFor(f, 'regenerate'), lock = await hold(f.job);
    const pending = Promise.resolve(manage(args));
    try {
      await blocked(lock.pid);
      await lock.change(`update change_orders set title='Synthetic changed document while rotation waited' where id=${lit(f.id)}`);
    } finally { await lock.release(true); }
    assert.equal((await pending).error?.code, 'PT409');
    assert.equal(await tokenCount(f), '1');
    assert.equal(await sql(`select revoked_at is null from change_order_portal_tokens where id=${lit(original.token_id)}`), 't');
  });

  await run('a lost generation result cannot reveal or resurrect its capability after a newer rotation', async () => {
    const f = await fixture(), args = await argsFor(f, 'generate'), original = ok(await manage(args));
    const replacement = ok(await manage(await argsFor(f, 'regenerate')));
    for (const receipt of [ok(await office.rpc('get_change_order_link_request', receiptIdentity(args))),
      ok(await manage({...args, p_candidate: candidate()}))]) {
      assert.equal(receipt.replayed, true);
      assert.equal(receipt.token_available, false);
      assert.equal(receipt.token_encrypted, null);
      assert.equal(receipt.token_hash, null);
      assert.equal(receipt.current_link_version, replacement.current_link_version);
    }
    assert.equal(await sql(`select revoked_at is not null from change_order_portal_tokens where id=${lit(original.token_id)}`), 't');
    assert.equal(await sql(`select revoked_at is null from change_order_portal_tokens where id=${lit(replacement.token_id)}`), 't');
    assert.equal(await tokenCount(f), '2');
    assert.equal(await activeCount(f), '1');
  });

  await run('view and use telemetry does not invalidate an otherwise current link-management decision', async () => {
    const f = await fixture(), generated = ok(await manage(await argsFor(f, 'generate')));
    const args = await argsFor(f, 'regenerate'), before = (await linkState(f)).link_version;
    ok(await service.from('change_order_portal_tokens').update({viewed_at: new Date().toISOString(),
      used_at: new Date().toISOString(), updated_at: new Date().toISOString()}).eq('id', generated.token_id));
    assert.equal((await linkState(f)).link_version, before);
    const rotated = ok(await manage(args));
    assert.equal(rotated.outcome, 'regenerated');
    assert.notEqual(rotated.current_link_version, before);
    assert.equal(await tokenCount(f), '2');
  });

  await run('link revocation racing a prepared email claim admits only a still-valid capability or records no attempt', async () => {
    const f = await fixture(), generated = ok(await manage(await argsFor(f, 'generate')));
    const source = ok(await service.rpc('get_change_order_send_source', {p_change_order_id: f.id,
      p_expected_revision: f.edit_revision, p_actor_id: actor}));
    const delivery = ok(await service.rpc('prepare_change_order_send', {p_request_id: randomUUID(), p_change_order_id: f.id,
      p_expected_revision: f.edit_revision, p_actor_id: actor, p_additional_copy: false, p_portal_token_id: generated.token_id,
      p_expected_snapshot: source.snapshot, p_payload: {from: 'Synthetic office <office@example.invalid>', reply_to: 'office@example.invalid',
        to: [f.recipient], cc: [], subject: 'Synthetic queued approval link', text: 'Synthetic local-only approval link fixture.'}}));
    const revokeArgs = await argsFor(f, 'revoke');
    const [revoked, claimed] = await Promise.all([manage(revokeArgs), service.rpc('claim_outbound_delivery', {p_delivery_id: delivery.delivery_id})]);
    ok(revoked);
    const claim = ok(claimed);
    assert.equal(await activeCount(f), '0');
    if (claim) {
      assert.equal(claim.id, delivery.delivery_id);
      assert.ok(claim.attempt_id);
      assert.equal(await sql(`select attempt_count from app_private.outbound_deliveries where id=${lit(delivery.delivery_id)}`), '1');
      ok(await service.rpc('finish_outbound_delivery', {p_delivery_id: delivery.delivery_id, p_attempt_id: claim.attempt_id,
        p_outcome: 'not_attempted', p_provider_message_id: null}));
    } else {
      assert.equal(await sql(`select attempt_count from app_private.outbound_deliveries where id=${lit(delivery.delivery_id)}`), '0');
    }
    assert.equal(ok(await service.rpc('claim_outbound_delivery', {p_delivery_id: delivery.delivery_id})), null);
    assert.equal(await sql(`select count(*) from email_events where related_change_order_id=${lit(f.id)}`), '0');
  });

  await run('untrusted callers and direct staff token writes cannot bypass the reviewed office command', async () => {
    const f = await fixture(), args = await argsFor(f, 'generate');
    for (const client of [anonymous, service]) {
      assert.equal((await client.rpc('get_change_order_link_state', {p_change_order_id: f.id})).error?.code, '42501');
      assert.equal((await client.rpc('get_change_order_link_request', receiptIdentity(args))).error?.code, '42501');
      assert.equal((await client.rpc('manage_change_order_portal_link', args)).error?.code, '42501');
    }
    const cap = candidate();
    for (const client of [office, service]) assert.equal((await client.rpc('create_or_get_change_order_portal_token', {
      p_change_order_id: f.id, p_token_hash: cap.token_hash, p_token_hint: cap.token_hint,
      p_token_encrypted: cap.token_encrypted, p_expires_at: cap.expires_at,
    })).error?.code, '42501');
    assert.equal((await office.from('change_order_portal_tokens').insert({change_order_id: f.id, customer_id: f.customer,
      token_hash: cap.token_hash, token_hint: cap.token_hint, token_encrypted: cap.token_encrypted, expires_at: cap.expires_at})).error?.code, '42501');
    const generated = ok(await manage(args));
    assert.equal((await office.from('change_order_portal_tokens').update({revoked_at: new Date().toISOString()})
      .eq('id', generated.token_id)).error?.code, '42501');
    assert.equal((await office.from('change_order_portal_tokens').delete().eq('id', generated.token_id)).error?.code, '42501');
    assert.equal(await tokenCount(f), '1');
    assert.equal(await activeCount(f), '1');
  });

  if (process.env.CO_LINK_FIXTURES_FILE) {
    const browser = await fixture(), state = await linkState(browser);
    writeFileSync(process.env.CO_LINK_FIXTURES_FILE, JSON.stringify({email, password, actor, order: browser.id, job: browser.job,
      customer: browser.customer, recipient: browser.recipient, initialRevision: browser.edit_revision, linkVersion: state.link_version}) + '\n', {mode: 0o600});
    browserFixtureRetained = true;
  }
});
