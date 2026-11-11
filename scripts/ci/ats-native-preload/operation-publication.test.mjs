import test from 'node:test';
import assert from 'node:assert/strict';
import { operationPublication } from './operation-publication.mjs';

const now = 1800000000000, bootId = '11111111-1111-1111-1111-111111111111';
function fixture() {
  const binding = { version: 2, admissionProtocol: 'local-primary-operation-v1',
    namespace: 'ats-home-primary-112233445566', generation: 20,
    systemIdentifier: '7000000000000000001', topology: 'a'.repeat(32), primaryInstallationId: 'b'.repeat(32) };
  return { bindingBytes: Buffer.from(JSON.stringify(binding)), primaryInstallationId: binding.primaryInstallationId,
    operationSequence: 42, before: { wallMs: now, bootMs: 100000, bootId },
    after: { wallMs: now + 80, bootMs: 100080, bootId },
    sql: { admissionProtocol: binding.admissionProtocol, systemIdentifier: binding.systemIdentifier,
      databaseBoot: new Date(now - 60000).toISOString(), leaseEpoch: '20', nodeIdentity: 'ats-home-primary',
      topologyFingerprint: binding.topology, operationObservedAtMs: now + 40,
      leaseIssuedAtMs: now + 40, expiresAtMs: now + 14040 } };
}
test('publishes the exact SQL timestamp while conservatively charging transaction latency', () => {
  const f = fixture(), a = operationPublication(f);
  assert.equal(a.observedAtMs, now + 40);
  assert.equal(a.observedMonotonicMs, 100000);
  assert.equal(a.expiresAtBootMs, 114000);
  assert.equal(a.expiresAtMs, now + 14040);
  assert(Object.isFrozen(a));
  for (const key of ['backupAgeMs', 'receiptSequence', 'captureStartedAtMs', 'authorityPublicKeyFingerprint'])
    assert(!Object.hasOwn(a, key));
});
for (const [name, mutate] of Object.entries({
  'old SQL operation': f => { f.sql.operationObservedAtMs = now - 1; f.sql.leaseIssuedAtMs = now - 1; },
  'future SQL operation': f => { f.sql.operationObservedAtMs = now + 81; f.sql.leaseIssuedAtMs = now + 81; },
  'host now substituted for SQL issued time': f => { f.sql.operationObservedAtMs = now + 80; },
  'extended SQL lease': f => { f.sql.expiresAtMs++; },
  'different installation': f => { f.primaryInstallationId = 'c'.repeat(32); },
  'wrong SQL database identity': f => { f.sql.systemIdentifier = '7000000000000000002'; },
  'wrong SQL topology': f => { f.sql.topologyFingerprint = 'c'.repeat(32); },
  'wrong SQL epoch': f => { f.sql.leaseEpoch = '19'; },
  'wrong SQL holder': f => { f.sql.nodeIdentity = 'copied-primary'; },
  'numeric epoch coercion': f => { f.sql.leaseEpoch = 20; },
  'host reboot during renewal': f => { f.after.bootId = '22222222-2222-2222-2222-222222222222'; },
  'backwards boot clock': f => { f.after.bootMs = 99999; },
  'backwards wall clock': f => { f.after.wallMs = now - 1; },
  'slow commit': f => { f.after.bootMs += 1001; f.after.wallMs += 1001; },
  'wall clock step': f => { f.after.wallMs += 1001; },
  'unknown extra SQL field': f => { f.sql.backupAgeMs = 0; },
  'legacy SQL policy': f => { f.sql.admissionProtocol = 'backup-fenced-v1'; },
  'sequence overflow': f => { f.operationSequence = Number.MAX_SAFE_INTEGER + 1; },
  'database boot after operation': f => { f.sql.databaseBoot = new Date(now + 41).toISOString(); },
})) test(`${name} cannot publish a local operation`, () => {
  const f = fixture(); mutate(f); assert.throws(() => operationPublication(f));
});
