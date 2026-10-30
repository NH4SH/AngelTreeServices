import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {fixture} from './candidate-fixtures.mjs';
import {BASE_REPAIR_HELPERS,BASE_SERVICES,NEW_TABLES,bindRecoveryOperationalPolicy,assertLegacySourceCompatibility,policySha256} from './candidate-source/recovery-operational-policy.mjs';
import {basicRecoverySourceObservation,operativeHelperDigests,assertIORecoverySource,assertManifestSourceInventory} from './candidate-source/recovery-profile-context.mjs';
import {primaryOperationFiles} from './candidate-source/primary-operation-files.mjs';

const source=new URL('./candidate-source/',import.meta.url);
const oldBinding={environment:'home-primary-v1',sourceId:'ats_crm_primary_20261029',namespace:'ats-home-continuous-7445a45dddd9',sourceScope:'crm-v1',sourceMigrationCount:102,captureMode:'transaction-barrier',privateFileFormat:'patch-v1',admissionProtocol:'certified-native-wal-v1'};
function observedIO(f){
 return {
  project:'ats_crm_primary_20261029',productionBinding:oldBinding,
  sql(query){
   assert.match(query,/'protectedTableNames'.*schemaname in\('public','app_private','auth','storage'\)/u);
   assert.match(query,/'captureTableNames'.*schemaname in\('public','app_private','auth','storage','supabase_migrations'\)/u);
   assert.doesNotMatch(query,/rolconfig|rolpassword|\b(?:alter|update|insert|delete|create)\b/iu);
   return JSON.stringify({sourceMigrationCount:102,fullLedgerMd5:f.policy.baseLedgerFullRowMd5,protectedTableNames:f.policy.baselineTables,captureTableNames:f.policy.baselineCaptureTables,roleNames:[],roles:[]});
  },
  docker(args){assert.deepEqual(args.slice(0,2),['ps','-a']);return BASE_SERVICES.map(s=>JSON.stringify({Labels:'com.docker.compose.service='+s})).join('\n');}
 };
}

test('actual four-schema175 observations do not count migration metadata as protected tables',()=>{
 const f=fixture(),observed=basicRecoverySourceObservation(observedIO(f));
 assert.deepEqual(observed.protectedTableNames,f.policy.baselineTables);
 assert.deepEqual(observed.captureTableNames,f.policy.baselineCaptureTables);
 assert.ok(observed.captureTableNames.includes('supabase_migrations.schema_migrations'));
 assert.throws(()=>assertIORecoverySource(observedIO(f)),/Exact original inventory\/semantic legacy pins are UNBOUND/u);
});

test('complete capture inventory uses separately approved exact names, without a guessed total',()=>{
 for(const extra of [[],['supabase_migrations.synthetic_second_registry']]){
  const f=fixture(p=>p.baselineCaptureTables.push(...extra));
  const profile=bindRecoveryOperationalPolicy(f);
  const inventory=[...f.policy.baselineCaptureTables,...NEW_TABLES].map(name=>({name}));
  assert.doesNotThrow(()=>assertManifestSourceInventory({tables:inventory},f.binding,{verifiedProfile:profile}));
  assert.throws(()=>assertManifestSourceInventory({tables:inventory.filter(r=>r.name!=='supabase_migrations.schema_migrations')},f.binding,{verifiedProfile:profile}));
  const replaced=inventory.map(r=>r.name==='supabase_migrations.schema_migrations'?{name:'supabase_migrations.same_count_wrong_name'}:r);
  assert.throws(()=>assertManifestSourceInventory({tables:replaced},f.binding,{verifiedProfile:profile}));
 }
});

test('a supplied capture hash cannot silently replace either independently approved baseline set',()=>{
 const f=fixture();f.expectedApproval.baselineCaptureInventorySha256='f'.repeat(64);
 assert.throws(()=>bindRecoveryOperationalPolicy(f),/capture inventory/u);
 const g=fixture();g.observed.captureTableNames=g.observed.protectedTableNames;
 assert.throws(()=>bindRecoveryOperationalPolicy(g),/catalog/u);
 const h=fixture();h.observed.protectedTableNames=h.observed.captureTableNames;
 assert.throws(()=>bindRecoveryOperationalPolicy(h),/catalog/u);
});

test('legacy inspection verifies both protected and capture inventories and retains migration history',()=>{
 const f=fixture(),legacyPins={baselineInventorySha256:policySha256([...f.policy.baselineTables].sort()),baselineCaptureInventorySha256:policySha256([...f.policy.baselineCaptureTables].sort())};
 assert.doesNotThrow(()=>assertManifestSourceInventory({tables:f.policy.baselineCaptureTables.map(name=>({name}))},oldBinding,{legacyPins}));
 assert.throws(()=>assertManifestSourceInventory({tables:f.policy.baselineTables.map(name=>({name}))},oldBinding,{legacyPins}));
 const wrong=f.policy.baselineCaptureTables.map(n=>n==='supabase_migrations.schema_migrations'?'supabase_migrations.wrong_ledger_name':n);
 assert.throws(()=>assertManifestSourceInventory({tables:wrong.map(name=>({name}))},oldBinding,{legacyPins}));
});

test('operative helper hashes read actual disk bytes and keep base repair provenance distinct',()=>{
 const f=fixture(),actual=operativeHelperDigests();
 assert.equal(BASE_REPAIR_HELPERS['native-online-candidate.mjs'],'1567b2552dbf489a606777ecd4ed707acdcdbd3239bebdc82a028ac7a10cf031');
 assert.equal(actual['native-online-candidate.mjs'],'2cf8f2d3e3428782ac66a28f449db323a4beee7ce0c602fa70980a96b41c2630');
 assert.notDeepEqual(actual,BASE_REPAIR_HELPERS);
 f.observed.operativeHelpers=actual;assert.ok(bindRecoveryOperationalPolicy(f));
 const stale=fixture(p=>p.operativeHelpers={...BASE_REPAIR_HELPERS});
 stale.observed.operativeHelpers=actual;
 assert.throws(()=>bindRecoveryOperationalPolicy(stale),/catalog/u);
});

test('actual altered helper bytes cannot be replaced by an expected value or base repair constant',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ats-recovery-review-owned-'));
 try{
  for(const name of ['recovery-profile-context.mjs','recovery-operational-policy.mjs','recovery-source-pins.json',...Object.keys(BASE_REPAIR_HELPERS)])fs.copyFileSync(new URL(name,source),path.join(dir,name));
  const local=await import(pathToFileURL(path.join(dir,'recovery-profile-context.mjs')).href);
  assert.deepEqual(local.operativeHelperDigests(),operativeHelperDigests());
  fs.appendFileSync(path.join(dir,'native-online-candidate.mjs'),'\n// Synthetic owned disk-tampering fixture.\n');
  const changed=local.operativeHelperDigests();
  assert.notEqual(changed['native-online-candidate.mjs'],fixture().policy.operativeHelpers['native-online-candidate.mjs']);
  const f=fixture();f.observed.operativeHelpers=changed;
  assert.throws(()=>bindRecoveryOperationalPolicy(f),/catalog/u);
 }finally{fs.rmSync(dir,{recursive:true});}
});

test('operative source approval is separately pinned and cannot change the untouched repair helpers',()=>{
 const f=fixture();f.expectedApproval.operativeHelpersSha256='f'.repeat(64);
 assert.throws(()=>bindRecoveryOperationalPolicy(f),/operative helper/u);
 assert.throws(()=>bindRecoveryOperationalPolicy(fixture(p=>p.operativeHelpers['capture-attempt-lock.mjs']='f'.repeat(64))),/operative helper/u);
});

test('legacy source checks require the actual operative digest and exact complete capture inventory',()=>{
 const f=fixture(),observed=basicRecoverySourceObservation(observedIO(f));
 Object.assign(observed,{semanticSchemaSha256:'a'.repeat(64),releaseComponentDigest:'c'.repeat(64)});
 const expectedLegacy={kind:'ats-approved-legacy-crm102-profile-v1',baselineInventorySha256:policySha256([...f.policy.baselineTables].sort()),baselineCaptureInventorySha256:policySha256([...f.policy.baselineCaptureTables].sort()),operativeHelpersSha256:policySha256(f.policy.operativeHelpers),semanticSchemaSha256:'a'.repeat(64),releaseComponentDigest:'c'.repeat(64)};
 assert.ok(assertLegacySourceCompatibility({binding:oldBinding,observed,expectedLegacy}));
 assert.throws(()=>assertLegacySourceCompatibility({binding:oldBinding,observed:{...observed,operativeHelpers:BASE_REPAIR_HELPERS},expectedLegacy}));
 assert.throws(()=>assertLegacySourceCompatibility({binding:oldBinding,observed:{...observed,captureTableNames:f.policy.baselineTables},expectedLegacy}));
});

test('home and cloud closures include the transitive public pin resource and remain bounded',()=>{
 for(const cloudOnly of [false,true]){
  const files=primaryOperationFiles(source.pathname,{cloudOnly});
  assert.ok(files.length<=90);
  for(const name of ['recovery-profile-context.mjs','recovery-operational-policy.mjs','recovery-source-pins.json'])assert.ok(files.includes(name));
  assert.ok(files.every(n=>!n.includes('private')));
 }
});
