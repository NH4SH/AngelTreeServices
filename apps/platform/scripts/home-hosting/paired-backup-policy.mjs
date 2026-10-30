// A separate protocol: legacy archive/incremental certificates still never admit
// writes. A paired receipt requires fresh full readback of ALL changing records,
// plus the exact independently verified static recovery base and file inventory.
import assert from 'node:assert/strict';
import { verify } from 'node:crypto';
import { sha256, validateInventory } from './cloud-policy.mjs';
import { verifyProof } from './failover-proof.mjs';
import { continuousPolicy } from './continuous-policy.mjs';

const staticFields = ['schemaContentFingerprint', 'rolesSha256', 'coreConfigSha256',
  'appConfigSha256', 'releaseSourceSha256', 'objectInventorySha256', 'runtimeManifestSha256'];
export function staticIdentity(fields) {
  const canonical = {};
  for (const key of staticFields) {
    assert.match(fields[key], /^[a-f0-9]{64}$/, 'Incomplete static identity: ' + key);
    canonical[key] = fields[key];
  }
  return sha256(JSON.stringify(canonical));
}
export function validateStaticBase(envelope, publicKey, binding, now = Date.now()) {
  assert.ok(envelope && typeof envelope.payload === 'string' && typeof envelope.signature === 'string');
  const bytes = Buffer.from(envelope.payload, 'base64url');
  assert.ok(bytes.length <= 40960 && verify(null, bytes, publicKey, Buffer.from(envelope.signature, 'base64url')),
    'Untrusted static base');
  const c = JSON.parse(bytes);
  assert.equal(c.version, 1); assert.equal(c.kind, 'restic-verified-catalog');
  assert.equal(c.writeAdmission, false); assert.equal(c.backupLayout, 'schema-base-v1');
  for (const key of ['namespace', 'generation', 'sourceId', 'sourceBoot', 'databaseBoot', 'topology']) {
    assert.equal(c[key], binding[key], 'Static base source changed: ' + key);
  }
  const full = Date.parse(c.fullVerifiedAt), issued = Date.parse(c.issuedAt), expiry = Date.parse(c.expiresAt);
  assert.ok(Number.isFinite(full) && full <= issued && issued <= now && expiry > now && expiry === full + 86400000);
  assert.match(c.snapshotId, /^[a-f0-9]{64}$/);
  assert.equal(c.staticIdentitySha256, staticIdentity(c.staticBinding));
  assert.equal(c.staticBinding.objectInventorySha256, c.objectInventorySha256);
  assert.equal(c.staticBinding.releaseSourceSha256, c.artifacts['release-source.tar.gz'].sha256);
  assert.equal(c.staticBinding.coreConfigSha256, c.artifacts['core.private.env'].sha256);
  assert.equal(c.staticBinding.appConfigSha256, c.artifacts['app.private.env'].sha256);
  assert.match(c.artifacts['database.dump'].sha256, /^[a-f0-9]{64}$/);
  assert.ok(c.objects.length <= 96); validateInventory(c.objects);
  for (const o of c.objects) {
    assert.match(o.sha256, /^[a-f0-9]{64}$/);
    assert.ok(typeof o.etag === 'string' && o.etag.length > 0 && !o.etag.startsWith('W/'));
  }
  return c;
}

export function validatePairedReceipt(envelope, publicKey, binding, now = Date.now()) {
  const c = verifyProof(envelope, publicKey, { kind: 'paired-native-backup', namespace: binding.namespace,
    minimumGeneration: binding.generation, now });
  assert.equal(c.generation, binding.generation);
  for (const key of ['sourceId', 'sourceBoot', 'databaseBoot', 'topology']) assert.equal(c[key], binding[key]);
  assert.ok(Number.isSafeInteger(c.sequence) && c.sequence > 0);
  assert.ok(Number.isFinite(c.captureStartedBootMs) && c.captureStartedBootMs > 0);
  for (const key of ['snapshotId', 'manifestSha256', 'staticSnapshotId', 'staticIdentitySha256', 'staticCertificateSha256']) {
    assert.match(c[key], /^[a-f0-9]{64}$/);
  }
  const start = Date.parse(c.captureStartedAt), end = Date.parse(c.captureCompletedAt),
    checked = Date.parse(c.offsiteVerifiedAt), full = Date.parse(c.staticFullVerifiedAt),
    staticExpiry = Date.parse(c.staticExpiresAt), expiry = Date.parse(c.expiresAt);
  assert.ok([start, end, checked, full, staticExpiry, expiry].every(Number.isFinite));
  assert.ok(full <= checked && start <= end && end <= checked && checked <= now &&
    now - start < continuousPolicy.maximumLossMs - continuousPolicy.hardFenceMarginMs);
  assert.equal(staticExpiry, full + 86400000);
  assert.equal(expiry, Math.min(start + 280000, staticExpiry));
  assert.equal(c.verificationMode, 'full-dynamic-readback-and-certified-static-base');
  for (const key of ['paired', 'authIncluded', 'paymentAndDeliveryIncluded', 'dynamicRemoteBytesReadBack',
    'nativeDynamicCheck', 'staticProviderIdentityObserved', 'sourceArtifactsVerified', 'publicAccessDenied']) {
    assert.equal(c[key], true, 'Incomplete paired recovery proof: ' + key);
  }
  return c;
}
