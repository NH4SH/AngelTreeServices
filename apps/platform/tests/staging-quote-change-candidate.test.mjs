import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {verifyQuoteChangeSources,currentQuoteChangeSources,verifyQuoteChangeTarget} from '../scripts/release/verify-staging-quote-change-candidate.mjs';
import {verifyCandidate,migrationIdentity} from '../scripts/release/verify-staging-appointment-candidate.mjs';
import {expectedGuard,fingerprint} from '../scripts/release/staging-auth-activation.mjs';
const root=new URL('../../../',import.meta.url),read=p=>readFileSync(new URL(p,root));
const sources=currentQuoteChangeSources(),c=sources.candidate,profile=JSON.parse(read('supabase/staging/auth-email-guard/target-review.json'));
const inventory=readdirSync(new URL('supabase/migrations/',root)).filter(f=>f.endsWith('.sql')).sort();
function fixture(){
 const config={data:{id:c.projectRef,attributes:{api:{db_schema:'public,graphql_public'},auth:{hook_send_email_enabled:true,hook_send_email_uri:sources.guard.hookUri,disable_signup:true}}}};
 const activeProfile={projectRef:c.projectRef,functionBodyMd5:sources.guard.functionBodyMd5,authConfigurationFingerprint:fingerprint(config.data.attributes.auth),apiConfigurationFingerprint:fingerprint(config.data.attributes.api)};
 const snapshot={apiAclSeal:c.expectedApiAclSeal,shapeSeal:c.shapeSeal,ledgerSeal:c.ledgerSeal,migrationCount:94,ownedDefaultsSeal:c.allowedOwnedDefaultsSeals[0],managedDefaultsSeal:c.allowedManagedDefaultsSeals[0],ownedDefaultApiGrants:0,currentUser:'postgres',superuser:false,managedAdminMember:false,unsafeSchemaCreate:false,unexpectedDefaultScope:false,state:{authUsers:0,storageObjects:0,customers:0,jobs:0,quotes:0,invoices:0,payments:0,communications:0,calendarConnections:0,stripeReceipts:0,sending:false,recurring:false,documentScanning:false,attachmentScanning:false}};
 return{activeProfile,evidence:{projects:[{id:c.projectRef,name:'CRM Staging',organization_id:profile.organizationId,status:'ACTIVE_HEALTHY'}],identity:structuredClone(profile.databaseIdentity),snapshot,ledger:sources.files.map(f=>migrationIdentity(f.name)),guardState:expectedGuard(sources.guard.functionBodyMd5),config,observedAt:Date.now(),privateChangeRequests:0}};
}
test('94 candidate pins original93, exact additive bytes and unchanged defaults',()=>{
 assert.equal(sources.files.length,94);assert.equal(c.delta.added.length,20);assert.deepEqual(c.delta.changed,[]);assert.deepEqual(c.delta.removed,[]);
 assert.equal(c.additionalMigration.name,'20261020051222_atomic_customer_quote_changes.sql');
 assert.equal(c.readyForHosting,false);assert.equal(c.deployed,false);
});
test('source drift and unknown, missing or altered migrations cannot enter the candidate',()=>{
 for(const path of ['supabase/staging/appointment-candidate-93.json','supabase/staging/permission-profile.json','supabase/reconciliation/release-2026-10-17.json','supabase/verification/release_catalog.sql','supabase/migrations/'+sources.files[0].name,'supabase/migrations/'+c.additionalMigration.name]){
  assert.throws(()=>verifyQuoteChangeSources(p=>p===path?Buffer.concat([read(p),Buffer.from('\n')]):read(p),inventory));
 }
 assert.throws(()=>verifyQuoteChangeSources(read,inventory.slice(1)));assert.throws(()=>verifyQuoteChangeSources(read,[...inventory,'99999999999999_unreviewed.sql']));
});
test('live empty94 candidate verifies the same active guard without granting hosting readiness',()=>{
 const{evidence,activeProfile}=fixture(),r=verifyQuoteChangeTarget(evidence,profile,activeProfile);
 assert.equal(r.candidateMigrationCount,94);assert.equal(r.emptyStateAnd93CandidateVerified,false);assert.equal(r.emptyStateAndCandidateVerified,true);assert.equal(r.readyForHosting,false);assert.equal(r.remoteWrites,0);assert.equal(r.activated,true);
});
test('old93 or altered ledger and metadata cannot be mistaken for the new candidate',()=>{
 for(const mutate of [e=>e.ledger.pop(),e=>e.ledger[93].name='different',e=>e.snapshot.migrationCount=93,e=>e.snapshot.shapeSeal='bad',e=>e.snapshot.apiAclSeal='bad',e=>e.snapshot.ownedDefaultsSeal='bad',e=>e.snapshot.managedDefaultsSeal='bad',e=>e.snapshot.ownedDefaultApiGrants=1]){
  const{evidence,activeProfile}=fixture();mutate(evidence);assert.throws(()=>verifyQuoteChangeTarget(evidence,profile,activeProfile));
 }
 const{evidence}=fixture(),old=JSON.parse(read('supabase/staging/appointment-candidate-93.json'));assert.throws(()=>verifyCandidate(old,evidence.snapshot,evidence.ledger,sources.files));
});
test('active guard, physical database, project, effective permissions and freshness remain mandatory',()=>{
 for(const mutate of [e=>e.config.data.attributes.auth.hook_send_email_enabled=false,e=>e.guardState.effectivePrivileges.anon.execute=true,e=>e.config.data.attributes.auth.disable_signup=false,e=>e.config.data.attributes.api.db_schema='public,app_private',e=>e.identity.systemIdentifier='9999999999999999999',e=>e.projects[0].organization_id='other',e=>e.projects[0].id='production',e=>e.observedAt-=900001,e=>e.snapshot.superuser=true,e=>e.snapshot.managedAdminMember=true,e=>e.snapshot.unsafeSchemaCreate=true]){
  const{evidence,activeProfile}=fixture();mutate(evidence);assert.throws(()=>verifyQuoteChangeTarget(evidence,profile,activeProfile));
 }
});
test('any users, files, business/queue records, private retry receipts or active switches fail closed',()=>{
 const base=fixture().evidence.snapshot.state;
 for(const key of Object.keys(base)){
  const{evidence,activeProfile}=fixture();evidence.snapshot.state[key]=typeof base[key]==='boolean'?true:1;assert.throws(()=>verifyQuoteChangeTarget(evidence,profile,activeProfile));
 }
 const{evidence,activeProfile}=fixture();evidence.privateChangeRequests=1;assert.throws(()=>verifyQuoteChangeTarget(evidence,profile,activeProfile));delete evidence.privateChangeRequests;assert.throws(()=>verifyQuoteChangeTarget(evidence,profile,activeProfile));
});
test('read-only verifier rejects production and write flags before opening files or invoking CLI',()=>{
 for(const args of [['--project-ref','ddvlnixdugcbnrewktes','--auth-config-file','/does/not/exist'],['--project-ref',c.projectRef,'--auth-config-file','/does/not/exist','--apply']]){
  const r=spawnSync(process.execPath,[new URL('../scripts/release/verify-staging-quote-change-candidate.mjs',import.meta.url).pathname,...args],{encoding:'utf8',env:{PATH:'/usr/bin:/bin',STAGING_SUPABASE_BIN:'/does/not/exist'}});
  assert.equal(r.status,1);assert.doesNotMatch(r.stderr,/ENOENT|private evidence/);
 }
});
