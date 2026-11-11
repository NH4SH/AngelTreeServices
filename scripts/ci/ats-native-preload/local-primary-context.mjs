// Pure policy. Production input must come from the existing fixed-path,
// owner-checked, read-only-mounted filesystem reader; there is no env override.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
export const LOCAL_POLICY = 'local-primary-operation-v1';
export const LOCAL_DESCRIPTOR_KIND = 'ats-firewood-local-primary-release-v2';
const HASH = /^[a-f0-9]{64}$/u, ID = /^[a-f0-9]{32}$/u;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u;
const positive = value => Number.isSafeInteger(value) && value > 0;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function json(bytes) {
  assert(Buffer.isBuffer(bytes)); const text = bytes.toString('utf8');
  assert(Buffer.from(text).equals(bytes) && !text.startsWith('\uFEFF'));
  return JSON.parse(text);
}
function exact(value, keys) {
  assert(value && typeof value === 'object' && !Array.isArray(value));
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort());
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
export function validateLocalReleasedSnapshot(snapshot, mode, { fixedRelease, modes }) {
  assert(modes.includes(mode)); assert.equal(snapshot.platform, 'linux');
  assert.equal(snapshot.uid, 1000); assert.equal(snapshot.latchAbsent, true);
  const now = snapshot.wallMs, mono = snapshot.monotonicMs;
  assert(positive(now) && Number.isFinite(mono) && mono > 0);
  const d = json(snapshot.descriptor), b = json(snapshot.binding), a = json(snapshot.active);
  exact(d, ['kind','bindingSha256','namespace','generation','sourceId','sourceScope','sourceEnvironment',
    'sourceMigrationCount','admissionProtocol','systemIdentifier','topologyFingerprint','timeline',
    'primaryInstallationId','schemaSha256','releaseComponentDigest','installationOverlaySha256',
    'signingKeyId','signingKeyFingerprint','stripeKeyFingerprint','modes', ...Object.keys(fixedRelease)]);
  assert.equal(d.kind, LOCAL_DESCRIPTOR_KIND); assert.equal(d.admissionProtocol, LOCAL_POLICY);
  for (const [key, value] of Object.entries(fixedRelease)) assert.equal(d[key], value);
  exact(d.modes, modes); for (const m of modes) assert.equal(typeof d.modes[m], 'boolean');
  assert.equal(d.modes.status, true); assert.equal(d.modes[mode], true);
  assert.match(d.primaryInstallationId, ID);
  for (const key of ['bindingSha256','schemaSha256','releaseComponentDigest','installationOverlaySha256',
    'signingKeyFingerprint','stripeKeyFingerprint']) assert.match(d[key], HASH);
  assert.match(d.signingKeyId, /^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/u);
  assert.equal(hash(snapshot.binding), d.bindingSha256);
  assert.equal(b.version, 2); assert.equal(b.admissionProtocol, LOCAL_POLICY);
  assert.equal(b.sourceId, 'ats_crm_primary_20261029'); assert.equal(b.sourceScope, 'crm-v1');
  assert.equal(b.environment, 'home-primary-local-v2');
  assert.match(b.namespace, /^ats-home-primary-[a-f0-9]{12}$/u);
  assert(positive(b.generation) && b.generation >= 12);
  assert(positive(b.sourceMigrationCount) && b.sourceMigrationCount >= 102);
  assert.match(b.systemIdentifier, /^[0-9]{16,20}$/u);
  assert.match(b.topology, /^[a-f0-9]{32}$/u); assert(positive(b.timeline));
  assert.match(b.primaryInstallationId, ID); assert.match(b.installationOverlaySha256, HASH);
  assert.equal(b.volumeName, 'ats_crm_primary_20261029_pg-data-v3');
  assert.equal(b.sourceDbImage, 'sha256:b15d862126dd2dac02da524696ccfde2dcce2ceaee0a58973b2727befe492706');
  for (const [descriptor, binding] of [['namespace','namespace'],['generation','generation'],['sourceId','sourceId'],
    ['sourceScope','sourceScope'],['sourceEnvironment','environment'],['sourceMigrationCount','sourceMigrationCount'],
    ['systemIdentifier','systemIdentifier'],['topologyFingerprint','topology'],['timeline','timeline'],
    ['primaryInstallationId','primaryInstallationId'],['installationOverlaySha256','installationOverlaySha256']])
    assert.equal(d[descriptor], b[binding]);
  exact(a, ['kind','bindingSha256','namespace','generation','operationSequence','sourceBoot','databaseBoot',
    'systemIdentifier','topologyFingerprint','primaryInstallationId','observedAtMs','observedMonotonicMs',
    'expiresAtMs','expiresAtBootMs']);
  assert.equal(a.kind, 'ats-local-primary-operation-v1'); assert.equal(a.bindingSha256, d.bindingSha256);
  for (const key of ['namespace','generation','systemIdentifier','primaryInstallationId']) assert.equal(a[key], b[key]);
  assert.equal(a.topologyFingerprint, b.topology); assert(positive(a.operationSequence));
  assert.match(a.sourceBoot, UUID); assert.equal(snapshot.bootId.toString('utf8').trim(), a.sourceBoot);
  const dbBootMs = Date.parse(a.databaseBoot); assert(positive(dbBootMs) && dbBootMs <= a.observedAtMs);
  assert(positive(a.observedAtMs) && a.observedAtMs <= now);
  assert(Number.isFinite(a.observedMonotonicMs) && a.observedMonotonicMs > 0 && a.observedMonotonicMs <= mono);
  assert(positive(a.expiresAtMs) && a.expiresAtMs <= a.observedAtMs + 14000 && a.expiresAtMs > now);
  assert(Number.isFinite(a.expiresAtBootMs) && a.expiresAtBootMs <= a.observedMonotonicMs + 14000 && a.expiresAtBootMs > mono);
  assert(Math.abs((now - a.observedAtMs) - (mono - a.observedMonotonicMs)) <= 1000, 'Local clock discontinuity');
  const operationAgeMs = Math.ceil(Math.max(now - a.observedAtMs, mono - a.observedMonotonicMs));
  assert(operationAgeMs >= 0 && operationAgeMs < 14000);
  const released = json(snapshot.workersReleased);
  assert.equal(released.namespace, b.namespace); assert.equal(released.generation, b.generation);
  assert.equal(released.providerReconciliationVerified, true);
  const expiresAtMs = Math.floor(Math.min(a.expiresAtMs, now + a.expiresAtBootMs - mono));
  assert(expiresAtMs > now);
  return freeze({ admissionProtocol: LOCAL_POLICY, mode, namespace: b.namespace, generation: b.generation,
    sourceId: b.sourceId, systemIdentifier: b.systemIdentifier, sourceBoot: a.sourceBoot,
    databaseBoot: a.databaseBoot, databaseStartedAtMs: dbBootMs, topologyFingerprint: b.topology,
    timeline: b.timeline, primaryInstallationId: b.primaryInstallationId, bindingSha256: d.bindingSha256,
    schemaSha256: d.schemaSha256, releaseSha256: d.releaseComponentDigest,
    installationOverlaySha256: b.installationOverlaySha256, signingKeyId: d.signingKeyId,
    signingKeyFingerprint: d.signingKeyFingerprint, stripeKeyFingerprint: d.stripeKeyFingerprint,
    ...fixedRelease, modes: { ...d.modes }, operationSequence: a.operationSequence,
    operationObservedAtMs: a.observedAtMs, operationObservedBootMs: a.observedMonotonicMs,
    operationAgeMs, observedMonotonicMs: mono, expiresAtMs, observedAtMs: now });
}
