import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { getClamAVState } from '../scripts/private-scanner/bridge.mjs';
import { readScannerToken } from '../scripts/private-scanner/token.mjs';
import { probeScanner } from '../scripts/private-scanner/probe.mjs';

test('file credentials are private, bounded and unambiguous; existing environment token remains supported', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'ats-scanner-token-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'token'); const token = 'synthetic-local-test-token-without-business-data';
  await writeFile(file, token + '\n', { mode: 0o600 }); assert.equal(readScannerToken({ DOCUMENT_SCANNER_TOKEN_FILE: file }), token);
  assert.equal(readScannerToken({ DOCUMENT_SCANNER_TOKEN: token }), token);
  assert.throws(() => readScannerToken({ DOCUMENT_SCANNER_TOKEN_FILE: file, DOCUMENT_SCANNER_TOKEN: token }));
  await chmod(file, 0o644); assert.throws(() => readScannerToken({ DOCUMENT_SCANNER_TOKEN_FILE: file }));
  for (const value of ['', 'short', token + '\n', 'x'.repeat(1025)]) assert.throws(() => readScannerToken({ DOCUMENT_SCANNER_TOKEN: value }));
});
test('loaded definitions report 24/36 hour warnings and fail closed at 48 hours, invalid or future timestamps', async t => {
  const now = Date.parse('2026-10-17T00:00:00Z'); let version;
  const server = createServer(socket => socket.once('data', () => socket.end(version + '\0')));
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const connection = { host: '127.0.0.1', port: server.address().port };
  for (const [hours, expected] of [[1, 'current'], [24, 'warning'], [36, 'urgent'], [48, 'urgent']]) {
    version = `ClamAV 1.5.4/999/${new Date(now - hours * 3600000).toUTCString().replace(' GMT', '')}`;
    const state = await getClamAVState(connection, now); assert.equal(state.freshness, expected); assert.equal(state.signatureAgeSeconds, hours * 3600);
  }
  for (const stamp of [new Date(now - 49 * 3600000).toUTCString(), new Date(now + 2 * 3600000).toUTCString(), 'invalid']) {
    version = 'ClamAV 1.5.4/999/' + stamp.replace(' GMT', ''); await assert.rejects(() => getClamAVState(connection, now));
  }
});
test('probe rejects remote plaintext, decorated URLs and missing credentials before transmitting anything', async () => {
  for (const env of [{ SCANNER_PROBE_URL: 'http://example.invalid/scan' }, { SCANNER_PROBE_URL: 'https://user@example.invalid/scan' },
    { SCANNER_PROBE_URL: 'https://example.invalid/scan?token=bad' }, { SCANNER_PROBE_URL: 'http://127.0.0.1:3311/scan' }]) {
    await assert.rejects(() => probeScanner(env));
  }
});
