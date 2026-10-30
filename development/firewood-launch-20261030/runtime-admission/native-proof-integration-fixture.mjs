// TEST ONLY. Generates a fresh synthetic signing authority and control descriptor in memory.
// Matching owned rehearsal SQL facts does not certify backups or authorize any actual runtime.
import assert from 'node:assert/strict';
import { fixture, bytes, pair } from './test-fixture.mjs';
import { signProof } from './upstream/failover-proof.mjs';
import { sha256, validateReleasedSnapshot } from './released-context-core.mjs';

export function nativeProofIntegrationFixture(native, { nowMs = Date.now(), mode = 'status', role = 'web' } = {}) {
  const roles = { web: 'ats_firewood_request', worker: 'ats_firewood_worker', health: 'ats_firewood_health' };
  assert.ok(Object.hasOwn(roles, role));
  const { snapshot, descriptor, binding, claims } = fixture();
  const generation = Number(native.leaseEpoch), baseMonotonicMs = 3600000;
  assert.ok(Number.isSafeInteger(generation) && generation > 3);
  binding.generation = generation;
  binding.systemIdentifier = native.systemIdentifier;
  binding.databaseBoot = new Date(native.databaseStartedAtMs).toISOString();
  binding.topology = native.topologyFingerprint;
  snapshot.binding = bytes(binding);
  Object.assign(descriptor, { generation, systemIdentifier: binding.systemIdentifier,
    databaseBoot: binding.databaseBoot, topologyFingerprint: binding.topology, bindingSha256: sha256(snapshot.binding) });
  snapshot.descriptor = bytes(descriptor);
  Object.assign(claims, { binding, generation, captureStartedBootMs: baseMonotonicMs - (nowMs - native.captureStartedAtMs),
    captureStartedAt: new Date(native.captureStartedAtMs).toISOString(),
    captureCompletedAt: new Date(native.captureStartedAtMs).toISOString(),
    offsiteVerifiedAt: new Date(native.captureStartedAtMs).toISOString(),
    issuedAt: new Date(native.captureStartedAtMs).toISOString(),
    fullVerifiedAt: new Date(nowMs - 3600000).toISOString(),
    fullExpiresAt: new Date(nowMs - 3600000 + 86400000).toISOString(),
    expiresAt: new Date(native.captureStartedAtMs + 280000).toISOString() });
  snapshot.active = bytes({ envelope: signProof(claims, pair.privateKey), claims, timer: {},
    deadlineBootMs: claims.captureStartedBootMs + 280000, anchor: { wall: nowMs, monotonic: baseMonotonicMs } });
  snapshot.workersReleased = bytes({ namespace: binding.namespace, generation, providerReconciliationVerified: true });
  const observe = wallMs => validateReleasedSnapshot({ ...snapshot, wallMs,
    monotonicMs: baseMonotonicMs + (wallMs - nowMs) }, mode);
  const initial = observe(nowMs);
  const websiteBinding = { database: 'postgres', schema: 'app_private', profile: 'production-live', role: roles[role],
    systemIdentifier: initial.systemIdentifier, releaseSha256: initial.releaseSha256, schemaSha256: initial.schemaSha256,
    recoveryBindingSha256: initial.bindingSha256, authorityPublicKeyFingerprint: initial.authorityPublicKeyFingerprint };
  const input = { role, mode, binding: websiteBinding, descriptor: { version: 1, profile: 'production-live',
    sourceId: initial.source, environmentId: initial.environment, accountId: initial.account, mode: 'live',
    origin: initial.websiteOrigin, roles, binding: { ...websiteBinding } } };
  return { observe, input, snapshot, syntheticAuthorityOnly: true };
}
