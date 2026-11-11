// Disposable synthetic filesystem fixture only. No production adapter/inputs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { openGuardianJournal } from './guardian-custody.mjs';
const [root, expectedInstallationSha256, action] = process.argv.slice(2);
assert.equal(process.version, 'v22.23.4'); assert.equal(process.arch, 'arm64');
assert(root.startsWith('/run/ats-guardian-owned-'));
if (action === 'reject-open') {
  assert.throws(() => openGuardianJournal({ root, uid: 1000, expectedInstallationSha256 }));
  console.log(JSON.stringify({ rejected: true }));
} else {
  const journal = openGuardianJournal({ root, uid: 1000, expectedInstallationSha256 });
  if (action === 'hold') {
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
