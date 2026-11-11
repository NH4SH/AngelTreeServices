// Disposable synthetic filesystem fixture only. No production adapter/inputs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { openGuardianJournal } from './guardian-custody.mjs';
import { openActivePublisher } from './active-publication.mjs';
import { operationPublication } from './operation-publication.mjs';
const [root, expectedInstallationSha256, action] = process.argv.slice(2);
assert.equal(process.version, 'v22.23.4'); assert.equal(process.arch, 'arm64');
assert(root.startsWith('/run/ats-guardian-owned-'));
if (action === 'reject-open') {
  assert.throws(() => openGuardianJournal({ root, uid: 1000, expectedInstallationSha256 }));
  console.log(JSON.stringify({ rejected: true }));
} else {
  const journal = openGuardianJournal({ root, uid: 1000, expectedInstallationSha256 });
  if (action.startsWith('publisher-')) {
    const options = { root: root + '/public', uid: 1000, journal };
    if (action === 'publisher-reject-open') {
      assert.throws(() => openActivePublisher(options));
      console.log(JSON.stringify({ rejected: true }));
    } else {
      const readClock = () => ({ wallMs: Date.now(),
        bootMs: Number(fs.readFileSync('/proc/uptime','utf8').split(' ')[0]) * 1000,
        bootId: fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim() });
      const clock = readClock();
      const observation = { ...journal.installation, nativeWalLsn: '0/300', observedAtMs: clock.wallMs,
        databaseBoot: new Date(clock.wallMs - 60000).toISOString(), sourceBoot: clock.bootId };
      delete observation.kind;
      const reserved = journal.reserve(observation), publisher = openActivePublisher(options);
      const bindingBytes = fs.readFileSync(options.root + '/binding.json'), binding = JSON.parse(bindingBytes);
      const before = readClock(), sqlTime = Date.now();
      const row = { admissionProtocol: binding.admissionProtocol, systemIdentifier: binding.systemIdentifier,
        databaseBoot: observation.databaseBoot, leaseEpoch: String(binding.generation), nodeIdentity: 'ats-home-primary',
        topologyFingerprint: binding.topology, operationObservedAtMs: sqlTime, leaseIssuedAtMs: sqlTime, expiresAtMs: sqlTime + 14000 };
      const active = { ...operationPublication({ bindingBytes, primaryInstallationId: binding.primaryInstallationId,
        operationSequence: reserved.operationSequence, sql: row, before, after: readClock() }) };
      if (action === 'publisher-reject-sequence') active.operationSequence--;
      if (action === 'publisher-reject-boot') active.sourceBoot = '11111111-1111-1111-1111-111111111111';
      if (action === 'publisher-reject-expired') active.expiresAtMs = active.observedAtMs - 1;
      const bytes = Buffer.from(JSON.stringify(active) + '\n');
      if (action.startsWith('publisher-reject-')) {
        const previous = fs.readFileSync(options.root + '/active.json');
        assert.throws(() => publisher.publish(bytes));
        assert(fs.readFileSync(options.root + '/active.json').equals(previous));
        console.log(JSON.stringify({ rejected: true, previousActiveUnchanged: true }));
      } else {
        assert.equal(action, 'publisher-positive'); publisher.publish(bytes);
        assert(publisher.read().equals(bytes));
        console.log(JSON.stringify({ published: true, sequence: active.operationSequence, independentReadback: true,
          realSqlUsed: false, syntheticSqlTimestampWithinRealClockObservations: true }));
      }
    }
  } else if (action === 'hold') {
    fs.writeSync(1, 'owned-lock-held\n'); setInterval(() => {}, 1000);
  } else {
    const before = journal.read(), now = Date.now();
    const observation = { ...journal.installation, nativeWalLsn: '0/300', observedAtMs: now,
      databaseBoot: new Date(now - 60000).toISOString(), sourceBoot: '11111111-1111-1111-1111-111111111111' };
    delete observation.kind;
    if (action === 'reject-host') observation.originalHostIdentitySha256 = 'e'.repeat(64);
    if (action === 'reject-storage') observation.databaseStorageIdentitySha256 = 'e'.repeat(64);
    if (action === 'reject-wal') observation.nativeWalLsn = '0/2';
    if (action === 'reserve-new-boot-metadata') {
      observation.sourceBoot = '22222222-2222-2222-2222-222222222222';
      observation.databaseBoot = new Date(now - 1000).toISOString();
    }
    if (action.startsWith('reject-')) {
      assert.throws(() => journal.reserve(observation));
      assert.deepEqual(journal.read(), before);
      console.log(JSON.stringify({ rejected: true, sequenceUnchanged: true }));
    } else {
      assert(['reserve','reserve-new-boot-metadata','crash-after-reserve'].includes(action));
      const after = journal.reserve(observation);
      assert.equal(after.operationSequence, before.operationSequence + 1);
      assert.deepEqual(journal.read(), after);
      if (action === 'crash-after-reserve') process.kill(process.pid, 'SIGKILL');
      else console.log(JSON.stringify({ reserved: true, sequence: after.operationSequence,
        independentReadback: true, nodeVersion: process.version }));
    }
  }
}
