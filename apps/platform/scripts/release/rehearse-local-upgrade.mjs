// Guarded local-only CLI ledger rehearsal. Never links to or writes a hosted DB.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync, mkdirSync, mkdtempSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
function runRehearsal() {
const env = process.env;
assert.equal(env.RECONCILE_DISPOSABLE_STACK, '1');
assert.match(env.DOCKER_HOST ?? '', /^unix:.*pr02-disposable\/sock\/docker.sock$/);
const status = JSON.parse(readFileSync(env.RECONCILE_LOCAL_STATUS_FILE, 'utf8'));
assert.equal(status.API_URL, 'http://127.0.0.1:54321');
const url = new URL(status.DB_URL); assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.port, '54322');
assert.ok(['postgres:', 'postgresql:'].includes(url.protocol)); assert.equal(url.pathname, '/postgres'); assert.equal(url.search, ''); assert.equal(url.hash, '');
const docker = env.RECONCILE_DOCKER_BIN, cli = env.RECONCILE_SUPABASE_BIN; assert.ok(docker && cli);
const database = 'ats_stage_prep_' + randomUUID().replaceAll('-', ''), directory = mkdtempSync(join(tmpdir(), 'ats-upgrade-rehearsal-'));
const migrations = new URL('../../../../supabase/migrations/', import.meta.url), query = readFileSync(new URL('../../../../supabase/verification/release_catalog.sql', import.meta.url), 'utf8').trim().replace(/;$/, '');
const files = readdirSync(migrations).filter(x => x.endsWith('.sql')).sort();
const history = JSON.parse(readFileSync(env.RECONCILE_HISTORY_FILE, 'utf8')).map(x => x.version);
assert.ok(history.length > 0 && history.length < files.length);
assert.ok(history.every((v, i) => v === files[i].split('_')[0]), 'Observed history must be an exact repository prefix.');
const hash = file => createHash('sha256').update(readFileSync(new URL(file, migrations))).digest('hex');
const originalHashes = files.map(hash);
function sql(source, db = database, user = 'postgres') {
  const r = spawnSync(docker, ['exec', '-i', 'supabase_db_ats_pr02_disposable', 'psql', '-X', '-qAt', '-U', user, '-d', db, '-v', 'ON_ERROR_STOP=1'], { input: source, env, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (r.status !== 0) { writeFileSync(join(directory, 'sql-failure.private.log'), (r.stderr ?? ''), { mode: 0o600 }); throw Error('Local SQL failed.'); }
  return r.stdout.trim();
}
try {
  assert.equal(sql(`select count(*) from pg_database where datname='${database}'`, 'postgres'), '0');
  sql('create database ' + database, 'postgres');
  // Trusted local Auth/Storage SCHEMA ONLY bootstrap. Never export business rows.
  sql(readFileSync(env.RECONCILE_AUTH_STORAGE_BOOTSTRAP, 'utf8'), database, 'supabase_admin');
  mkdirSync(join(directory, 'supabase/migrations'), { recursive: true });
  writeFileSync(join(directory, 'supabase/config.toml'), `project_id="${database}"\n[db]\nmajor_version=17\n[db.migrations]\nenabled=true\n[db.seed]\nenabled=false\n`);
  url.pathname = '/' + database;
  function migrate(phase) {
    const r = spawnSync(cli, ['migration', 'up', '--db-url', url.href, '--workdir', directory], { env, encoding: 'utf8', timeout: 120000 });
    writeFileSync(join(directory, phase + '.private.log'), (r.stdout ?? '') + (r.stderr ?? ''), { mode: 0o600 }); assert.equal(r.status, 0, 'Local CLI failed.');
  }
  function copy(list) { for (const file of list) copyFileSync(new URL(file, migrations), join(directory, 'supabase/migrations', file)); }
  copy(files.slice(0, history.length)); migrate('baseline');
  assert.equal(Number(sql('select count(*) from supabase_migrations.schema_migrations')), history.length);
  if (env.RECONCILE_LOCAL_OVERLAY) sql('begin;\n' + readFileSync(env.RECONCILE_LOCAL_OVERLAY, 'utf8') + '\ncommit;', database, 'supabase_admin');
  copy(files.slice(history.length)); migrate('pending');
  const ledger = JSON.parse(sql('select jsonb_agg(version order by version) from supabase_migrations.schema_migrations'));
  assert.deepEqual(ledger, files.map(f => f.split('_')[0])); assert.deepEqual(files.map(hash), originalHashes);
  const catalog = sql("begin read only;set local search_path=pg_catalog,public,extensions;select jsonb_agg(to_jsonb(c) order by kind,key) from (" + query + ") c;commit;");
  writeFileSync(join(directory, 'catalog.json'), catalog);
  const gates = JSON.parse(sql("select jsonb_build_object('document',(select enabled from app_private.document_scan_settings where singleton),'attachments',(select bool_or(enabled) from app_private.attachment_scan_settings),'recurring',(select automated_generation_enabled from recurring_service_settings),'communications',(select automated_sending_enabled from communication_settings),'authUsers',(select count(*) from auth.users),'storageObjects',(select count(*) from storage.objects))"));
  assert.ok(Object.values(gates).every(x => x === false || x === 0));
  const result = { database, evidenceDirectory: directory, cliVersion: execFileSync(cli, ['--version'], { encoding: 'utf8' }).trim(), ledgerBefore: history.length, ledgerAfter: ledger.length, appliedLocally: files.length - history.length, overlayUsed: Boolean(env.RECONCILE_LOCAL_OVERLAY), gates, originalMigrationFilesUnchanged: true, hostedWrites: false, globalRoleChanges: false };
  writeFileSync(join(directory, 'results.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2));
} catch { console.error('Local rehearsal failed. Inspect private diagnostics in ' + directory + '. No hosted operation was performed.'); process.exitCode = 1; }
}
try { runRehearsal(); }
catch { console.error('Local rehearsal configuration is invalid. No operation was performed.'); process.exitCode = 1; }
