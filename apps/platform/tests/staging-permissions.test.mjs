import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { assertTarget, assessSnapshot, buildApplySQL, stagingRef } from '../scripts/release/staging-permissions.mjs';
const root = new URL('../../../', import.meta.url);
const read = file => readFileSync(new URL(file, root), 'utf8');
const profile = JSON.parse(read('supabase/staging/permission-profile.json'));
const commands = read('supabase/staging/reconcile-permissions.sql');
const catalog = read('supabase/verification/release_catalog.sql');
const target = { id:stagingRef, organization_id:'crisckykyefqdpatbfgb', name:'CRM Staging', status:'ACTIVE_HEALTHY' };
function fixture() {
  return { apiAclSeal:profile.initialApiAclSeal, shapeSeal:profile.shapeSeal, ledgerSeal:profile.ledgerSeal,
    migrationCount:92, ownedDefaultsSeal:profile.allowedOwnedDefaultsSeals[0], managedDefaultsSeal:profile.allowedManagedDefaultsSeals[0],
    ownedDefaultApiGrants:36, currentUser:'postgres', superuser:false, managedAdminMember:false, unexpectedDefaultScope:false, unsafeSchemaCreate:false,
    state:{ authUsers:0,storageObjects:0,customers:0,jobs:0,quotes:0,invoices:0,payments:0,communications:0,calendarConnections:0,stripeReceipts:0,
      sending:false,recurring:false,documentScanning:false,attachmentScanning:false } };
}
test('permission runner accepts only the assigned healthy staging project in ATS', () => {
  assert.doesNotThrow(() => assertTarget(stagingRef,[target]));
  assert.doesNotThrow(() => assertTarget(stagingRef,{projects:[target],message:'Projects listed.'}));
  assert.throws(() => assertTarget(stagingRef,{projects:null}));
  for (const ref of ['ddvlnixdugcbnrewktes','hgthkaixylgjcwmivyet','',stagingRef+'x']) assert.throws(() => assertTarget(ref,[target]));
  for (const change of [{organization_id:'other'},{name:'CRM'},{status:'INACTIVE'},{id:'other'}]) assert.throws(() => assertTarget(stagingRef,[{...target,...change}]));
});
test('reviewed initial and reconciled snapshots are recognized without modifying input', () => {
  const s=fixture(), copy=structuredClone(s);
  assert.deepEqual(assessSnapshot(profile,s),{currentObjectGrantsMatch:false,migrationOwnerDefaultsRestricted:false});
  assert.deepEqual(s,copy);
  s.apiAclSeal=profile.expectedApiAclSeal; s.ownedDefaultApiGrants=0; s.ownedDefaultsSeal=profile.allowedOwnedDefaultsSeals.at(-1);
  assert.deepEqual(assessSnapshot(profile,s),{currentObjectGrantsMatch:true,migrationOwnerDefaultsRestricted:true});
});
test('unknown grants, schema, column access, owners, ledger and protected defaults stop reconciliation', () => {
  for (const field of ['apiAclSeal','shapeSeal','ledgerSeal','ownedDefaultsSeal','managedDefaultsSeal']) {
    const s=fixture();s[field]='00000000000000000000000000000000';assert.throws(() => assessSnapshot(profile,s));
  }
  const s=fixture();s.migrationCount=93;assert.throws(() => assessSnapshot(profile,s));
});
test('business rows, accounts, files, queue work or enabled automation stop this initialization tool', () => {
  for (const key of Object.keys(fixture().state)) {const s=fixture();s.state[key]=typeof s.state[key]==='boolean'?true:1;assert.throws(() => assessSnapshot(profile,s));}
  for (const mutate of [s=>delete s.state.sending,s=>s.state.unreviewed=0,s=>s.state.attachmentScanning=null]) {const s=fixture();mutate(s);assert.throws(() => assessSnapshot(profile,s));}
});
test('no superuser, alternate owner, global defaults or browser schema creation is accepted', () => {
  for (const change of [{superuser:true},{currentUser:'supabase_admin'},{managedAdminMember:true},{managedAdminMember:undefined},{unexpectedDefaultScope:true},{unsafeSchemaCreate:true}]) assert.throws(() => assessSnapshot(profile,{...fixture(),...change}));
});
test('changing the reviewed SQL or catalog query cannot execute a partial or broader repair', () => {
  assert.throws(() => buildApplySQL(profile,fixture(),commands+'\ngrant all on schema public to anon;',catalog));
  assert.throws(() => buildApplySQL(profile,fixture(),commands,catalog+'\n-- changed query'));
});
test('reconciliation uses atomic preimage and postcondition checks with protected-default preservation', () => {
  const sql=buildApplySQL(profile,fixture(),commands,catalog);
  assert.match(sql,/begin isolation level serializable/);assert.match(sql,/pg_try_advisory_xact_lock/);
  assert.match(sql,/preimage changed/);assert.match(sql,/postcondition failed/);assert.match(sql,/managedDefaultsSeal/);
  assert.match(sql,/commit;$/);
});
test('reviewed operations only revoke extras and scope future named-role grants to postgres/public', () => {
  const lines=commands.split('\n').filter(x=>x.trim()&&!x.trim().startsWith('--'));
  assert.equal(lines.filter(x=>x.startsWith('revoke ')).length,279);
  assert.equal(lines.filter(x=>x.startsWith('alter default privileges for role postgres in schema public revoke all ')).length,3);
  assert.ok(lines.every(x=>/^revoke .* on (table|sequence|function) ("public"\.|public\.)/.test(x)||/^alter default privileges for role postgres in schema public revoke all /.test(x)));
  assert.ok(lines.every(x=>! /\b(cascade|grant|drop|delete|update|create)\b/.test(x.replace(/^revoke [\w, ]+ on /,'revoke on '))));
});
test('profile binds the immutable 92-file staging prefix even as later local migrations are added', () => {
  const manifest=read('supabase/reconciliation/release-2026-10-17.json');
  assert.equal(createHash('sha256').update(manifest).digest('hex'),profile.migrationManifestSha256);
  const repository=readdirSync(new URL('supabase/migrations/',root)).filter(f=>f.endsWith('.sql')).sort();
  const pinned=JSON.parse(manifest).files.map(f=>f.file).sort();
  assert.deepEqual(repository.slice(0,pinned.length),pinned);
  for (const file of JSON.parse(manifest).files) assert.equal(createHash('sha256').update(read('supabase/migrations/'+file.file)).digest('hex'),file.sha256);
  assert.equal(profile.expectedMigrationCount,92);assert.equal(profile.managedDefaultsRestricted,false);assert.equal(profile.globalDefaultsChanged,false);
});
test('wrong hosted target is rejected before a CLI process, login or network operation', () => {
  const result=spawnSync(process.execPath,[new URL('../scripts/release/staging-permissions.mjs',import.meta.url).pathname,'--project-ref','ddvlnixdugcbnrewktes','--apply'],
    {encoding:'utf8',env:{PATH:'/usr/bin:/bin',STAGING_SUPABASE_BIN:'/does/not/exist'}});
  assert.equal(result.status,1);assert.match(result.stderr,/Refuse non-staging target/);assert.doesNotMatch(result.stderr,/ENOENT|operation failed/);
});
