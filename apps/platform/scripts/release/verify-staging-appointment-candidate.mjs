// Read-only verifier for the reviewed 93-migration staging candidate.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { assertTarget, assessSnapshot, snapshotSQL, stagingRef } from './staging-permissions.mjs';

const root = new URL('../../../../', import.meta.url);
export const sha = value => createHash('sha256').update(value).digest('hex');
export function migrationIdentity(name) {
  const match = /^(\d+)_(.+)\.sql$/.exec(name);
  assert.ok(match, 'Unsupported migration filename.');
  return { version:match[1], name:match[2] };
}
export function verifySources(candidate, read, inventory) {
  assert.equal(candidate.projectRef, stagingRef);
  assert.equal(candidate.expectedMigrationCount, 93);
  assert.equal(sha(read('supabase/staging/permission-profile.json')), candidate.previousProfileSha256, 'Previous reviewed profile changed.');
  const manifest = read('supabase/reconciliation/release-2026-10-17.json');
  assert.equal(sha(manifest), candidate.migrationManifestSha256, 'Original release manifest changed.');
  assert.equal(sha(read('supabase/verification/release_catalog.sql')), candidate.catalogQuerySha256, 'Catalog query changed.');
  const files = [...JSON.parse(manifest).files.map(f => ({ name:f.file, sha256:f.sha256 })), candidate.additionalMigration];
  assert.equal(files.length, 93);
  // New local application work must be pinned separately. It is NOT part of
  // this historical 93-entry candidate or the hosted ledger/permission verdict.
  const deferred = JSON.parse(read('supabase/staging/deferred-migrations.json'));
  assert.equal(deferred.version, 1);
  assert.equal(deferred.requiresSeparateStagingReview, true);
  assert.equal(deferred.readyForHosting, false);
  assert.equal(new Set([...files, ...deferred.migrations].map(f => f.name)).size, files.length + deferred.migrations.length);
  assert.deepEqual(inventory, [...files, ...deferred.migrations].map(f => f.name).sort(), 'Unexpected migration inventory; review the next candidate.');
  for (const f of deferred.migrations) {
    migrationIdentity(f.name);
    assert.ok(f.name > candidate.additionalMigration.name, 'Deferred migrations must follow the reviewed candidate.');
    assert.equal(sha(read('supabase/migrations/' + f.name)), f.sha256, 'Deferred migration bytes changed: ' + f.name);
  }
  for (const f of files) assert.equal(sha(read('supabase/migrations/' + f.name)), f.sha256, 'Migration bytes changed: ' + f.name);
  return files;
}
export function verifyCandidate(candidate, snapshot, ledger, files) {
  const verdict = assessSnapshot(candidate, snapshot);
  assert.equal(verdict.currentObjectGrantsMatch, true, 'New candidate grants do not match reviewed replay.');
  assert.equal(verdict.migrationOwnerDefaultsRestricted, true);
  assert.deepEqual(ledger, files.map(f => migrationIdentity(f.name)), 'Exact migration versions/names differ.');
  return verdict;
}
export function catalogDelta(before, after) {
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(k => [k,canonical(value[k])])) : value;
  const index = rows => {
    const map = new Map();
    for (const row of rows) { const key = row.kind + '|' + row.key; assert.ok(!map.has(key), 'Duplicate catalog identity.'); map.set(key,sha(JSON.stringify(canonical(row.value)))); }
    return map;
  };
  const a = index(before), b = index(after);
  return {
    added:[...b].filter(([key]) => !a.has(key)).map(([key,hash]) => ({key,hash})).sort((x,y)=>x.key.localeCompare(y.key)),
    changed:[...b].filter(([key,hash]) => a.has(key) && a.get(key)!==hash).map(([key,hash]) => ({key,before:a.get(key),after:hash})).sort((x,y)=>x.key.localeCompare(y.key)),
    removed:[...a.keys()].filter(key => !b.has(key)).sort(),
  };
}
function run() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log('verify-staging-appointment-candidate.mjs --project-ref <assigned staging ref>\nRead-only. Verifies the 93-migration candidate; never applies, links, repairs, deploys or retrieves keys.'); return;
  }
  assert.deepEqual(args, ['--project-ref',stagingRef], 'Only a read-only check of the assigned staging target is supported.');
  const read = path => readFileSync(new URL(path,root));
  const candidate = JSON.parse(read('supabase/staging/appointment-candidate-93.json'));
  const files = verifySources(candidate, read, readdirSync(new URL('supabase/migrations/',root)).filter(f=>f.endsWith('.sql')).sort());
  const catalog = read('supabase/verification/release_catalog.sql').toString();
  const directory = mkdtempSync(join(tmpdir(),'ats-staging93-verify-'));
  mkdirSync(join(directory,'supabase'));
  writeFileSync(join(directory,'supabase/config.toml'),'project_id="ats_staging93_verify"\n[db.seed]\nenabled=false\n');
  const cli = process.env.STAGING_SUPABASE_BIN || 'supabase';
  function call(argv,phase) {
    try {
      const raw = execFileSync(cli,[...argv,'--workdir',directory,'--output-format','json'],{encoding:'utf8',maxBuffer:8*1024*1024,timeout:60000,stdio:['ignore','pipe','pipe']});
      writeFileSync(join(directory,phase+'.private.json'),raw,{mode:0o600}); return JSON.parse(raw);
    } catch(error) { writeFileSync(join(directory,phase+'.private.log'),String(error.stderr??''),{mode:0o600}); throw Error('Read-only check failed; inspect private evidence in '+directory); }
  }
  assertTarget(stagingRef,call(['projects','list'],'projects'));
  const file = join(directory,'snapshot.sql');
  writeFileSync(file,`begin read only;set local statement_timeout='20s';${snapshotSQL(catalog)};commit;`);
  const snapshot = call(['db','query','--linked','--project-ref',stagingRef,'--file',file],'snapshot').rows[0].snapshot;
  const ledgerFile = join(directory,'ledger.sql');
  writeFileSync(ledgerFile,'begin read only;select version,name from supabase_migrations.schema_migrations order by version;commit;');
  const ledger = call(['db','query','--linked','--project-ref',stagingRef,'--file',ledgerFile],'ledger').rows;
  const verified = verifyCandidate(candidate,snapshot,ledger,files);
  const result = { projectRef:stagingRef,sourceCommit:candidate.sourceCommit,migrations:ledger.length,...verified,
    managedDefaultsChanged:false,productionWrites:false,deployed:false,readyForHosting:false,evidenceDirectory:directory };
  writeFileSync(join(directory,'result.json'),JSON.stringify(result,null,2)+'\n'); console.log(JSON.stringify(result,null,2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {run();} catch(error) {console.error(error.message);process.exitCode=1;}
}
