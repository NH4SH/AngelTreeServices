// Test-only generated signing key and synthetic metadata; never included in operative runtime.
import { generateKeyPairSync } from 'node:crypto';
import { signProof } from './upstream/failover-proof.mjs';
import { FIXED_RELEASE, MODES, BASE_RECOVERY_MANIFEST, sha256, authorityFingerprint } from './released-context-core.mjs';
export const bytes = value => Buffer.from(JSON.stringify(value));
export const changed = (snapshot, name, callback) => {
  const value = JSON.parse(snapshot[name]); callback(value); snapshot[name] = bytes(value);
};
export const testSigningSecret = 'synthetic_unit_fixture_only_A7z_2T_W7z_5Q';
export const pair = generateKeyPairSync('ed25519');
const publicKey = pair.publicKey.export({ format: 'pem', type: 'spki' });
export function fixture() {
  const wallMs = Date.parse('2026-10-30T12:00:00.000Z'), monotonicMs = 3600000;
  const binding = { version: 1, environment: 'home-primary-v1', sourceId: 'ats_crm_primary_20261029',
    sourceScope: 'crm-v1', namespace: 'ats-home-continuous-abcdef012345', generation: 4,
    sourceMigrationCount: 102, captureMode: 'transaction-barrier', privateFileFormat: 'patch-v1',
    installationOverlaySha256: 'a'.repeat(64),
    admissionProtocol: 'certified-native-wal-v1', systemIdentifier: '7700000000000000000',
    sourceBoot: 'a31f124e-580a-4e51-aab5-0123456789ab', databaseBoot: '2026-10-30 10:00:00.000000+00',
    topology: 'c'.repeat(32), timeline: 1, sourceDbImage: 'sha256:' + 'd'.repeat(64),
    containers: Object.fromEntries(['db', 'app', 'api-gw', 'auth', 'rest', 'storage', 'imgproxy'].map(n => [n, 'e'.repeat(64)])) };
  const bindingBytes = bytes(binding);
  const descriptor = {
    kind: 'ats-firewood-release-control-v1', bindingSha256: sha256(bindingBytes),
    namespace: binding.namespace, generation: binding.generation, sourceId: binding.sourceId,
    sourceScope: binding.sourceScope, sourceEnvironment: binding.environment,
    sourceMigrationCount: 102, captureMode: binding.captureMode, privateFileFormat: binding.privateFileFormat,
    admissionProtocol: binding.admissionProtocol, systemIdentifier: binding.systemIdentifier,
    sourceBoot: binding.sourceBoot, databaseBoot: binding.databaseBoot,
    topologyFingerprint: binding.topology, timeline: binding.timeline,
    authorityPublicKeyFingerprint: authorityFingerprint(publicKey), schemaSha256: '1'.repeat(64),
    releaseComponentDigest: '2'.repeat(64), baseRecoverySourceManifestSha256: BASE_RECOVERY_MANIFEST,
    installationOverlaySha256: binding.installationOverlaySha256,
    signingKeyId: 'synthetic_unit_key_0001', signingKeyFingerprint: sha256(testSigningSecret),
    stripeKeyFingerprint: '8'.repeat(64),
    modes: Object.fromEntries(MODES.map(mode => [mode, true])), ...FIXED_RELEASE,
  };
  const claims = {
    version: 1, kind: 'certified-native-wal-backup', namespace: binding.namespace, generation: 4, binding,
    sequence: 1, jobId: '11111111-1111-4111-8111-111111111111', baseJobId: '22222222-2222-4222-8222-222222222222',
    componentSha256: '3'.repeat(64), snapshotId: '4'.repeat(64), manifestSha256: '5'.repeat(64),
    captureStartedBootMs: monotonicMs - 60000, targetLsn: '0/123456',
    captureStartedAt: new Date(wallMs - 60000).toISOString(), captureCompletedAt: new Date(wallMs - 59000).toISOString(),
    offsiteVerifiedAt: new Date(wallMs - 50000).toISOString(), issuedAt: new Date(wallMs - 49000).toISOString(),
    fullVerifiedAt: new Date(wallMs - 3600000).toISOString(), fullExpiresAt: new Date(wallMs - 3600000 + 86400000).toISOString(),
    expiresAt: new Date(wallMs - 60000 + 280000).toISOString(),
    completeRecoveryChain: true, allNewBytesReadBack: true, retainedProviderVersionsChecked: true,
    serializedByAuthority: true, privateFileStateVerified: true, staticPairSha256: '6'.repeat(64),
    fileIndexSha256: '7'.repeat(64), freshFullRemoteRead: false,
  };
  claims.privatePairSha256 = sha256(JSON.stringify({ kind: 'native-wal-file-state-v1', staticSha256: claims.staticPairSha256,
    fileIndexSha256: claims.fileIndexSha256 }));
  const active = { envelope: signProof(claims, pair.privateKey), claims, timer: {},
    deadlineBootMs: claims.captureStartedBootMs + 280000,
    anchor: { wall: wallMs - 40000, monotonic: monotonicMs - 40000 } };
  const snapshot = { platform: 'linux', uid: 1000, latchAbsent: true, wallMs, monotonicMs,
    descriptor: bytes(descriptor), binding: bindingBytes, active: bytes(active),
    authorityPublicKey: Buffer.from(publicKey), bootId: Buffer.from(binding.sourceBoot + '\n'),
    workersReleased: bytes({ namespace: binding.namespace, generation: 4, providerReconciliationVerified: true }) };
  return { snapshot, descriptor, claims, binding };
}
export function resign(snapshot, callback) {
  changed(snapshot, 'active', active => {
    callback(active.claims); active.envelope = signProof(active.claims, pair.privateKey);
  });
}

export function configFor(context) {
  return { enabled: true, profile: 'live', mode: 'live', keyId: context.signingKeyId, signingSecret: testSigningSecret,
    encryptionKey: Buffer.alloc(32, 42), collectorReady: true, officeEnabled: true,
    contract: context.contract, sourceId: context.source, environmentId: context.environment, accountId: context.account,
    portalOrigin: context.portalOrigin, websiteOrigin: context.websiteOrigin, termsHash: context.termsHash,
    paymentPolicyHash: context.paymentPolicyHash };
}
