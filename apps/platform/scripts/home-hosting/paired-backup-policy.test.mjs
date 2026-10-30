import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { staticIdentity, validateStaticBase, validatePairedReceipt } from './paired-backup-policy.mjs';
import { signProof } from './failover-proof.mjs';
import { validateContinuousReceipt } from './continuous-policy.mjs';
const { privateKey, publicKey } = generateKeyPairSync('ed25519'), now = 1800000000000;
const iso = n => new Date(n).toISOString(), hex = c => c.repeat(64);
const binding = { namespace: 'ats-rehearsal-continuous-abcdef123456', generation: 3,
  sourceId: 'ats_crm_candidate_20261027', sourceBoot: 'boot', databaseBoot: 'database', topology: hex('a') };
const baseIdentity = { schemaContentFingerprint: hex('b'), rolesSha256: hex('c'), coreConfigSha256: hex('d'),
  appConfigSha256: hex('e'), releaseSourceSha256: hex('f'), objectInventorySha256: hex('1'), runtimeManifestSha256: hex('8') };
function base() { return { version: 1, kind: 'restic-verified-catalog', writeAdmission: false,
  backupLayout: 'schema-base-v1', ...binding, snapshotId: hex('2'),
  fullVerifiedAt: iso(now - 100000), issuedAt: iso(now - 90000), expiresAt: iso(now - 100000 + 86400000),
  staticIdentitySha256: staticIdentity(baseIdentity), staticBinding: baseIdentity, objectInventorySha256: hex('1'),
  artifacts: { 'database.dump': { sha256: hex('3') }, 'release-source.tar.gz': { sha256: hex('f') },
    'core.private.env': { sha256: hex('d') }, 'app.private.env': { sha256: hex('e') } },
  objects: [{ name: 'config', id: '12345678-1234-1234-1234-123456789abc', version: 'v1', size: 100,
    sha256: hex('4'), etag: '"verified"' }],
}; }
function claims() { return { version: 1, kind: 'paired-native-backup', ...binding, sequence: 1,
  captureStartedAt: iso(now - 30000), captureStartedBootMs: 100000, captureCompletedAt: iso(now - 20000),
  offsiteVerifiedAt: iso(now - 1000), issuedAt: iso(now - 1000), expiresAt: iso(now - 30000 + 280000),
  staticFullVerifiedAt: iso(now - 100000), staticExpiresAt: iso(now - 100000 + 86400000),
  snapshotId: hex('5'), manifestSha256: hex('6'), staticSnapshotId: hex('2'), staticIdentitySha256: staticIdentity(baseIdentity),
  staticCertificateSha256: hex('7'), verificationMode: 'full-dynamic-readback-and-certified-static-base',
  paired: true, authIncluded: true, paymentAndDeliveryIncluded: true, dynamicRemoteBytesReadBack: true,
  nativeDynamicCheck: true, staticProviderIdentityObserved: true, sourceArtifactsVerified: true, publicAccessDenied: true,
}; }
test('static base requires its dedicated schema marker, unchanged recovery artifacts and exact source', () => {
  const b = base(); assert.equal(validateStaticBase(signProof(b, privateKey), publicKey, binding, now).snapshotId, hex('2'));
  for (const edit of [x => delete x.backupLayout, x => x.staticBinding = { ...x.staticBinding, releaseSourceSha256: hex('0') },
    x => x.objects[0].etag = 'W/"weak"', x => x.sourceBoot = 'other', x => x.expiresAt = iso(now + 172800000)]) {
    const bad = structuredClone(b); edit(bad); assert.throws(() => validateStaticBase(signProof(bad, privateKey), publicKey, binding, now));
  }
});
test('paired protocol requires full current records and never relabels a legacy archive as writable', () => {
  const c = claims(); assert.equal(validatePairedReceipt(signProof(c, privateKey), publicKey, binding, now).sequence, 1);
  assert.throws(() => validateContinuousReceipt(signProof(c, privateKey), publicKey, binding, now));
  for (const key of ['paired', 'authIncluded', 'paymentAndDeliveryIncluded', 'dynamicRemoteBytesReadBack',
    'nativeDynamicCheck', 'staticProviderIdentityObserved', 'sourceArtifactsVerified', 'publicAccessDenied']) {
    assert.throws(() => validatePairedReceipt(signProof({ ...c, [key]: false }, privateKey), publicKey, binding, now));
  }
  assert.throws(() => validatePairedReceipt(signProof({ ...c, kind: 'archive-verification' }, privateKey), publicKey, binding, now));
  assert.throws(() => validatePairedReceipt(signProof({ ...c, generation: 4 }, privateKey), publicKey, binding, now));
});
test('neither a fresh data copy nor metadata rotation extends the static full-read deadline', () => {
  const c = claims(); c.staticFullVerifiedAt = iso(now - 86400000 + 2000); c.staticExpiresAt = iso(now + 2000);
  assert.throws(() => validatePairedReceipt(signProof(c, privateKey), publicKey, binding, now));
  c.expiresAt = c.staticExpiresAt;
  assert.equal(validatePairedReceipt(signProof(c, privateKey), publicKey, binding, now).expiresAt, iso(now + 2000));
  assert.throws(() => validatePairedReceipt(signProof(c, privateKey), publicKey, binding, now + 2001));
});
