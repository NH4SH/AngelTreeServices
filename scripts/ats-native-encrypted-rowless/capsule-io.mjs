// Dedicated private CI fixture only. The one-use key is never a production key.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash, randomBytes, createDecipheriv, createCipheriv } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const [mode, directory] = process.argv.slice(2);
const secret = process.env.ATS_FIXTURE_KEY; delete process.env.ATS_FIXTURE_KEY;
assert.equal(process.platform, 'linux'); assert.equal(process.getuid(), 0);
assert.match(secret ?? '', /^[a-f0-9]{64}$/u); const key = Buffer.from(secret, 'hex');
const aad = Buffer.from('ats-rowless-native-test-v1'), sha = b => createHash('sha256').update(b).digest('hex');
assert.equal(resolve(directory), fs.realpathSync(directory));
const st = fs.lstatSync(directory); assert(st.isDirectory() && st.uid === 0 && (st.mode & 0o777) === 0o700);
const here = dirname(fileURLToPath(import.meta.url));
if (mode === 'decrypt') {
  const pins = JSON.parse(fs.readFileSync(here + '/ci-input-pins.json'));
  const raw = fs.readFileSync(here + '/ci-input.sealed.json'); assert.equal(raw.length, pins.ciphertextBytes);
  assert.equal(sha(raw), pins.ciphertextSha256); assert(raw.length < 2 * 1024 ** 2);
  const e = JSON.parse(raw); assert.equal(e.kind, 'ats-private-native-input-aes256gcm-v1');
  assert.match(e.iv, /^[a-f0-9]{24}$/u); assert.match(e.tag, /^[a-f0-9]{32}$/u);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(e.iv, 'hex'));
  decipher.setAAD(aad); decipher.setAuthTag(Buffer.from(e.tag, 'hex'));
  const plain = gunzipSync(Buffer.concat([decipher.update(Buffer.from(e.ciphertext, 'base64')), decipher.final()]), { maxOutputLength: 8 * 1024 ** 2 });
  assert.equal(sha(plain), pins.plaintextSha256);
  const p = JSON.parse(plain); assert.equal(p.kind, 'ats-rowless-native-test-input-v1');
  assert.deepEqual(p.records.map(r => r.name).sort(), ['catalog.json', 'events.sql', 'manifest.json', 'role-settings.json', 'source-records.json', 'structural.sql', 'validate-functions.sql']);
  assert.equal(p.records.length, pins.records.length);
  for (const [i, r] of p.records.entries()) {
    assert.deepEqual(({ name: r.name, bytes: r.bytes, sha256: r.sha256 }), pins.records[i]);
    const bytes = Buffer.from(r.base64, 'base64'); assert.equal(bytes.toString('base64'), r.base64);
    assert.equal(bytes.length, r.bytes); assert.equal(sha(bytes), r.sha256);
    fs.writeFileSync(directory + '/' + r.name, bytes, { flag: 'wx', mode: 0o600 });
  }
  process.stdout.write(JSON.stringify({ authenticated: true, files: p.records.length, ciphertextSha256: sha(raw) }) + '\n');
} else {
  assert.equal(mode, 'encrypt-diagnostics');
  const plain = fs.readFileSync(directory + '/diagnostics.private.json'); assert(plain.length < 8 * 1024 ** 2);
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv); cipher.setAAD(aad);
  const data = Buffer.concat([cipher.update(gzipSync(plain)), cipher.final()]);
  const e = Buffer.from(JSON.stringify({ kind: 'ats-private-native-diagnostics-aes256gcm-v1', iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), ciphertext: data.toString('base64') }) + '\n');
  fs.writeFileSync(directory + '/diagnostics.sealed.json', e, { flag: 'wx', mode: 0o600 });
  process.stdout.write(JSON.stringify({ encrypted: true, ciphertextSha256: sha(e), bytes: e.length }) + '\n');
}
key.fill(0);
