import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { guardianTick, GuardianTickError } from './operation-guardian.mjs';

const now = 1800000000000, bootId = '11111111-1111-1111-1111-111111111111';
function fixture() {
  const binding = { version: 2, admissionProtocol: 'local-primary-operation-v1',
    namespace: 'ats-home-primary-112233445566', generation: 20, systemIdentifier: '7000000000000000001',
    topology: 'a'.repeat(32), primaryInstallationId: 'b'.repeat(32) };
  const bindingBytes = Buffer.from(JSON.stringify(binding));
  const digest = createHash('sha256').update(bindingBytes).digest('hex');
  const installation = { primaryInstallationId: binding.primaryInstallationId, bindingSha256: digest };
  const original = { ...installation, systemIdentifier: binding.systemIdentifier,
    originalHostIdentitySha256: 'c'.repeat(64), databaseStorageIdentitySha256: 'd'.repeat(64),
    nativeWalLsn: '0/100', observedAtMs: now, databaseBoot: new Date(now - 60000).toISOString(), sourceBoot: bootId };
  const row = { admissionProtocol: binding.admissionProtocol, systemIdentifier: binding.systemIdentifier,
    databaseBoot: original.databaseBoot, leaseEpoch: '20', nodeIdentity: 'ats-home-primary',
    topologyFingerprint: binding.topology, operationObservedAtMs: now + 40,
    leaseIssuedAtMs: now + 40, expiresAtMs: now + 14040 };
  const calls = [], state = { operationSequence: 0 }; let active = null, clock = 0;
  const journal = { installation,
    reserve: x => { calls.push('reserve'); assert.deepEqual(x, original); state.operationSequence++; return { ...state }; },
    verifyObservation: x => { calls.push('custody'); assert.deepEqual(x, original); }, read: () => ({ ...state }) };
  const ports = {
    assertNoOperatorHold: async () => { calls.push('hold'); },
    verifySourceRelease: async () => { calls.push('source'); },
    observeOriginalInstallation: async () => { calls.push('observe'); return { ...original }; },
    observeClock: async () => { const elapsed = [0,80,90][clock++]; return { wallMs: now + elapsed, bootMs: 100000 + elapsed, bootId }; },
    renewCommitted: async args => { calls.push('commit'); assert.deepEqual(args, { epoch: 20, holder: 'ats-home-primary', databaseBoot: original.databaseBoot, topology: binding.topology }); return { committed: true, row }; },
    publishActive: async bytes => { calls.push('publish'); active = Buffer.from(bytes); },
    readActive: async () => { calls.push('readback'); return active; },
  };
  return { bindingBytes, journal, ports, row, original, state, calls, active: () => active };
}
test('ordered commit, custody and durable sequence precede publication; backup service is never consulted', async () => {
  const f = fixture();
  Object.defineProperty(f.ports, 'backupHealth', { get() { throw Error('offsite provider unavailable'); } });
  const result = await guardianTick(f), active = JSON.parse(f.active());
  assert.equal(result.permissionPublished, true); assert.equal(result.operationSequence, 1);
  assert(f.calls.indexOf('reserve') < f.calls.indexOf('commit'));
  assert(f.calls.indexOf('commit') < f.calls.indexOf('custody'));
  assert(f.calls.indexOf('custody') < f.calls.indexOf('publish'));
  assert.equal(f.calls.filter(x => x === 'source').length, 2);
  assert.equal(active.observedAtMs, f.row.operationObservedAtMs);
  assert.equal(active.expiresAtBootMs, 114000);
});
test('an operator hold prevents even sequence reservation and native renewal', async () => {
  const f = fixture(); f.ports.assertNoOperatorHold = async () => { throw Error('held'); };
  await assert.rejects(guardianTick(f), e => e instanceof GuardianTickError && e.stage === 'operator-hold' && e.publicationOutcome === 'not_attempted');
  assert.equal(f.state.operationSequence, 0); assert.equal(f.active(), null); assert(!f.calls.includes('commit'));
});
test('unknown COMMIT outcome burns the durable sequence and publishes no row selected before COMMIT', async () => {
  const f = fixture(); f.ports.renewCommitted = async () => { throw Error('connection lost after SELECT'); };
  await assert.rejects(guardianTick(f), e => e.stage === 'native-sql-commit' && e.sequenceReserved === 1 && e.publicationOutcome === 'not_attempted');
  assert.equal(f.state.operationSequence, 1); assert.equal(f.active(), null);
});
test('a native row without successful COMMIT acknowledgement cannot publish', async () => {
  const f = fixture(); f.ports.renewCommitted = async () => ({ committed: false, row: f.row });
  await assert.rejects(guardianTick(f)); assert.equal(f.active(), null);
});
test('a changed database boot during COMMIT cannot publish', async () => {
  const f = fixture(); f.row.databaseBoot = new Date(now - 50000).toISOString();
  await assert.rejects(guardianTick(f)); assert.equal(f.active(), null);
});
test('original-host custody is rechecked after COMMIT', async () => {
  const f = fixture(); f.journal.verifyObservation = () => { throw Error('original installation changed'); };
  await assert.rejects(guardianTick(f), e => e.stage === 'post-commit-custody'); assert.equal(f.active(), null);
});
test('source changes during native renewal cannot publish', async () => {
  const f = fixture(); let n = 0; f.ports.verifySourceRelease = () => { if (++n === 2) throw Error('source changed'); };
  await assert.rejects(guardianTick(f), e => e.stage === 'post-commit-custody'); assert.equal(f.active(), null);
});
test('a hold committed after SQL is honored before publication', async () => {
  const f = fixture(); let n = 0; f.ports.assertNoOperatorHold = () => { if (++n === 3) throw Error('held'); };
  await assert.rejects(guardianTick(f)); assert.equal(f.active(), null);
});
test('old SQL evidence cannot publish', async () => {
  const f = fixture(); f.row.operationObservedAtMs = now - 1; f.row.leaseIssuedAtMs = now - 1;
  await assert.rejects(guardianTick(f)); assert.equal(f.active(), null);
});
test('a guest boot change during SQL cannot publish', async () => {
  const f = fixture(); let n = 0;
  f.ports.observeClock = () => ({ wallMs: now + 80 * n, bootMs: 100000 + 80 * n,
    bootId: n++ === 0 ? bootId : '22222222-2222-2222-2222-222222222222' });
  await assert.rejects(guardianTick(f)); assert.equal(f.active(), null);
});
test('publication with lost readback reports an unknown outcome and does not renew again', async () => {
  const f = fixture(); f.ports.readActive = async () => { throw Error('readback unavailable'); };
  await assert.rejects(guardianTick(f), e => e.stage === 'independent-active-readback' && e.publicationOutcome === 'unknown');
  assert(f.active()); assert.equal(f.calls.filter(x => x === 'commit').length, 1);
});
test('incorrect readback cannot be reported as an accepted publication', async () => {
  const f = fixture(); f.ports.readActive = async () => Buffer.from('{}');
  await assert.rejects(guardianTick(f), e => e.publicationOutcome === 'unknown');
});
