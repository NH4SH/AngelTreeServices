import assert from 'node:assert/strict';
import test from 'node:test';
import { compareCatalogs, reviewMigrations } from '../scripts/release/migration-review.mjs';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const row = (key, value = 'a') => ({ kind: 'routine', key, fingerprint: value.repeat(32) });
test('catalog review preserves missing, different and unexpected objects instead of flattening drift', () => {
  const d = compareCatalogs([row('same'), row('changed'), row('missing')], [row('same'), row('changed', 'b'), row('unexpected')]);
  assert.deepEqual(d, { missing: ['routine|missing'], different: ['routine|changed'], extra: ['routine|unexpected'], exact: ['routine|same'] });
});
test('a missing history entry never automatically authorizes history repair even when final objects match', () => {
  const result = reviewMigrations([{ file: '0001_base.sql' }, { file: '0002_change.sql' }], ['0001'], [{ file: '0002_change.sql', added: ['routine|same'], changed: [], removed: [] }], [row('same')], [row('same')]);
  assert.equal(result[0].finalObjectsMatching, 1); assert.equal(result[0].classification, 'review-required'); assert.equal(result[0].automaticRepairAllowed, false);
});
test('unknown/non-prefix hosted history, duplicate identities and duplicate migration versions stop the review', () => {
  assert.throws(() => compareCatalogs([row('same'), row('same')], []));
  for (const versions of [['0002'], ['unknown']]) assert.throws(() => reviewMigrations([{ file: '0001_base.sql' }], versions, [], [], []));
  assert.throws(() => reviewMigrations([{ file: '0001_a.sql' }, { file: '0001_b.sql' }], [], [], [], []));
});
test('local rehearsal rejects remote/overriding/malformed private DB URLs before invoking any binary, without printing credentials', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ats-rehearsal-guard-')), file = join(dir, 'status.private.json'), secret = 'never-print-fixture-password';
  try {
    for (const DB_URL of [`postgresql://postgres:${secret}@remote.example.invalid:54322/postgres`, `postgresql://postgres:${secret}@127.0.0.1:54322/postgres?host=remote.example.invalid`, `http://postgres:${secret}@127.0.0.1:54322/postgres`, secret]) {
      writeFileSync(file, JSON.stringify({ API_URL: 'http://127.0.0.1:54321', DB_URL }), { mode: 0o600 });
      const result = spawnSync(process.execPath, [new URL('../scripts/release/rehearse-local-upgrade.mjs', import.meta.url).pathname], { encoding: 'utf8', env: { PATH: process.env.PATH, RECONCILE_DISPOSABLE_STACK: '1', DOCKER_HOST: 'unix:///synthetic/pr02-disposable/sock/docker.sock', RECONCILE_LOCAL_STATUS_FILE: file, RECONCILE_DOCKER_BIN: '/must-not-be-executed', RECONCILE_SUPABASE_BIN: '/must-not-be-executed' } });
      assert.equal(result.status, 1); assert.match(result.stderr, /configuration is invalid/); assert.equal((result.stdout + result.stderr).includes(secret), false); assert.equal(result.stderr.includes('ENOENT'), false);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
