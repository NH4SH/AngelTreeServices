// Comparison only: original native archives are NEVER rewritten. Their complete
// SHA256 remains the recovery artifact identity. Ignore only the creation date
// in a reviewed PostgreSQL custom-format 1.16.0 header when comparing schema dumps.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export function schemaContentFingerprint(bytes) {
  assert.ok(Buffer.isBuffer(bytes) && bytes.length >= 64);
  assert.equal(bytes.subarray(0, 5).toString('ascii'), 'PGDMP');
  assert.deepEqual([...bytes.subarray(5, 8)], [1, 16, 0], 'Review new native archive version');
  assert.equal(bytes[8], 4, 'Unexpected native integer size');
  assert.equal(bytes[9], 8, 'Unexpected native offset size');
  assert.equal(bytes[10], 1, 'Custom archive format required');
  assert.ok(bytes[11] <= 3, 'Unknown native compression algorithm');
  const dates = [];
  for (let offset = 12; offset < 47; offset += 5) {
    assert.ok(bytes[offset] === 0 || bytes[offset] === 1);
    dates.push((bytes[offset] ? -1 : 1) * bytes.readUInt32LE(offset + 1));
  }
  const [sec, min, hour, day, month, year, dst] = dates;
  assert.ok(sec >= 0 && sec <= 60 && min >= 0 && min <= 59 && hour >= 0 && hour <= 23 &&
    day >= 1 && day <= 31 && month >= 0 && month <= 11 && year >= 100 && year <= 1000 &&
    [-1, 0, 1].includes(dst), 'Invalid native creation date');
  return createHash('sha256').update(bytes.subarray(0, 12)).update(Buffer.alloc(35))
    .update(bytes.subarray(47)).digest('hex');
}
