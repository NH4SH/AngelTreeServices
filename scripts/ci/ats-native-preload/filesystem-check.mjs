// Synthetic native Linux fixture entry. No production caller, credential or SQL.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readFixedSnapshot } from './release-filesystem.mjs';
import { validateLocalReleasedSnapshot } from './local-primary-context.mjs';
const expected = process.argv[2]; assert(['valid', 'denied'].includes(expected));
const status = fs.readFileSync('/proc/self/status', 'utf8');
assert.match(status, /^CapEff:\s+0+$/mu); assert.match(status, /^NoNewPrivs:\s+1$/mu);
let context = null, rejected = false;
try {
  const snapshot = readFixedSnapshot({ platform: process.platform, uid: process.getuid(), pid: process.pid, wallMs: Date.now() });
  snapshot.wallMs = Date.now();
  context = validateLocalReleasedSnapshot(snapshot, 'office', {
    fixedRelease: { contract: 'synthetic-local-primary-proof' }, modes: ['status', 'office'],
  });
} catch { rejected = true; }
assert.equal(rejected, expected === 'denied');
if (context) {
  assert.equal(context.admissionProtocol, 'local-primary-operation-v1');
  assert(!fs.existsSync('/admission/authority-public.pem'));
  assert.equal(context.operationSequence, 1);
}
process.stdout.write(JSON.stringify({ passed: true, rejected, actualUid: process.getuid(),
  actualGid: process.getgid(), noCapabilities: true, noNewPrivileges: true,
  actualKernelProcAndMounts: true, noCloudAuthorityKey: !fs.existsSync('/admission/authority-public.pem') }) + '\n');
