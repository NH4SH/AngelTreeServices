import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID,randomBytes,generateKeyPairSync} from 'node:crypto';
import {signProof} from './failover-proof.mjs';
import {inventoryIdentity} from './cloud-policy.mjs';
import {createCheckpointAuthority,validateCertifiedCheckpoint} from './certified-checkpoint.mjs';
const {PGlite}=await import(process.env.HOME_HOSTING_PGLITE_MODULE??'@electric-sql/pglite'),db=new PGlite();after(()=>db.close());
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create function auth.role() returns text language sql as $$select current_setting('request.jwt.claim.role',true)$$;
create schema storage;create table storage.buckets(id text primary key,public boolean,file_size_limit bigint);create table storage.objects(id uuid,bucket_id text,name text,version text,metadata jsonb);`);
for(const file of ['cloud-ledger.sql','incremental-ledger.sql','certified-checkpoint-ledger.sql'])await db.exec(readFileSync(new URL('./'+file,import.meta.url),'utf8').replace(/do \$guard\$[\s\S]*?end \$guard\$;/,''));
await db.exec("set request.jwt.claim.role='service_role'");
async function fixture(){
 const id=randomBytes(6).toString('hex'),namespace='ats-rehearsal-continuous-'+id,bucket='crm-cloud-lab-'+id;
 await db.query('select public.ats_recovery_lab_control($1::jsonb)',[JSON.stringify({action:'configure',namespace,bucket})]);
 await db.query('insert into storage.buckets values($1,false,33554432)',[bucket]);
 const now=Date.now(),iso=n=>new Date(n).toISOString(),hex=x=>x.repeat(64),keys=generateKeyPairSync('ed25519');
 const ticket={namespace,sourceId:'ats_crm_candidate_20261027',generation:3,sequence:4,sourceBoot:'source-boot',databaseBoot:'db-boot',topology:hex('a'),snapshotId:hex('b'),manifestSha256:hex('c'),captureStartedAt:iso(now-30000),captureStartedBootMs:100000,captureCompletedAt:iso(now-20000),backupExitCode:0,capturePath:`/home/noelsierra.guest/candidate/continuous-${id}/capture-4`};
 const objects=[{name:'config',id:randomUUID(),version:'v1',size:100,sha256:hex('d'),etag:'"strong"'},{name:'data/aa/'+hex('a'),id:randomUUID(),version:'v1',size:200,sha256:hex('a'),etag:'"strong2"'}];
 for(const o of objects)await db.query('insert into storage.objects values($1,$2,$3,$4,$5::jsonb)',[o.id,bucket,o.name,o.version,JSON.stringify({size:o.size})]);
 const artifacts=Object.fromEntries(['manifest.private.json','database.dump','objects.tar','release-source.tar.gz','core.private.env','app.private.env'].map(name=>[name,{size:100,fingerprint:hex('e'),sha256:name==='manifest.private.json'?hex('c'):hex('f')}]));
 const bound=Object.fromEntries(['namespace','sourceId','generation','sequence','sourceBoot','databaseBoot','topology','snapshotId','captureStartedAt','captureStartedBootMs','captureCompletedAt'].map(k=>[k,ticket[k]]));
 const catalog={version:1,kind:'restic-verified-catalog',writeAdmission:false,...bound,objects,artifacts,objectInventorySha256:hex('1'),runtimeManifestSha256:hex('2'),fullVerifiedAt:iso(now-100000),issuedAt:iso(now-1000),expiresAt:iso(now-100000+86400000)};
 const archive={version:1,kind:'archive-verification',writeAdmission:false,...bound,manifestSha256:ticket.manifestSha256,issuedAt:catalog.issuedAt,expiresAt:iso(now+59000),verificationMode:'incremental-verified-baseline',remoteBytesReadBack:false,inventorySha256:inventoryIdentity(objects.map(({name,id,version,size})=>({name,id,version,size}))),runtimeManifestSha256:hex('2')};
 const certificate=signProof(catalog,keys.privateKey),archiveJob=randomUUID();
 const report={resticStructuralCheckPassed:true,receiptPermitsWrites:false,fullDataRead:false,newPacksFullyVerified:1,newObjects:1,retainedObjectsPhysicallyObserved:1,databaseVerification:'whole-file-sha256',catalogCertificate:certificate};
 await db.query("insert into ats_recovery_lab.jobs(namespace,request_id,body_sha,lease_until,reserved_bytes,claims,report) values($1,$2,$3,clock_timestamp()-interval '1 second',4096,$4,$5)",[namespace,archiveJob,hex('f'),JSON.stringify(archive),JSON.stringify(report)]);
 const request={requestId:randomUUID(),ticket,archiveEnvelope:signProof(archive,keys.privateKey),catalogCertificate:certificate};
 const ledger=async p=>(await db.query('select public.ats_recovery_certify_checkpoint($1::jsonb) r',[JSON.stringify(p)])).rows[0].r;
 const authority=createCheckpointAuthority({namespace,privateKey:keys.privateKey,ledger});
 return {namespace,bucket,ticket,request,archiveJob,authority,...keys};
}
test('client roles cannot certify, inspect admissions or bypass role checks',async()=>{
 const f=await fixture();for(const role of ['anon','authenticated'])assert.equal((await db.query(`select has_function_privilege('${role}','public.ats_recovery_certify_checkpoint(jsonb)','execute') ok`)).rows[0].ok,false);
 assert.equal((await db.query("select has_table_privilege('service_role','ats_recovery_lab.certified_admissions','select') ok")).rows[0].ok,false);
 await db.exec("set request.jwt.claim.role='anon'");await assert.rejects(f.authority(f.request),/service_role required/);await db.exec("set request.jwt.claim.role='service_role'");
});
test('one completed snapshot receives one admission; exact retry preserves the original deadline',async()=>{
 const f=await fixture();const results=await Promise.allSettled([f.authority(f.request),f.authority({...f.request,requestId:randomUUID()})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
 const first=results[0].value;assert.ok(first);const replay=await f.authority(f.request);assert.equal(replay.replayed,true);assert.deepEqual(replay.envelope,first.envelope);
 const c=validateCertifiedCheckpoint(replay.envelope,f.publicKey,f.ticket);assert.equal(c.expiresAt,new Date(Date.parse(f.ticket.captureStartedAt)+280000).toISOString());
 await assert.rejects(f.authority({...f.request,unrelated:true}),/body mismatch/);
});
test('missing or incomplete independent job and changed provider identity withhold certification',async()=>{
 for(const fault of ['missing','incomplete','version','public','observation']){
  const f=await fixture();
  if(fault==='missing')await db.query('delete from ats_recovery_lab.jobs where namespace=$1',[f.namespace]);
  if(fault==='incomplete')await db.query("update ats_recovery_lab.jobs set report=report-'databaseVerification' where namespace=$1",[f.namespace]);
  if(fault==='version')await db.query("update storage.objects set version='v2' where bucket_id=$1 and name='config'",[f.bucket]);
  if(fault==='public')await db.query('update storage.buckets set public=true where id=$1',[f.bucket]);
  if(fault==='observation')await db.query("update ats_recovery_lab.jobs set report=jsonb_set(report,'{retainedObjectsPhysicallyObserved}','0') where namespace=$1",[f.namespace]);
  await assert.rejects(f.authority(f.request));assert.equal((await db.query('select last_sequence from ats_recovery_lab.namespaces where namespace=$1',[f.namespace])).rows[0].last_sequence,0);
 }
});
test('budget exhaustion prevents admission atomically without bypassing the existing test limits',async()=>{
 const f=await fixture();await db.query('update ats_recovery_lab.namespaces set monthly_limit=262144 where namespace=$1',[f.namespace]);
 await db.query("insert into ats_recovery_lab.budgets values($1,'m:'||to_char(clock_timestamp() at time zone 'UTC','YYYY-MM'),262144)",[f.namespace]);
 await assert.rejects(f.authority(f.request),/budget exhausted/);
 assert.equal((await db.query('select count(*)::int n from ats_recovery_lab.certified_admissions where namespace=$1',[f.namespace])).rows[0].n,0);
});
