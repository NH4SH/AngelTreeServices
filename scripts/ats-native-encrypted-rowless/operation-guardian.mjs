// Internal orchestration. The fixed-path production adapter is not implemented
// or installed yet. No backup age, cloud receipt or provider credential enters
// this engine. It cannot start/stop a database or enable a role/worker mode.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { operationPublication } from './operation-publication.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const IDENTITY = ['primaryInstallationId','bindingSha256','systemIdentifier',
  'originalHostIdentitySha256','databaseStorageIdentitySha256','databaseBoot','sourceBoot'];
export class GuardianTickError extends Error {
  constructor(stage, sequenceReserved, publicationAttempted, cause) {
    super('Local guardian tick incomplete at ' + stage, { cause });
    this.name = 'GuardianTickError'; this.stage = stage;
    this.sequenceReserved = sequenceReserved; this.publicationAttempted = publicationAttempted;
    // An attempted write with failed readback is never reported as absent.
    this.publicationOutcome = publicationAttempted ? 'unknown' : 'not_attempted';
  }
}

// Ports are internal capabilities supplied by an independently pinned adapter.
// renewCommitted must collect the complete psql result AND successful COMMIT;
// a selected pre-COMMIT row, timeout or lost connection cannot satisfy it.
// The journal is the actual original-installation store under one kernel lock.
export async function guardianTick({ bindingBytes, journal, ports }) {
  let stage = 'binding', sequenceReserved = null, publicationAttempted = false;
  try {
    assert(Buffer.isBuffer(bindingBytes)); const bytes = Buffer.from(bindingBytes);
    const binding = JSON.parse(bytes.toString('utf8')), digest = hash(bytes);
    assert.equal(binding.version, 2); assert.equal(binding.admissionProtocol, 'local-primary-operation-v1');
    assert.equal(journal.installation.bindingSha256, digest);
    assert.equal(journal.installation.primaryInstallationId, binding.primaryInstallationId);
    stage = 'operator-hold'; await ports.assertNoOperatorHold();
    stage = 'source-release'; await ports.verifySourceRelease();
    stage = 'original-installation'; const original = await ports.observeOriginalInstallation();
    assert.equal(original.bindingSha256, digest);
    stage = 'reserve-durable-sequence'; const reserved = journal.reserve(original);
    sequenceReserved = reserved.operationSequence;
    stage = 'pre-renewal-hold'; await ports.assertNoOperatorHold();
    const before = await ports.observeClock();
    assert.equal(before.bootId, original.sourceBoot);
    stage = 'native-sql-commit';
    const result = await ports.renewCommitted(Object.freeze({ epoch: binding.generation,
      holder: 'ats-home-primary', databaseBoot: original.databaseBoot, topology: binding.topology }));
    assert(result && result.committed === true);
    assert.deepEqual(Object.keys(result).sort(), ['committed','row']);
    assert.equal(result.row.databaseBoot, original.databaseBoot);
    stage = 'post-commit-custody';
    await ports.verifySourceRelease();
    const current = await ports.observeOriginalInstallation();
    journal.verifyObservation(current);
    for (const key of IDENTITY) assert.equal(current[key], original[key], 'Installation or boot changed during renewal');
    assert.equal(journal.read().operationSequence, sequenceReserved);
    await ports.assertNoOperatorHold();
    const after = await ports.observeClock();
    assert.equal(after.bootId, current.sourceBoot);
    stage = 'committed-publication';
    const active = operationPublication({ bindingBytes: bytes,
      primaryInstallationId: journal.installation.primaryInstallationId,
      operationSequence: sequenceReserved, sql: result.row, before, after });
    const activeBytes = Buffer.from(JSON.stringify(active) + '\n');
    stage = 'atomic-active-publication'; publicationAttempted = true;
    await ports.publishActive(activeBytes);
    stage = 'independent-active-readback';
    const readback = await ports.readActive(); assert(Buffer.isBuffer(readback) && readback.equals(activeBytes));
    await ports.assertNoOperatorHold(); journal.verifyObservation(current);
    const final = await ports.observeClock();
    assert(Number.isSafeInteger(final.wallMs) && final.wallMs > 0);
    assert(typeof final.bootMs === 'number' && Number.isFinite(final.bootMs) && final.bootMs > 0);
    assert.equal(final.bootId, after.bootId);
    assert(final.wallMs >= after.wallMs && final.bootMs >= after.bootMs);
    assert(final.wallMs < active.expiresAtMs && final.bootMs < active.expiresAtBootMs);
    assert(Math.abs((final.wallMs - active.observedAtMs) - (final.bootMs - active.observedMonotonicMs)) <= 1000);
    return Object.freeze({ permissionPublished: true, operationSequence: sequenceReserved,
      expiresAtMs: active.expiresAtMs, expiresAtBootMs: active.expiresAtBootMs });
  } catch (cause) {
    throw new GuardianTickError(stage, sequenceReserved, publicationAttempted, cause);
  }
}
