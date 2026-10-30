import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { schemaContentFingerprint } from './schema-fingerprint.mjs';

function archive() {
  const b = Buffer.alloc(256); b.write('PGDMP'); b.set([1, 16, 0, 4, 8, 1, 0], 5);
  [30, 12, 10, 28, 9, 126, 1].forEach((v, i) => b.writeUInt32LE(v, 13 + i * 5));
  b.write('native schema content', 80); return b;
}
test('only the native archive creation date is excluded from schema comparison', () => {
  const a = archive(), original = Buffer.from(a), b = Buffer.from(a);
  b.writeUInt32LE(31, 13); assert.equal(schemaContentFingerprint(a), schemaContentFingerprint(b));
  b[100] ^= 1; assert.notEqual(schemaContentFingerprint(a), schemaContentFingerprint(b));
  assert.deepEqual(a, original);
});
test('unknown native layouts and invalid date fields fail closed', () => {
  for (const [offset, value] of [[5, 2], [6, 17], [8, 8], [9, 4], [10, 3], [11, 255], [12, 2]]) {
    const b = archive(); b[offset] = value; assert.throws(() => schemaContentFingerprint(b));
  }
  const b = archive(); b.writeUInt32LE(99, 13); assert.throws(() => schemaContentFingerprint(b));
});
test('retained real native dump has the reviewed header', { skip: !process.env.ATS_ROTATION_FIXTURE }, () => {
  const b = readFileSync(process.env.ATS_ROTATION_FIXTURE + '/certified-readback-5/database.dump');
  assert.match(schemaContentFingerprint(b), /^[a-f0-9]{64}$/);
});
