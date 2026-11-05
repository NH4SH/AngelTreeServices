// Test-only VM linker. All signing authority, secrets, SDK clients and filesystem facts are synthetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';
import { fixture, testSigningSecret, changed } from './test-fixture.mjs';
import * as core from '../../src/lib/firewood/runtime-admission/released-context-core.mjs';
import { assertReadOnlyMount } from '../../src/lib/firewood/runtime-admission/release-filesystem.mjs';
import * as live from '../../src/lib/firewood/handoff/live-contract.mjs';
import * as office from '../../src/lib/firewood/handoff/office-contract.mjs';
import * as liveAdapter from '../../src/lib/firewood/handoff/live-database.mjs';
import * as officeAdapter from '../../src/lib/firewood/handoff/office-database.mjs';
import { createSupabaseServerFetch } from '../../src/lib/supabase/server-transport.mjs';
import { makeCapability, decryptCapability } from '../../src/lib/firewood/handoff/handler.mjs';

const secretPath = '/run/secrets/firewood_handoff.json';
const serviceKey = 'synthetic_unit_service_role_bytes_only_'.repeat(5);
const sha = value => createHash('sha256').update(value).digest('hex');
async function harness(mutate = () => {}) {
  const { snapshot } = fixture();
  const state = { snapshot, wallMs: snapshot.wallMs, secretReads: 0, envReads: [], stats: 0, clients: [], rpcs: [],
    secret: { version: 1, keyId: 'synthetic_unit_key_0001', signingSecret: testSigningSecret,
      encryptionKeyBase64: Buffer.alloc(32, 42).toString('base64'), serviceKeyFingerprint: sha(serviceKey) },
    stat: { uid: 0, gid: 1000, dev: 1, ino: 11, mode: 0o100440, nlink: 1, isFile: () => true, isSymbolicLink: () => false },
    env: { SUPABASE_SERVICE_ROLE_KEY: serviceKey, NEXT_PUBLIC_SUPABASE_URL: 'https://admin.angeltreeservices.org/backend',
      PORTAL_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 42).toString('base64'),
      SUPABASE_INTERNAL_URL: 'http://api-gw:8000', FIREWOOD_HANDOFF_V2_TEST_ENABLED: '1', FIREWOOD_HANDOFF_V2_STAGING_ENABLED: '1',
      FIREWOOD_HANDOFF_LIVE_ENABLED: '1' },
    mountinfo: '1 0 0:1 / / rw - overlay overlay rw\n2 1 0:2 / /run/secrets ro - tmpfs tmpfs rw\n',
    onClient: null, onRpc: null };
  mutate(state);
  class Clock extends Date { static now() { return state.wallMs; } }
  const privateEnvironment = new Proxy(state.env, { get(target, key) { state.envReads.push(key); return target[key]; } });
  const context = createContext({ process: { platform: 'linux', getuid: () => 1000, getgid: () => 1000, pid: 123, env: privateEnvironment },
    Date: Clock, Buffer, URL, TextDecoder, AbortSignal, Request });
  const synthetic = exports => new SyntheticModule(Object.keys(exports), function () {
    for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
  }, { context });
  const coreModule = synthetic(core);
  const gateFs = synthetic({ readFixedSnapshot: () => ({ ...state.snapshot }) });
  const gate = new SourceTextModule(readFileSync(new URL('../../src/lib/firewood/runtime-admission/released-context.mjs', import.meta.url), 'utf8'), { context });
  await gate.link(name => {
    if (name === './released-context-core.mjs') return coreModule;
    if (name === './release-filesystem.mjs') return gateFs;
    throw Error('Unexpected gate import');
  });
  await gate.evaluate();
  const filesystem = synthetic({ assertReadOnlyMount, readBoundedFile: (path, limit) => {
    if (path === '/proc/123/mountinfo') return Buffer.from(state.mountinfo);
    assert.equal(path, secretPath); assert.equal(limit, 8192); state.secretReads++;
    return Buffer.from(JSON.stringify(state.secret));
  } });
  const sdk = synthetic({ createClient: (url, key, config) => {
    state.clients.push({ url, key, config }); state.onClient?.();
    return { rpc(name, args) { state.rpcs.push({ name, args }); return { async abortSignal() {
      await state.onRpc?.(); return { error: null, data: { syntheticReceipt: true } };
    } }; } };
  } });
  const modules = new Map([
    ['server-only', synthetic({})], ['node:fs', synthetic({ lstatSync(path) { assert.equal(path, secretPath); state.stats++; return state.stat; } })],
    ['node:crypto', synthetic({ createHash, createCipheriv, createDecipheriv, randomBytes })], ['@supabase/supabase-js', sdk],
    ['../../supabase/server-transport.mjs', synthetic({ createSupabaseServerFetch })],
    ['../runtime-admission/released-context.mjs', gate], ['../runtime-admission/released-context-core.mjs', coreModule],
    ['../runtime-admission/release-filesystem.mjs', filesystem], ['./live-database.mjs', synthetic(liveAdapter)],
    ['./office-database.mjs', synthetic(officeAdapter)], ['./live-contract.mjs', synthetic(live)], ['./office-contract.mjs', synthetic(office)],
  ]);
  const entry = new SourceTextModule(readFileSync(new URL('../../src/lib/firewood/handoff/protected-runtime.mjs', import.meta.url), 'utf8'), { context });
  await entry.link(name => { assert.ok(modules.has(name), name); return modules.get(name); });
  await entry.evaluate();
  const ui = new SourceTextModule(readFileSync(new URL('../../src/lib/firewood/office-runtime.ts', import.meta.url), 'utf8'), { context });
  await ui.link(name => {
    if (name === 'server-only') return modules.get(name);
    if (name === './runtime-admission/released-context.mjs') return gate;
    throw Error('Office UI imported an unexpected dependency');
  });
  await ui.evaluate();
  const tokens = new SourceTextModule(stripTypeScriptTypes(readFileSync(new URL('../../src/lib/portal/tokens.ts', import.meta.url), 'utf8')), { context });
  await tokens.link(name => { assert.ok(modules.has(name), name); return modules.get(name); });
  await tokens.evaluate();
  return { state, api: entry.namespace, ui: ui.namespace, tokens: tokens.namespace };
}
const source = { p_source: live.LIVE_HANDOFF_SOURCE };
test('closed master gate causes zero secret reads, SDK clients and RPCs despite environment flags', async () => {
  const { state, api } = await harness(s => { s.snapshot.latchAbsent = false; });
  assert.equal(api.getProtectedLiveDependencies('preparation', 'prepare'), null);
  assert.equal(api.getProtectedOfficeDependencies('price-request'), null);
  assert.equal(api.getProtectedOfficeDependencies('order-status'), null);
  assert.equal(state.secretReads, 0); assert.equal(state.stats, 0); assert.equal(state.clients.length, 0); assert.equal(state.rpcs.length, 0);
  assert.equal(state.envReads.length, 0);
});
test('office UI receives only fresh public context and never service credentials or a client', async () => {
  const { state, ui } = await harness(s => changed(s.snapshot, 'descriptor', d => { d.modes.preparation = false; }));
  const office = ui.getFirewoodOfficeRuntime(); assert.ok(office); assert.equal(office.mode, 'office');
  assert.equal(office.signingSecret, undefined); assert.equal(office.serviceKey, undefined); assert.equal(office.admitted, undefined);
  assert.equal(state.secretReads, 0); assert.equal(state.envReads.length, 0); assert.equal(state.clients.length, 0);
  changed(state.snapshot, 'descriptor', d => { d.modes.office = false; });
  assert.equal(ui.getFirewoodOfficeRuntime(), null); assert.equal(state.rpcs.length, 0);
});
test('fresh protected metadata supplies the frozen fixed adapter and a new client on each getter', async () => {
  const { state, api } = await harness();
  const first = api.getProtectedLiveDependencies('preparation', 'prepare'), second = api.getProtectedLiveDependencies('preparation', 'prepare');
  assert.ok(first && second); assert.notEqual(first, second); assert.equal(state.clients.length, 2);
  assert.equal(first.config.signingSecret, testSigningSecret); assert.equal(first.config.encryptionKey.length, 32);
  assert.equal(first.config.officeEnabled, true);
  assert.equal(state.clients[0].url, 'https://admin.angeltreeservices.org/backend');
  assert.equal(state.clients[0].key, serviceKey); assert.equal(state.clients[0].config.auth.persistSession, false);
  await first.db.call('get_firewood_live_handoff_context', source); assert.equal(state.rpcs.length, 1);
});
test('status and office reconciliation stay available when preparation and office controls are paused', async () => {
  const { state, api } = await harness(s => changed(s.snapshot, 'descriptor', d => { d.modes.preparation = false; d.modes.office = false; }));
  assert.equal(api.getProtectedLiveDependencies('preparation', 'prepare'), null);
  assert.equal(api.getProtectedOfficeDependencies('price-request'), null);
  assert.equal(state.secretReads, 0);
  assert.ok(api.getProtectedLiveDependencies('status', 'status'));
  const status = api.getProtectedOfficeDependencies('order-status'); assert.ok(status); assert.equal(status.config.officeEnabled, true);
  await status.db.call('read_firewood_live_handoff', source); assert.equal(state.rpcs.length, 1);
});
test('price request requires preparation in addition to office and status', async () => {
  const { state, api } = await harness(s => changed(s.snapshot, 'descriptor', d => { d.modes.preparation = false; }));
  assert.equal(api.getProtectedOfficeDependencies('price-request'), null);
  assert.equal(state.secretReads, 0); assert.equal(state.clients.length, 0);
  assert.ok(api.getProtectedOfficeDependencies('price-status'));
});
for (const [name, mutate] of [
  ['wrong HMAC bytes', s => { s.secret.signingSecret = 'different_synthetic_hmac_secret_0000000'; }],
  ['wrong key ID', s => { s.secret.keyId = 'other_key_0001'; }],
  ['extra secret authority flag', s => { s.secret.enabled = true; }],
  ['noncanonical capability key', s => { s.secret.encryptionKeyBase64 = Buffer.alloc(32).toString('base64').replace('=', ''); }],
  ['wrong capability key length', s => { s.secret.encryptionKeyBase64 = Buffer.alloc(31).toString('base64'); }],
  ['capability key differs from existing portal key', s => { s.env.PORTAL_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 43).toString('base64'); }],
  ['existing portal key is missing', s => { delete s.env.PORTAL_TOKEN_ENCRYPTION_KEY; }],
  ['existing portal key has wrong length', s => { s.env.PORTAL_TOKEN_ENCRYPTION_KEY = Buffer.alloc(31).toString('base64'); }],
  ['wrong service fingerprint', s => { s.secret.serviceKeyFingerprint = '0'.repeat(64); }],
  ['wrong actual private service bytes', s => { s.env.SUPABASE_SERVICE_ROLE_KEY += 'changed'; }],
  ['remote public backend', s => { s.env.NEXT_PUBLIC_SUPABASE_URL = 'https://foreign.supabase.co'; }],
  ['foreign internal transport', s => { s.env.SUPABASE_INTERNAL_URL = 'https://foreign.invalid'; }],
  ['root-private mode instead of approved group mount', s => { s.stat.mode = 0o100400; }],
  ['world-readable secret', s => { s.stat.mode = 0o100444; }],
  ['wrong secret group', s => { s.stat.gid = 0; }],
  ['nonroot secret owner', s => { s.stat.uid = 1000; }],
  ['secret symlink', s => { s.stat.isSymbolicLink = () => true; }],
  ['secret hard link', s => { s.stat.nlink = 2; }],
  ['writable secret mount', s => { s.mountinfo = s.mountinfo.replace('/run/secrets ro', '/run/secrets rw'); }],
]) test('protected supplier rejects ' + name + ' without a client or RPC', async () => {
  const { state, api } = await harness(mutate);
  assert.equal(api.getProtectedLiveDependencies('preparation', 'prepare'), null);
  assert.equal(state.clients.length, 0); assert.equal(state.rpcs.length, 0);
});
test('actual Firewood capability round-trips through the unchanged generic portal recovery utility', async () => {
  const { api, state, tokens } = await harness(s => {
    s.env.PORTAL_TOKEN_ENCRYPTION_KEY = '  \n' + Buffer.alloc(32, 42).toString('base64').replace(/=$/u, '') + '\n  ';
  });
  const dependencies = api.getProtectedLiveDependencies('preparation', 'prepare'); assert.ok(dependencies);
  const capability = makeCapability(dependencies.config.encryptionKey, state.wallMs);
  const raw = tokens.decryptPortalToken(capability.token_encrypted);
  assert.ok(raw); assert.equal(raw, decryptCapability(capability.token_encrypted, dependencies.config.encryptionKey));
  assert.equal(tokens.hashPortalToken(raw), capability.token_hash);
  assert.equal(tokens.getPortalTokenHint(raw), capability.token_hint);
  assert.equal(state.rpcs.length, 0);
});
test('mode closing during private supplier access returns no dependencies and performs no RPC', async () => {
  const { state, api } = await harness(s => { s.onClient = () => { s.snapshot.latchAbsent = false; }; });
  assert.equal(api.getProtectedLiveDependencies('preparation', 'prepare'), null); assert.equal(state.rpcs.length, 0);
});
test('expiry after getter prevents the first RPC and does not reread private metadata', async () => {
  const { state, api } = await harness(); const deps = api.getProtectedLiveDependencies('preparation', 'prepare');
  const reads = state.secretReads; state.wallMs += 220000; state.snapshot.monotonicMs += 220000;
  await assert.rejects(() => deps.db.call('prepare_firewood_live_handoff', source));
  assert.equal(state.rpcs.length, 0); assert.equal(state.secretReads, reads);
});
test('RPC selection and source are fixed to the classified operation', async () => {
  const { state, api } = await harness(); const deps = api.getProtectedOfficeDependencies('price-status');
  for (const name of ['request_firewood_live_office_price', 'credit_firewood_live_cancellation', 'arbitrary_rpc'])
    await assert.rejects(() => deps.db.call(name, source));
  await assert.rejects(() => deps.db.call('read_firewood_live_office_price', { p_source: 'foreign' }));
  assert.equal(state.rpcs.length, 0);
  await deps.db.call('read_firewood_live_office_price', { ...source, p_order: 'synthetic', p_draft_hash: 'synthetic', ignored: 'filtered' });
  assert.equal(state.rpcs.length, 1); assert.equal(Object.hasOwn(state.rpcs[0].args, 'ignored'), false);
});
test('service credential change after getter is rejected before any network operation', async () => {
  const { state, api } = await harness(); const deps = api.getProtectedLiveDependencies('status', 'status');
  state.env.SUPABASE_SERVICE_ROLE_KEY += 'changed';
  await assert.rejects(() => deps.db.call('get_firewood_live_handoff_context', source)); assert.equal(state.rpcs.length, 0);
});
test('preparation closing after office price getter blocks its first RPC before private reads', async () => {
  const { state, api } = await harness(); const deps = api.getProtectedOfficeDependencies('price-request');
  const reads = state.secretReads;
  changed(state.snapshot, 'descriptor', d => { d.modes.preparation = false; });
  await assert.rejects(() => deps.db.call('request_firewood_live_office_price', source));
  assert.equal(state.rpcs.length, 0); assert.equal(state.secretReads, reads);
});
test('approved capability metadata rotation cannot reuse an older getter', async () => {
  const { state, api } = await harness(); const deps = api.getProtectedLiveDependencies('preparation', 'prepare');
  state.secret.encryptionKeyBase64 = Buffer.alloc(32, 43).toString('base64');
  await assert.rejects(() => deps.db.call('prepare_firewood_live_handoff', source)); assert.equal(state.rpcs.length, 0);
});
test('existing portal key changing after a getter blocks its first capability RPC', async () => {
  const { state, api } = await harness(); const deps = api.getProtectedLiveDependencies('preparation', 'prepare');
  state.env.PORTAL_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 43).toString('base64');
  await assert.rejects(() => deps.db.call('prepare_firewood_live_handoff', source)); assert.equal(state.rpcs.length, 0);
});
test('master closing during RPC yields unconfirmed result and no further RPC', async () => {
  const { state, api } = await harness(); const deps = api.getProtectedOfficeDependencies('order-status');
  state.onRpc = () => { state.snapshot.latchAbsent = false; };
  await assert.rejects(() => deps.db.call('read_firewood_live_handoff', source)); assert.equal(state.rpcs.length, 1);
});
test('fixed request classifiers accept only exact operation paths and approved host bindings', async () => {
  const { api, state } = await harness();
  for (const [path, operation] of [[live.LIVE_PREPARE_PATH, 'prepare'], [live.LIVE_RENEW_PATH, 'renew'], [live.LIVE_STATUS_PATH, 'status']]) {
    const classified = api.classifyLiveHandoffRequest(new Request(live.LIVE_PORTAL_ORIGIN + path, { method: 'POST' }));
    assert.equal(classified.operation, operation); assert.equal(classified.mode, operation === 'status' ? 'status' : 'preparation');
  }
  for (const [path, operation] of [[office.OFFICE_PRICE_REQUEST_PATH, 'price-request'], [office.OFFICE_PRICE_STATUS_PATH, 'price-status'], [office.OFFICE_ORDER_STATUS_PATH, 'order-status']])
    assert.equal(api.classifyOfficeHandoffRequest(new Request(live.LIVE_PORTAL_ORIGIN + path, { method: 'POST' })), operation);
  for (const [url, options] of [
    [live.LIVE_PORTAL_ORIGIN + live.LIVE_PREPARE_PATH, { method: 'GET' }],
    [live.LIVE_PORTAL_ORIGIN + live.LIVE_PREPARE_PATH + '?mode=live', { method: 'POST' }],
    ['https://foreign.invalid' + live.LIVE_PREPARE_PATH, { method: 'POST' }],
    ['http://127.0.0.1:3138' + live.LIVE_PREPARE_PATH, { method: 'POST' }],
    [live.LIVE_PORTAL_ORIGIN + '/api/integrations/firewood/live/v1/office/price-request', { method: 'POST' }],
  ]) {
    assert.equal(api.classifyLiveHandoffRequest(new Request(url, options)), null);
    assert.equal(api.classifyOfficeHandoffRequest(new Request(url, options)), null);
  }
  assert.equal(api.classifyLiveHandoffRequest(new Request('http://127.0.0.1:3138' + live.LIVE_PREPARE_PATH,
    { method: 'POST', headers: { host: new URL(live.LIVE_PORTAL_ORIGIN).host } })).operation, 'prepare');
  assert.equal(api.getProtectedLiveDependencies('status', 'prepare'), null);
  assert.equal(api.getProtectedOfficeDependencies('arbitrary'), null); assert.equal(state.secretReads, 0); assert.equal(state.rpcs.length, 0);
});
