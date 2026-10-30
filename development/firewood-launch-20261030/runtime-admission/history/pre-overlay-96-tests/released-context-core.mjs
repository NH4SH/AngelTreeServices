// Internal, pure validation. This does not admit a database transaction or load credentials.
import assert from 'node:assert/strict';
import { createHash, createPublicKey } from 'node:crypto';
import { validateNativeWalReceipt } from './upstream/native-wal-checkpoint.mjs';
import { backupSourceScope } from './upstream/backup-source-scope.mjs';
import { clockIsSafe } from './upstream/continuous-policy.mjs';

export const MODES = Object.freeze(['status', 'preparation', 'office', 'collection', 'sending']);
export const FIXED_RELEASE = Object.freeze({
  contract: 'firewood-invoice-handoff-live-v1',
  officeContract: 'firewood-office-live-v2',
  source: 'website_firewood_invoice_live_v1', environment: 'ats_firewood_live_v1',
  account: 'acct_1Tv92EI7tY6VHUvU',
  portalOrigin: 'https://admin.angeltreeservices.org',
  websiteOrigin: 'https://checkout.angeltreeservices.org',
  termsHash: 'b58eaaea481bfd1aecf509ef940a8f0bc135f7db4446784533cb3b588c6ac482',
  paymentPolicyHash: '201c6523787fd3e2289843f51e63b1726b85a5fc2978cbae15acf870e79cdad3',
});
export const BASE_RECOVERY_MANIFEST = 'bceb09357e4815948b6e1a8372880fe8ae4b3e078ab365d119467d6b445d0efa';
const OLD_NAMESPACE = 'ats-home-continuous-7445a45dddd9';
const HASH = /^[a-f0-9]{64}$/u;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u;
const descriptorKeys = ['kind', 'bindingSha256', 'namespace', 'generation', 'sourceId', 'sourceScope',
  'sourceEnvironment', 'sourceMigrationCount', 'captureMode', 'privateFileFormat', 'admissionProtocol',
  'systemIdentifier', 'sourceBoot', 'databaseBoot', 'topologyFingerprint', 'timeline',
  'authorityPublicKeyFingerprint', 'schemaSha256', 'releaseComponentDigest',
  'baseRecoverySourceManifestSha256', 'signingKeyId', 'signingKeyFingerprint', 'stripeKeyFingerprint', 'modes',
  ...Object.keys(FIXED_RELEASE)];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function exact(value, keys) {
  assert.ok(object(value));
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort());
}
export const sha256 = value => createHash('sha256').update(value).digest('hex');
const text = bytes => {
  assert.ok(Buffer.isBuffer(bytes));
  // Reject replacement-character decoding and BOMs rather than accepting changed signed/control bytes.
  const value = bytes.toString('utf8');
  assert.ok(Buffer.from(value, 'utf8').equals(bytes) && !value.startsWith('\uFEFF'));
  return value;
};
const json = bytes => JSON.parse(text(bytes));
const deepFreeze = value => {
  if (object(value) || Array.isArray(value)) { Object.values(value).forEach(deepFreeze); Object.freeze(value); }
  return value;
};
export function authorityFingerprint(pem) {
  const key = createPublicKey(pem);
  assert.equal(key.asymmetricKeyType, 'ed25519');
  return sha256(key.export({ type: 'spki', format: 'der' }));
}

// Only the fixed-path reader may supply production snapshots. Exported for isolated unit tests.
export function validateReleasedSnapshot(snapshot, mode) {
  assert.ok(MODES.includes(mode));
  assert.equal(snapshot.platform, 'linux');
  assert.equal(snapshot.uid, 1000);
  assert.equal(snapshot.latchAbsent, true);
  const now = snapshot.wallMs, uptime = snapshot.monotonicMs;
  assert.ok(Number.isSafeInteger(now) && now > 0 && Number.isFinite(uptime) && uptime > 0);
  const descriptor = json(snapshot.descriptor);
  exact(descriptor, descriptorKeys);
  assert.equal(descriptor.kind, 'ats-firewood-release-control-v1');
  assert.equal(descriptor.baseRecoverySourceManifestSha256, BASE_RECOVERY_MANIFEST);
  for (const [key, value] of Object.entries(FIXED_RELEASE)) assert.equal(descriptor[key], value);
  exact(descriptor.modes, MODES);
  for (const flag of MODES) assert.equal(typeof descriptor.modes[flag], 'boolean');
  assert.equal(descriptor.modes.status, true);
  assert.equal(descriptor.modes[mode], true);
  for (const key of ['bindingSha256', 'authorityPublicKeyFingerprint', 'schemaSha256', 'releaseComponentDigest', 'signingKeyFingerprint', 'stripeKeyFingerprint'])
    assert.match(descriptor[key], HASH);
  assert.match(descriptor.signingKeyId, /^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/u);
  assert.equal(sha256(snapshot.binding), descriptor.bindingSha256);
  const binding = json(snapshot.binding);
  assert.equal(backupSourceScope(binding).syntheticOnly, false);
  assert.equal(binding.version, 1);
  assert.equal(binding.sourceScope, 'crm-v1');
  assert.ok(Number.isSafeInteger(binding.generation) && binding.generation > 3);
  assert.notEqual(binding.namespace, OLD_NAMESPACE);
  assert.match(binding.sourceBoot, UUID);
  assert.equal(text(snapshot.bootId).trim(), binding.sourceBoot);
  assert.match(binding.systemIdentifier, /^[0-9]{10,20}$/u);
  assert.match(binding.topology, /^[a-f0-9]{32}$/u);
  assert.ok(Number.isSafeInteger(binding.timeline) && binding.timeline > 0);
  const databaseStartedAtMs = Date.parse(binding.databaseBoot);
  assert.ok(Number.isFinite(databaseStartedAtMs) && databaseStartedAtMs > 0 && databaseStartedAtMs <= now);
  for (const [descriptorKey, bindingKey] of [
    ['namespace', 'namespace'], ['generation', 'generation'], ['sourceId', 'sourceId'],
    ['sourceScope', 'sourceScope'], ['sourceEnvironment', 'environment'],
    ['sourceMigrationCount', 'sourceMigrationCount'], ['captureMode', 'captureMode'],
    ['privateFileFormat', 'privateFileFormat'], ['admissionProtocol', 'admissionProtocol'],
    ['systemIdentifier', 'systemIdentifier'], ['sourceBoot', 'sourceBoot'],
    ['databaseBoot', 'databaseBoot'], ['topologyFingerprint', 'topology'], ['timeline', 'timeline'],
  ]) assert.deepEqual(descriptor[descriptorKey], binding[bindingKey]);
  const authorityPublicKeyFingerprint = authorityFingerprint(snapshot.authorityPublicKey);
  assert.equal(authorityPublicKeyFingerprint, descriptor.authorityPublicKeyFingerprint);
  const active = json(snapshot.active);
  const claims = validateNativeWalReceipt(active.envelope, snapshot.authorityPublicKey, binding, now);
  // Never trust the publisher's unsigned claims mirror or timer/deadline instead of the signed receipt.
  assert.deepEqual(active.claims, claims);
  assert.equal(active.deadlineBootMs, claims.captureStartedBootMs + 280000);
  exact(active.anchor, ['wall', 'monotonic']);
  assert.ok(Number.isSafeInteger(active.anchor.wall) && active.anchor.wall > 0);
  assert.ok(Number.isFinite(active.anchor.monotonic) && active.anchor.monotonic > 0);
  assert.ok(active.anchor.wall <= now && active.anchor.monotonic <= uptime);
  assert.ok(claims.captureStartedBootMs <= uptime);
  assert.ok(uptime < claims.captureStartedBootMs + 280000);
  assert.equal(clockIsSafe(active.anchor, now, uptime), true);
  const released = json(snapshot.workersReleased);
  assert.equal(released.namespace, binding.namespace);
  assert.equal(released.generation, binding.generation);
  assert.equal(released.providerReconciliationVerified, true);
  const captureStartedAtMs = Date.parse(claims.captureStartedAt);
  const backupVerifiedAtMs = Date.parse(claims.offsiteVerifiedAt);
  const receiptExpiresAtMs = Date.parse(claims.expiresAt);
  const backupAgeMs = Math.ceil(uptime - claims.captureStartedBootMs);
  assert.ok(backupAgeMs >= 0 && backupAgeMs < 280000);
  const expiresAtMs = Math.min(receiptExpiresAtMs, Math.floor(now + claims.captureStartedBootMs + 280000 - uptime));
  assert.ok(now - captureStartedAtMs < 280000 && expiresAtMs > now);
  assert.ok(active.anchor.wall >= captureStartedAtMs && active.anchor.monotonic >= claims.captureStartedBootMs);
  // These are public provenance facts. admitted:true belongs only to the separate live SQL fence check.
  return deepFreeze({
    mode, namespace: binding.namespace, generation: binding.generation,
    sourceId: binding.sourceId, systemIdentifier: binding.systemIdentifier,
    sourceBoot: binding.sourceBoot, databaseBoot: binding.databaseBoot, databaseStartedAtMs,
    topologyFingerprint: binding.topology, timeline: binding.timeline,
    bindingSha256: descriptor.bindingSha256, authorityPublicKeyFingerprint,
    schemaSha256: descriptor.schemaSha256, releaseSha256: descriptor.releaseComponentDigest,
    signingKeyId: descriptor.signingKeyId, signingKeyFingerprint: descriptor.signingKeyFingerprint,
    stripeKeyFingerprint: descriptor.stripeKeyFingerprint,
    ...FIXED_RELEASE, modes: { ...descriptor.modes },
    backupCaptureStartedAtMs: captureStartedAtMs, backupVerifiedAtMs,
    captureStartedBootMs: claims.captureStartedBootMs, backupAgeMs, observedMonotonicMs: uptime,
    receiptComponentSha256: claims.componentSha256,
    receiptSequence: claims.sequence, receiptExpiresAtMs, expiresAtMs, observedAtMs: now,
  });
}

export function privateConfigurationMatches(context, config) {
  if (!object(config) || config.enabled !== true || config.profile !== 'live' || config.mode !== 'live'
    || config.keyId !== context.signingKeyId || typeof config.signingSecret !== 'string'
    || !/^[A-Za-z0-9_-]{32,256}$/u.test(config.signingSecret)
    || sha256(Buffer.from(config.signingSecret, 'utf8')) !== context.signingKeyFingerprint
    || !Buffer.isBuffer(config.encryptionKey) || config.encryptionKey.length !== 32
    || typeof config.collectorReady !== 'boolean') return false;
  const names = { contract: 'contract', sourceId: 'source', environmentId: 'environment', accountId: 'account',
    portalOrigin: 'portalOrigin', websiteOrigin: 'websiteOrigin', termsHash: 'termsHash', paymentPolicyHash: 'paymentPolicyHash' };
  for (const [configKey, contextKey] of Object.entries(names)) if (config[configKey] !== context[contextKey]) return false;
  // Handoff-only dependencies need no Stripe credential. If they advertise a Stripe key pin,
  // it cannot disagree with root custody. The collector must independently hash its real key.
  if (Object.hasOwn(config, 'stripeKeyFingerprint') && config.stripeKeyFingerprint !== context.stripeKeyFingerprint) return false;
  if (context.mode === 'office' && config.officeEnabled !== true) return false;
  if (context.mode === 'collection' && config.collectorReady !== true) return false;
  return true;
}

export function sameRelease(a, b) {
  return Boolean(a && b && ['mode', 'namespace', 'generation', 'sourceId', 'systemIdentifier', 'sourceBoot',
    'databaseBoot', 'topologyFingerprint', 'timeline', 'bindingSha256', 'authorityPublicKeyFingerprint',
    'schemaSha256', 'releaseSha256', 'signingKeyId', 'signingKeyFingerprint', 'stripeKeyFingerprint']
    .every(key => a[key] === b[key]) && JSON.stringify(a.modes) === JSON.stringify(b.modes));
}
