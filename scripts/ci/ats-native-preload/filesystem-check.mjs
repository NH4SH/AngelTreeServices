// Synthetic native Linux fixture entry. No production caller, credential or SQL.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { readFixedSnapshot } from './release-filesystem.mjs';
import { validateLocalReleasedSnapshot } from './local-primary-context.mjs';
const expected = process.argv[2]; assert(['valid', 'denied'].includes(expected));
const status = fs.readFileSync('/proc/self/status', 'utf8');
assert.match(status, /^CapEff:\s+0+$/mu); assert.match(status, /^NoNewPrivs:\s+1$/mu);
let context = null, rejected = false, stage = 'fixed-reader', rejection = null;
try {
  const snapshot = readFixedSnapshot({ platform: process.platform, uid: process.getuid(), pid: process.pid, wallMs: Date.now() });
  snapshot.wallMs = Date.now();
  stage = 'local-validator';
  context = validateLocalReleasedSnapshot(snapshot, 'office', {
    fixedRelease: { contract: 'synthetic-local-primary-proof' }, modes: ['status', 'office'],
  });
} catch (error) {
  rejected = true;
  rejection = { stage, type: error.name, code: error.code ?? null,
    messageSha256: createHash('sha256').update(String(error.message)).digest('hex'),
    actualNumber: typeof error.actual === 'number' ? error.actual : null,
    expectedNumber: typeof error.expected === 'number' ? error.expected : null };
}
if (context) {
  assert.equal(context.admissionProtocol, 'local-primary-operation-v1');
  assert(!fs.existsSync('/admission/authority-public.pem'));
  assert.equal(context.operationSequence, 1);
}
const passed = rejected === (expected === 'denied');
process.stdout.write(JSON.stringify({ passed, rejected, rejection, actualUid: process.getuid(),
  actualGid: process.getgid(), noCapabilities: true, noNewPrivileges: true,
  actualKernelProcAndMounts: Boolean(context), noCloudAuthorityKey: !fs.existsSync('/admission/authority-public.pem') }) + '\n');
if (!passed) process.exitCode = 1;
