import {test,after} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {randomBytes,randomUUID,generateKeyPairSync} from 'node:crypto';
import {createNativeWalAuthority,validateNativeWalReceipt} from './native-wal-checkpoint.mjs';
import {canonicalFileIndex,nativeFileIndexSha256,nativeFileRecoveryIdentity} from './native-file-patch.mjs';
const {PGlite}=await import(process.env.HOME_HOSTING_PGLITE_MODULE??'@electric-sql/pglite');const db=new PGlite();after(()=>db.close());
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
create function auth.role() returns text language sql as $$select current_setting('request.jwt.claim.role',true)$$;
create schema storage;create table storage.buckets(id text primary key,public boolean,file_size_limit bigint);
create table storage.objects(id uuid,bucket_id text,name text,version text,metadata jsonb);`);
for(const file of ['cloud-ledger.sql','native-wal-ledger.sql','native-wal-verification-lease.sql','native-wal-inventory-prefix.sql','native-wal-file-patch.sql'])await db.exec(readFileSync(new URL('./'+file,import.meta.url),'utf8').replace(/do \$guard\$[\s\S]*?end \$guard\$;/,''));
await db.exec("set request.jwt.claim.role='service_role'");
const hex=c=>c.repeat(64),call=async p=>(await db.query('select public.ats_recovery_native_control($1::jsonb) r',[JSON.stringify(p)])).rows[0].r;
async function fixture(fileMode=false){
 const id=randomBytes(6).toString('hex'),namespace='ats-rehearsal-continuous-'+id,bucket='crm-native-lab-'+id;
 const binding={namespace,generation:3,sourceId:'ats_crm_candidate_20261027',sourceBoot:randomUUID(),databaseBoot:new Date(Date.now()-3600000).toISOString(),topology:hex('a'),sourceDbImage:'sha256:'+hex('b'),systemIdentifier:'7701364729366052896',timeline:1};
 if(fileMode)binding.privateFileFormat='patch-v1';
 await db.query('insert into storage.buckets values($1,false,33554432)',[bucket]);await call({action:'configure',namespace,bucket,binding});
 async function prepare(sequence=1,parentJobId=null,kind='base',changes={}){
  const now=Date.now(),requestId=randomUUID(),objects=[{name:'config',size:100,sha256:hex('c')},{name:'data/dd/'+hex('d'),size:200,sha256:hex('d')}];
  const ticket={namespace,binding,sequence,parentJobId,capturePath:`/home/noelsierra.guest/candidate/native-${id}/capture-${sequence}`,
   snapshotId:hex('e'),manifestSha256:hex('f'),captureStartedAt:new Date(now-20000).toISOString(),captureCompletedAt:new Date(now-10000).toISOString(),captureStartedBootMs:100000,...(fileMode?{fileIndexBytes:2}:{}),...changes};
  const p={action:'prepare',namespace,requestId,bodySha:hex('1'),kind,ticket,objects};const result=await call(p);
  for(const o of objects)await db.query('insert into storage.objects values($1,$2,$3,$4,$5::jsonb)',[randomUUID(),bucket,requestId+'/'+o.name,'v1',JSON.stringify({size:o.size})]);
  return {id:requestId,p,ticket,result};
 }
 async function finish(job,{lsn='0/E01BC10',previousTargetLsn,privatePairSha256=hex('2'),fileIndex=[],parentFileIndexSha256,staticPairSha256=hex('8'),proofChanges={}}={}){
  const state=(await db.query('select public.ats_recovery_native_verification($1,$2,true) r',[namespace,job.id])).rows[0].r;
  if(!state.attempted)await db.query('select public.ats_recovery_native_verification($1,$2,false)',[namespace,job.id]);
  const inventory=await call({action:'inventory',namespace,jobId:job.id});
  const proof={kind:'native-wal-component-v1',componentType:job.p.kind,binding,manifestSha256:job.ticket.manifestSha256,snapshotId:job.ticket.snapshotId,
   jobId:job.id,resticFullReadPassed:true,publicAccessDenied:true,writeAdmission:false,privatePairSha256,targetLsn:lsn,
   completeRecoveryPackage:job.p.kind==='base',...(previousTargetLsn?{previousTargetLsn}:{}),
   ...(fileMode?{fileIndex:canonicalFileIndex(fileIndex),fileIndexBytes:Buffer.byteLength(JSON.stringify(canonicalFileIndex(fileIndex))),fileIndexSha256:nativeFileIndexSha256(fileIndex),
     staticPairSha256,databaseRuntimeSha256:hex('9'),baseManifestSha256:hex('a'),privateFileStateVerified:true,
     privatePairSha256:nativeFileRecoveryIdentity(staticPairSha256,fileIndex),...(parentFileIndexSha256?{parentFileIndexSha256}:{})}:{}),...proofChanges};
  return call({action:'finish',namespace,jobId:job.id,bodySha:job.p.bodySha,inventory,proof,report:{syntheticOnly:true}});
 }
 const admit=job=>call({action:'admit',namespace,jobId:job.id,requestId:randomUUID(),bodySha:hex('3')});
 const enable=()=>call({action:'set_enabled',namespace,binding,enabled:true});
 return {namespace,bucket,binding,prepare,finish,admit,enable};
}
test('native backup tables and operations stay closed to CRM clients and service-role table access',async()=>{
 const f=await fixture();for(const role of ['anon','authenticated'])assert.equal((await db.query(`select has_function_privilege('${role}','public.ats_recovery_native_control(jsonb)','execute') ok`)).rows[0].ok,false);
 for(const table of ['native_sources','native_jobs','native_charges','native_admissions'])assert.equal((await db.query(`select has_table_privilege('service_role','ats_recovery_lab.${table}','select') ok`)).rows[0].ok,false);
 await db.exec("set request.jwt.claim.role='anon'");await assert.rejects(call({action:'status',namespace:f.namespace}),/service_role required/);await db.exec("set request.jwt.claim.role='service_role'");
});
test('inventory accepts only an exact UUID directory and bucket, independent of locale sorting',async()=>{
 const f=await fixture(),job=await f.prepare();
 for(const [bucket,name] of [[f.bucket,job.id+'0/config'],[f.bucket,'other/'+job.id+'/config'],['other',job.id+'/config']]){
  await db.query('insert into storage.objects values($1,$2,$3,$4,$5::jsonb)',[randomUUID(),bucket,name,'v1',JSON.stringify({size:100})]);
 }
 const inventory=await call({action:'inventory',namespace:f.namespace,jobId:job.id});
 assert.deepEqual(inventory.map(o=>o.name),['config','data/dd/'+hex('d')]);
});
test('an archive cannot open a disabled source; retry preserves one receipt and its original cutoff',async()=>{
 const f=await fixture(),job=await f.prepare();await f.finish(job);await assert.rejects(f.admit(job),/disabled/);await f.enable();
 const p={action:'admit',namespace:f.namespace,jobId:job.id,requestId:randomUUID(),bodySha:hex('3')};const first=await call(p),again=await call(p);
 assert.deepEqual(again.claims,first.claims);assert.deepEqual(again.chain,first.chain);assert.equal(again.replayed,true);
 assert.equal(Date.parse(first.claims.expiresAt),Date.parse(job.ticket.captureStartedAt)+280000);
 await assert.rejects(call({...p,bodySha:hex('4')}),/id reused/);await assert.rejects(f.admit(job),/stale parent/);
});
test('a continuous chain requires the current parent, native LSN progression and unchanged private-file pairing',async()=>{
 const f=await fixture(),base=await f.prepare();await f.finish(base);await f.enable();await f.admit(base);
 const delta=await f.prepare(2,base.id,'delta');await assert.rejects(f.finish(delta,{previousTargetLsn:'0/E01BC10',lsn:'0/E01BC10'}),/Broken/);
 await assert.rejects(f.finish(delta,{previousTargetLsn:'0/E01BC10',lsn:'0/F000100',privatePairSha256:hex('5')}),/Broken/);
 const done=await f.finish(delta,{previousTargetLsn:'0/E01BC10',lsn:'0/F000100'});assert.equal(done.proof.baseJobId,base.id);
 const admitted=await f.admit(delta);assert.equal(admitted.claims.sequence,2);assert.equal(admitted.chain.dependencies,2);assert.equal(admitted.claims.freshFullRemoteRead,false);
 await assert.rejects(f.prepare(3,base.id,'delta'),/Parent changed/);
});
test('replacement or loss of any retained component refuses a new lease atomically',async()=>{
 for(const fault of ['version','missing','public','proof']){
  const f=await fixture(),base=await f.prepare();await f.finish(base);await f.enable();await f.admit(base);
  const delta=await f.prepare(2,base.id,'delta');await f.finish(delta,{previousTargetLsn:'0/E01BC10',lsn:'0/F000100'});
  if(fault==='version')await db.query("update storage.objects set version='replaced' where bucket_id=$1 and name=$2",[f.bucket,base.id+'/config']);
  else if(fault==='missing')await db.query('delete from storage.objects where bucket_id=$1 and name=$2',[f.bucket,base.id+'/config']);
  else if(fault==='public')await db.query('update storage.buckets set public=true where id=$1',[f.bucket]);
  else await db.query("update ats_recovery_lab.native_jobs set proof=jsonb_set(proof,'{targetLsn}','\"0/E01BC20\"') where id=$1",[base.id]);
  await assert.rejects(f.admit(delta),/dependency|Private native/);assert.equal((await call({action:'status',namespace:f.namespace})).lastSequence,1);
 }
});
test('the SQL authority and signed writer receipt preserve the same boot, cutoff and idempotent result',async()=>{
 const f=await fixture(),job=await f.prepare();await f.finish(job);await f.enable();
 const keys=generateKeyPairSync('ed25519'),authority=createNativeWalAuthority({namespace:f.namespace,...keys,ledger:call});
 const request={requestId:randomUUID(),jobId:job.id,binding:f.binding};
 const first=await authority(request),retry=await authority(request);assert.deepEqual(first.envelope,retry.envelope);assert.equal(retry.replayed,true);
 const claims=validateNativeWalReceipt(first.envelope,keys.publicKey,f.binding);assert.equal(claims.jobId,job.id);assert.equal(claims.freshFullRemoteRead,true);
 await assert.rejects(authority({...request,binding:{...f.binding,sourceBoot:randomUUID()}}),/id reused/);
});
test('missing timestamps, broadened binding, duplicate objects and stale upload leases never produce new grants',async()=>{
 const f=await fixture();for(const changes of [{captureStartedAt:null},{captureCompletedAt:null},{captureStartedBootMs:null},{binding:{...f.binding,sourceBoot:randomUUID()}},{captureStartedAt:new Date(Date.now()-400000).toISOString()}])await assert.rejects(f.prepare(1,null,'base',changes));
 const job=await f.prepare();assert.equal((await call(job.p)).completed,false);
 await assert.rejects(call({...job.p,ticket:{...job.ticket,snapshotId:hex('9')}}),/id reused/);
 await db.query("update ats_recovery_lab.native_jobs set lease_until=clock_timestamp()-interval '1 second' where id=$1",[job.id]);
 await assert.rejects(call(job.p),/lease expired/);
});
test('old lab traffic remains charged against the account-wide budget; denied preparation changes no source sequence',async()=>{
 const f=await fixture(),legacy='ats-rehearsal-continuous-'+randomBytes(6).toString('hex');
 await db.query("insert into ats_recovery_lab.namespaces(namespace,bucket) values($1,$2)",[legacy,'crm-cloud-lab-'+legacy.slice(-12)]);
 await db.query("insert into ats_recovery_lab.budgets values($1,'d:'||to_char(clock_timestamp(),'YYYY-MM-DD'),536870912)",[legacy]);
 try{await assert.rejects(f.prepare(),/budget exhausted/);assert.equal((await call({action:'status',namespace:f.namespace})).lastSequence,0);}
 finally{await db.query('delete from ats_recovery_lab.budgets where namespace=$1',[legacy]);}
});
test('one verifier attempt is shared across instances; completed and read-only retries do not spend another download',async()=>{
 const f=await fixture(),job=await f.prepare();
 assert.equal(job.result.reservedBytes,300+32768+2*512);
 const read=async readOnly=>(await db.query('select public.ats_recovery_native_verification($1,$2,$3) r',[f.namespace,job.id,readOnly])).rows[0].r;
 assert.equal((await read(true)).attempted,false);
 const race=await Promise.allSettled([read(false),read(false)]);assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(race.filter(r=>r.status==='rejected').length,1);assert.equal((await read(true)).attempted,true);
 await f.finish(job);const retried=await read(false);assert.equal(retried.completed,true);assert.equal(retried.proof.jobId,job.id);
 assert.equal((await db.query('select count(*)::int n from ats_recovery_lab.native_charges where job_id=$1',[job.id])).rows[0].n,1);
 for(const role of ['anon','authenticated'])assert.equal((await db.query(`select has_function_privilege('${role}','public.ats_recovery_native_verification(text,uuid,boolean)','execute') ok`)).rows[0].ok,false);
});
test('file-aware admission binds independently checked changed bytes and preserves the native base',async()=>{
 const f=await fixture(true),base=await f.prepare();assert.equal(base.result.reservedBytes,300+32768+1024+8);
 const first=await f.finish(base);await f.enable();const admittedBase=await f.admit(base);assert.equal(admittedBase.claims.privateFileStateVerified,true);
 const file={path:'tenant/bucket/new/version',size:34,sha256:hex('c'),eTag:'"'+'d'.repeat(32)+'"',xattrs:{}};
 const bytes=Buffer.byteLength(JSON.stringify(canonicalFileIndex([file]))),delta=await f.prepare(2,base.id,'delta',{fileIndexBytes:bytes});
 const opts={previousTargetLsn:'0/E01BC10',lsn:'0/F000100',fileIndex:[file],parentFileIndexSha256:first.proof.fileIndexSha256};
 for(const proofChanges of [{privateFileStateVerified:false},{fileIndexBytes:bytes-1},{staticPairSha256:hex('7')},{parentFileIndexSha256:hex('6')}])await assert.rejects(f.finish(delta,{...opts,proofChanges}),/private file|Broken recovery/);
 assert.equal((await call({action:'status',namespace:f.namespace})).lastSequence,1);
 const done=await f.finish(delta,opts);assert.equal(done.proof.baseJobId,base.id);assert.notEqual(done.proof.privatePairSha256,first.proof.privatePairSha256);
 const keys=generateKeyPairSync('ed25519'),authority=createNativeWalAuthority({namespace:f.namespace,...keys,ledger:call});
 const receipt=await authority({requestId:randomUUID(),jobId:delta.id,binding:f.binding});
 assert.equal(validateNativeWalReceipt(receipt.envelope,keys.publicKey,f.binding).fileIndexSha256,nativeFileIndexSha256([file]));
 assert.equal(receipt.chainCertificate.payload!==undefined,true);
});
test('file-index metadata must be reserved before upload preparation; legacy reservations remain unchanged',async()=>{
 const f=await fixture(true);
 for(const fileIndexBytes of [null,0,1,65537,'invalid'])await assert.rejects(f.prepare(1,null,'base',{fileIndexBytes}),/file index reservation/);
 assert.equal((await call({action:'status',namespace:f.namespace})).lastSequence,0);
});
