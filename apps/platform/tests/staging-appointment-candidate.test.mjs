import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {verifySources,verifyCandidate,catalogDelta,sha,migrationIdentity} from '../scripts/release/verify-staging-appointment-candidate.mjs';
const root=new URL('../../../',import.meta.url),read=p=>readFileSync(new URL(p,root));
const candidate=JSON.parse(read('supabase/staging/appointment-candidate-93.json'));
const inventory=readdirSync(new URL('supabase/migrations/',root)).filter(f=>f.endsWith('.sql')).sort();
const files=verifySources(candidate,read,inventory),ledger=files.map(f=>migrationIdentity(f.name));
const snapshot=()=>({apiAclSeal:candidate.expectedApiAclSeal,shapeSeal:candidate.shapeSeal,ledgerSeal:candidate.ledgerSeal,migrationCount:93,
 ownedDefaultsSeal:candidate.allowedOwnedDefaultsSeals[0],managedDefaultsSeal:candidate.allowedManagedDefaultsSeals[0],ownedDefaultApiGrants:0,
 currentUser:'postgres',superuser:false,managedAdminMember:false,unsafeSchemaCreate:false,unexpectedDefaultScope:false,
 state:{authUsers:0,storageObjects:0,customers:0,jobs:0,quotes:0,invoices:0,payments:0,communications:0,calendarConnections:0,stripeReceipts:0,sending:false,recurring:false,documentScanning:false,attachmentScanning:false}});
test('new candidate preserves all 92 original bytes and pins exactly one additive migration',()=>{
 assert.equal(files.length,93);assert.equal(candidate.additionalMigration.name,'20261018004943_atomic_legacy_appointments.sql');
 assert.equal(candidate.delta.added.length,7);assert.deepEqual(candidate.delta.changed,[]);assert.deepEqual(candidate.delta.removed,[]);
 assert.equal(candidate.readyForHosting,false);assert.equal(candidate.deployed,false);
});
test('original numbered migrations and timestamp migrations retain their exact historical identities',()=>{
 assert.deepEqual(migrationIdentity('0001_initial_platform_schema.sql'),{version:'0001',name:'initial_platform_schema'});
 assert.deepEqual(migrationIdentity('0011_employee_access_requests.sql'),{version:'0011',name:'employee_access_requests'});
 assert.deepEqual(migrationIdentity('20261018004943_atomic_legacy_appointments.sql'),{version:'20261018004943',name:'atomic_legacy_appointments'});
 assert.throws(()=>migrationIdentity('not_a_migration.sql'));
});
test('changed source, added/removed migration or edited old profile cannot pass verification',()=>{
 for(const path of ['supabase/staging/permission-profile.json','supabase/reconciliation/release-2026-10-17.json','supabase/verification/release_catalog.sql','supabase/migrations/'+files[0].name,'supabase/migrations/'+files[92].name,'supabase/migrations/20261020051222_atomic_customer_quote_changes.sql']) {
   assert.throws(()=>verifySources(candidate,p=>p===path?Buffer.concat([read(p),Buffer.from('\n')]):read(p),inventory));
 }
 assert.throws(()=>verifySources(candidate,read,inventory.slice(1)));
 assert.throws(()=>verifySources(candidate,read,[...inventory,'20261019000000_unreviewed.sql'].sort()));
});
test('exact 93-entry ledger, current permissions and empty/OFF snapshot pass',()=>{
 assert.deepEqual(verifyCandidate(candidate,snapshot(),ledger,files),{currentObjectGrantsMatch:true,migrationOwnerDefaultsRestricted:true});
});
test('old candidate, altered version/name or extra ledger entry are refused',()=>{
 for(const change of [{migrationCount:92},{shapeSeal:'bad'},{ledgerSeal:'bad'},{apiAclSeal:'bad'}])assert.throws(()=>verifyCandidate(candidate,{...snapshot(),...change},ledger,files));
 for(const entries of [ledger.slice(1),[...ledger,{version:'99999999999999',name:'extra'}],ledger.map((x,i)=>i===92?{...x,name:'different'}:x)])assert.throws(()=>verifyCandidate(candidate,snapshot(),entries,files));
});
test('unsafe defaults, protected membership, browser creation and unreviewed role fail closed',()=>{
 for(const change of [{ownedDefaultsSeal:'bad'},{managedDefaultsSeal:'bad'},{ownedDefaultApiGrants:1},{currentUser:'supabase_admin'},{superuser:true},{managedAdminMember:true},{unexpectedDefaultScope:true},{unsafeSchemaCreate:true}])assert.throws(()=>verifyCandidate(candidate,{...snapshot(),...change},ledger,files));
});
test('business users, data and automation cannot be mistaken for an empty isolated candidate',()=>{
 for(const key of Object.keys(snapshot().state)){const s=snapshot();s.state[key]=typeof s.state[key]==='boolean'?true:1;assert.throws(()=>verifyCandidate(candidate,s,ledger,files));}
 const s=snapshot();delete s.state.sending;assert.throws(()=>verifyCandidate(candidate,s,ledger,files));
});
test('catalog comparison is key-order independent and reports exact additions, changes and removals',()=>{
 const a=[{kind:'column',key:'a',value:{a:1,b:2}},{kind:'routine',key:'gone',value:{x:1}}];
 const b=[{kind:'column',key:'a',value:{b:2,a:1}},{kind:'trigger',key:'new',value:{x:2}}];
 const delta=catalogDelta(a,b);assert.deepEqual(delta.changed,[]);assert.deepEqual(delta.removed,['routine|gone']);assert.equal(delta.added[0].key,'trigger|new');
 assert.equal(catalogDelta(a,[{...a[0],value:{a:2}}]).changed.length,1);
 assert.throws(()=>catalogDelta(a,[...b,b[0]]));assert.equal(sha('test').length,64);
});
test('production targets and write flags fail before starting any tool or network operation',()=>{
 for(const args of [['--project-ref','ddvlnixdugcbnrewktes'],['--project-ref',candidate.projectRef,'--apply']]){
 const result=spawnSync(process.execPath,[new URL('../scripts/release/verify-staging-appointment-candidate.mjs',import.meta.url).pathname,...args],{encoding:'utf8',env:{PATH:'/usr/bin:/bin',STAGING_SUPABASE_BIN:'/does/not/exist'}});
 assert.equal(result.status,1);assert.match(result.stderr,/Only a read-only check/);assert.doesNotMatch(result.stderr,/ENOENT|private evidence/);
 }
});

test('deferred source migrations do not enter the historic staging ledger or bypass source review',()=>{
 const deferred=JSON.parse(read('supabase/staging/deferred-migrations.json'));
 assert.equal(inventory.length,109);assert.equal(files.length,93);assert.equal(deferred.migrations.length,16);
 assert.throws(()=>verifySources(candidate,p=>p==='supabase/staging/deferred-migrations.json'?Buffer.from(JSON.stringify({...deferred,readyForHosting:true})):read(p),inventory));
 assert.throws(()=>verifySources(candidate,p=>p==='supabase/staging/deferred-migrations.json'?Buffer.from(JSON.stringify({...deferred,migrations:[]})):read(p),inventory));
 assert.throws(()=>verifyCandidate(candidate,{...snapshot(),migrationCount:94},[...ledger,migrationIdentity(deferred.migrations[0].name)],files));
});
