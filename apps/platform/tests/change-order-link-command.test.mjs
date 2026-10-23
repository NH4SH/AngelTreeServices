import * as branding from '../src/lib/company-brand.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { load } from './pr10-test-helpers.mjs';

const id = randomUUID(), requestId = randomUUID(), tokenId = randomUUID(), userId = randomUUID();
const linkVersion = 'a1'.repeat(32), nextVersion = 'b2'.repeat(32), latestVersion = 'c3'.repeat(32), tokenHash = 'd4'.repeat(32);
const rawToken = 'synthetic-customer-link-capability', encryptedToken = 'synthetic-encrypted-capability';
const base = { request_id: requestId, id, intent: 'generate', reviewed_revision: 4, reviewed_link_version: linkVersion,
  token_id: tokenId, outcome: 'created', revoked_count: 0, link_version: nextVersion, current_link_version: nextVersion,
  current_revision: 4, current_status: 'ready_to_send', replayed: false, token_available: true,
  token_encrypted: encryptedToken, token_hash: tokenHash, expires_at: '2026-12-01T00:00:00.000Z' };

function commandFixture(options = {}) {
  const calls = [], crypto = [], supabase = { from: () => assert.fail('Link changes must use atomic commands') };
  const receipt = { ...base, ...options.receipt };
  const helper = load('../src/lib/portal/change-order-links.ts', {
    'server-only': {},
    '@/lib/email/delivery-commands': { callDeliveryCommand: async (client, name, args) => {
      assert.equal(client, supabase); calls.push({ name, args });
      if (options.errors?.[name]) return { data: null, error: options.errors[name] };
      if (name === 'get_change_order_link_request') return { data: options.fresh ? null : receipt, error: null };
      if (name === 'manage_change_order_portal_link') return { data: receipt, error: null };
      assert.fail('Unexpected link command ' + name);
    } },
    '@/lib/portal/tokens': {
      QUOTE_PORTAL_LINK_LIFETIME_DAYS: 30,
      generatePortalToken: () => { crypto.push('generate'); return rawToken; },
      hashPortalToken: raw => { crypto.push('hash'); assert.equal(raw, rawToken); return options.hash ?? tokenHash; },
      encryptPortalToken: raw => { crypto.push('encrypt'); assert.equal(raw, rawToken); return options.encryptionError ? { error: 'Recovery key unavailable', encryptedToken: null } : { error: null, encryptedToken }; },
      getPortalTokenHint: raw => { crypto.push('hint'); assert.equal(raw, rawToken); return 'synthetic-hint'; },
      decryptPortalToken: value => { crypto.push('decrypt'); assert.equal(value, encryptedToken); return options.decryptUnavailable ? null : rawToken; },
    },
  });
  const input = { changeOrderId: id, requestId, revision: 4, linkVersion, intent: receipt.intent, supabase };
  return { calls, crypto, receipt, input, helper, run: () => helper.performChangeOrderLinkCommand(input),
    token: () => { const { intent, ...tokenInput } = input; return helper.createOrGetChangeOrderPortalTokenRecord(tokenInput); } };
}

test('new link actions look for their receipt before generating a candidate and bind the reviewed identity', async () => {
  for (const [intent, outcome] of [['generate', 'created'], ['regenerate', 'regenerated']]) {
    const f = commandFixture({ fresh: true, receipt: { intent, outcome } }), result = await f.run();
    assert.equal(result.error, null);
    assert.deepEqual(f.calls.map(call => call.name), ['get_change_order_link_request', 'manage_change_order_portal_link']);
    const identity = { p_request_id: requestId, p_change_order_id: id, p_expected_revision: 4, p_expected_link_version: linkVersion, p_intent: intent };
    assert.deepEqual(f.calls[0].args, identity);
    const candidate = f.calls[1].args.p_candidate;
    assert.deepEqual({ ...f.calls[1].args, p_candidate: undefined }, { ...identity, p_candidate: undefined });
    assert.deepEqual({ ...candidate, expires_at: undefined }, { token_hash: tokenHash, token_hint: 'synthetic-hint', token_encrypted: encryptedToken, expires_at: undefined });
    assert.ok(Number.isFinite(Date.parse(candidate.expires_at)));
    assert.deepEqual(f.crypto, ['generate', 'hash', 'encrypt', 'hint']);
  }
});

test('receipt recovery avoids every new crypto operation even after a later link replacement', async () => {
  const f = commandFixture({ receipt: { replayed: true, current_revision: 9, current_link_version: latestVersion,
    current_status: 'sent', token_available: false, token_encrypted: null, token_hash: null } });
  const result = await f.run();
  assert.equal(result.error, null); assert.equal(result.data.current_link_version, latestVersion);
  assert.equal(result.data.token_available, false); assert.equal(result.data.replayed, true);
  assert.deepEqual(f.calls.map(call => call.name), ['get_change_order_link_request']); assert.deepEqual(f.crypto, []);
});

test('a superseded recovered request exposes metadata but never its old raw capability', async () => {
  const f = commandFixture({ receipt: { replayed: true, current_link_version: latestVersion, token_available: false, token_encrypted: null, token_hash: null } });
  const result = await f.token();
  assert.equal(result.reviewRequired, true); assert.match(result.error, /replaced or revoked/);
  assert.equal(result.rawToken, ''); assert.equal(result.tokenId, ''); assert.deepEqual(f.crypto, []);
});

test('sending recovers a raw capability only when the saved ciphertext decrypts to the acknowledged hash', async () => {
  const f = commandFixture({ receipt: { outcome: 'reused' } }), result = await f.token();
  assert.equal(result.error, null); assert.equal(result.rawToken, rawToken); assert.equal(result.tokenId, tokenId);
  assert.equal(result.created, false); assert.equal(result.expiresAt, base.expires_at);
  assert.deepEqual(f.crypto, ['decrypt', 'hash']);
});

test('mismatched hashes or unavailable decryption cannot expose a raw token or claim a usable sending link', async () => {
  for (const options of [{ hash: 'e5'.repeat(32) }, { decryptUnavailable: true }]) {
    const f = commandFixture(options), result = await f.token();
    assert.match(result.error, /cannot be recovered/); assert.equal(result.rawToken, ''); assert.equal(result.tokenId, '');
    assert.equal(f.calls.length, 1); assert.ok(!f.crypto.includes('generate'));
  }
});

test('new revocation works without encryption and never creates a replacement candidate', async () => {
  const f = commandFixture({ fresh: true, encryptionError: true, receipt: { intent: 'revoke', outcome: 'revoked', token_id: null,
    revoked_count: 2, token_available: false, token_encrypted: null, token_hash: null, expires_at: null } });
  const result = await f.run(); assert.equal(result.error, null); assert.equal(result.data.revoked_count, 2);
  assert.equal(f.calls[1].args.p_candidate, null); assert.deepEqual(f.crypto, []);
});

test('lookup errors and unavailable encryption stop before an unconfirmed mutation', async () => {
  const error = { code: 'PT409', message: 'Review the current record' };
  const lookup = commandFixture({ fresh: true, errors: { get_change_order_link_request: error } });
  assert.deepEqual((await lookup.run()).error, error); assert.equal(lookup.calls.length, 1); assert.deepEqual(lookup.crypto, []);
  const missing = commandFixture({ fresh: true, encryptionError: true });
  assert.equal((await missing.run()).error.code, 'LINK_RECOVERY_UNAVAILABLE'); assert.equal(missing.calls.length, 1);
  const mutation = commandFixture({ fresh: true, errors: { manage_change_order_portal_link: error } });
  assert.deepEqual((await mutation.run()).error, error); assert.equal(mutation.calls.length, 2);
  assert.equal((await commandFixture({ errors: { get_change_order_link_request: error } }).token()).reviewRequired, true);
});

test('malformed or mismatched receipts cannot acknowledge a link action or reach decryption', async () => {
  const changes = [{ request_id: randomUUID() }, { id: randomUUID() }, { intent: 'regenerate' }, { reviewed_revision: 5 },
    { reviewed_link_version: latestVersion }, { outcome: 'revoked' }, { revoked_count: -1 }, { revoked_count: 0.5 },
    { link_version: 'bad' }, { current_link_version: 'A'.repeat(64) }, { current_revision: 3 }, { current_revision: 4.5 },
    { current_status: 'unknown' }, { current_status: null }, { replayed: null }, { token_available: 'yes' },
    { token_id: 'bad' }, { token_id: null }, { token_encrypted: '' }, { token_encrypted: 23 }, { token_hash: 'bad' },
    { token_available: false }, { expires_at: 'not-a-date' }];
  for (const change of changes) {
    const f = commandFixture({ receipt: change });
    // Intent is supplied independently from an untrusted returned receipt.
    f.input.intent = 'generate';
    const result = await f.run();
    assert.equal(result.error?.code, 'LINK_UNCONFIRMED', JSON.stringify(change));
    assert.equal(result.data, null); assert.deepEqual(f.crypto, []);
  }
  const revoke = commandFixture({ receipt: { intent: 'revoke', outcome: 'revoked', token_id: null } });
  assert.equal((await revoke.run()).error?.code, 'LINK_UNCONFIRMED');
});

function actionFixture(options = {}) {
  const calls = [], paths = [], supabase = { auth: { getUser: async () => ({ data: { user: options.signedOut ? null : { id: userId } } }) },
    from: () => assert.fail('Link actions must not perform separate table writes') };
  const actions = load('../src/lib/actions/change-orders.ts', {'../company-brand.ts':branding,
    '@/lib/email/delivery-commands': { callDeliveryCommand: () => assert.fail('Link actions must use the shared reviewed helper') },
    'next/cache': { revalidatePath: path => paths.push(path) }, '@/lib/activity-log': { recordActivity: () => assert.fail('Audit belongs to transaction') },
    '@/lib/auth/roles': { getUserRoles: async () => options.roles ?? ['estimator'], hasAllowedRole: (roles, allowed) => roles.some(role => allowed.includes(role)), platformRoleGroups: { internalStaff: ['owner', 'admin', 'payroll_admin', 'estimator'] } },
    '@/lib/data/change-orders': {}, '@/lib/notifications/source-events': {}, '@/lib/portal/tokens': {}, '@/lib/email/send': {}, '@/lib/email/config': {},
    '@/lib/email/delivery': {}, '@/lib/email/delivery-followups': {},
    '@/lib/portal/change-order-links': { performChangeOrderLinkCommand: async input => { calls.push(input); return options.error ? { data: null, error: options.error } : { data: { ...base, intent: input.intent,
      outcome: input.intent === 'generate' ? 'created' : input.intent === 'regenerate' ? 'regenerated' : 'revoked', ...options.receipt }, error: null }; } },
    '@/lib/portal/urls': { getPortalUrl: () => assert.fail('Server action receipts must never return capability URLs') },
    '@/lib/supabase/server': { createClient: async () => supabase }, '@/lib/supabase/admin': {}, '@/lib/security/portal-rate-limit': {}, '@/lib/security/errors': { safeStaffMessage: value => value },
  });
  const form = overrides => { const f = new FormData(); for (const [key, value] of Object.entries({ change_order_id: id, request_id: requestId, expected_revision: '4', expected_link_version: linkVersion, ...overrides })) f.set(key, value); return f; };
  return { calls, paths, supabase, run: (action, input = {}) => actions[action]({}, form(input)) };
}

test('all three staff link actions delegate bound identities and return only nonsecret completion metadata', async () => {
  for (const [action, intent] of [['createChangeOrderPortalLink', 'generate'], ['regenerateChangeOrderPortalLink', 'regenerate'], ['revokeChangeOrderPortalLink', 'revoke']]) {
    const f = actionFixture(), result = await f.run(action, { actor_id: randomUUID(), raw_token: 'forged' });
    assert.equal(result.status, 'success'); assert.deepEqual(f.calls, [{ changeOrderId: id, requestId, revision: 4, linkVersion, intent, supabase: f.supabase }]);
    assert.equal(result.savedLinkVersion, nextVersion); assert.equal(result.saveDestination, `/admin/change-orders/${id}?link_action=${requestId}`);
    assert.deepEqual(Object.keys(result).sort(), ['message', 'saveDestination', 'savedLinkVersion', 'status']);
    assert.doesNotMatch(JSON.stringify(result), /synthetic-customer-link-capability|synthetic-encrypted-capability|token_hash|token_encrypted/);
    assert.deepEqual(f.paths, [`/admin/change-orders/${id}`]);
  }
  const recovered = await actionFixture({ receipt: { replayed: true, current_link_version: latestVersion } }).run('createChangeOrderPortalLink');
  assert.match(recovered.message, /earlier link action/); assert.equal(recovered.savedLinkVersion, latestVersion);
});

test('malformed identities and unauthorized sessions cannot invoke staff link mutations', async () => {
  for (const overrides of [{ request_id: '' }, { change_order_id: 'bad' }, { expected_revision: '' }, { expected_revision: '-1' },
    { expected_revision: '4.5' }, { expected_revision: '9007199254740992' }, { expected_link_version: '' }, { expected_link_version: 'A'.repeat(64) }]) {
    const f = actionFixture(), result = await f.run('createChangeOrderPortalLink', overrides);
    assert.equal(result.status, 'error'); assert.equal(result.saveRejected, true); assert.equal(f.calls.length, 0);
  }
  for (const options of [{ signedOut: true }, { roles: ['crew'] }]) {
    const f = actionFixture(options); assert.equal((await f.run('revokeChangeOrderPortalLink')).status, 'error'); assert.equal(f.calls.length, 0);
  }
});

test('definite link conflicts require review while an uncertain response retains same-request recovery', async () => {
  for (const code of ['PT409', '40001', '23514', '42501']) {
    const f = actionFixture({ error: { code, message: 'Review the current link' } }), result = await f.run('regenerateChangeOrderPortalLink');
    assert.equal(result.saveRejected, true); assert.equal(result.reviewRequired, true); assert.equal(result.saveDestination, undefined); assert.equal(f.paths.length, 0);
  }
  const result = await actionFixture({ error: { code: 'LINK_UNCONFIRMED', message: 'Private database diagnostic' } }).run('regenerateChangeOrderPortalLink');
  assert.equal(result.saveRejected, false); assert.equal(result.reviewRequired, false); assert.doesNotMatch(result.message, /Private/);
});

function readerFixture(options = {}) {
  const calls = [], decrypts = [], urls = [], client = { from: () => assert.fail('Token listing must use the guarded state command') };
  const tokens = options.tokens ?? [{ id: tokenId, token_hint: 'hint', token_encrypted: encryptedToken, token_hash: tokenHash, usable: true,
    expires_at: base.expires_at, viewed_at: null, used_at: null, revoked_at: null, created_at: '2026-10-22T00:00:00Z', extraPrivate: 'private' }];
  const data = load('../src/lib/data/change-orders.ts', {'../company-brand.ts':branding,
    'server-only': {}, '@/lib/email/delivery-commands': { callDeliveryCommand: async (db, name, args) => { assert.equal(db, client); calls.push({ name, args }); return options.result ?? { data: { link_version: linkVersion, tokens }, error: null }; } },
    '@/lib/portal/tokens': { decryptPortalToken: value => { decrypts.push(value); return rawToken; }, hashPortalToken: raw => { assert.equal(raw, rawToken); return options.hash ?? tokenHash; } },
    '@/lib/portal/urls': { getPortalUrl: async (kind, raw) => { assert.equal(kind, 'change-order'); assert.equal(raw, rawToken); urls.push(raw); return 'https://synthetic.invalid/current-link'; } },
    '@/lib/supabase/server': { createClient: async () => options.unavailable ? null : client }, '@/lib/supabase/admin': {}, '@/lib/security/errors': { safeStaffMessage: value => value },
  });
  return { calls, decrypts, urls, run: () => data.getChangeOrderTokens(id) };
}

test('token summaries strip encrypted and hash fields and expose only usable hash-verified current URLs', async () => {
  const good = readerFixture(), result = await good.run();
  assert.equal(result.error, null); assert.equal(result.linkVersion, linkVersion);
  assert.deepEqual(good.calls, [{ name: 'get_change_order_link_state', args: { p_change_order_id: id } }]);
  assert.deepEqual(Object.keys(result.data[0]).sort(), ['created_at', 'expires_at', 'id', 'portalUrl', 'revoked_at', 'token_hint', 'usable', 'used_at', 'viewed_at']);
  assert.equal(result.data[0].portalUrl, 'https://synthetic.invalid/current-link');
  assert.doesNotMatch(JSON.stringify(result), /token_encrypted|token_hash|extraPrivate|synthetic-encrypted-capability/);
  const mismatched = readerFixture({ hash: 'e5'.repeat(32) });
  assert.equal((await mismatched.run()).data[0].portalUrl, null); assert.deepEqual(mismatched.urls, []);
  const unusable = readerFixture({ tokens: [{ ...base, id: tokenId, usable: false, token_encrypted: encryptedToken, token_hash: tokenHash }] });
  assert.equal((await unusable.run()).data[0].portalUrl, null); assert.deepEqual(unusable.decrypts, []); assert.deepEqual(unusable.urls, []);
});

test('unavailable or malformed token state fails closed without exposing a link version or capabilities', async () => {
  for (const options of [{ unavailable: true }, { result: { data: null, error: { message: 'Unavailable' } } },
    { result: { data: { link_version: 'bad', tokens: [] }, error: null } }, { result: { data: { link_version: linkVersion, tokens: null }, error: null } },
    { result: { data: { link_version: linkVersion, tokens: [null] }, error: null } },
    { result: { data: { link_version: linkVersion, tokens: [{ id: tokenId, usable: true, token_encrypted: 23 }] }, error: null } }]) {
    const f = readerFixture(options), result = await f.run(); assert.deepEqual(result.data, []); assert.equal(result.linkVersion, null); assert.equal(typeof result.error, 'string'); assert.deepEqual(f.decrypts, []);
  }
});
