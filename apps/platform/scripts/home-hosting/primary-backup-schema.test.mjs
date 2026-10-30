import {test,after} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {primaryBackupSchema} from './primary-backup-schema.mjs';
const {PGlite}=await import(process.env.HOME_HOSTING_PGLITE_MODULE??'@electric-sql/pglite');const db=new PGlite();after(()=>db.close());
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create function auth.role() returns text language sql as $$select current_setting('request.jwt.claim.role',true)$$;create schema storage;create table storage.buckets(id text primary key,public boolean,file_size_limit bigint);create table storage.objects(id uuid,bucket_id text,name text,version text,metadata jsonb);`);
const compiled=primaryBackupSchema();await db.exec(compiled.sql);await db.exec("set request.jwt.claim.role='service_role'");
const call=async p=>(await db.query('select public.ats_home_native_control($1::jsonb) r',[JSON.stringify(p)])).rows[0].r;
function configuration(suffix,generation=1){const namespace='ats-home-continuous-'+suffix;return {action:'configure',namespace,bucket:'crm-native-home-'+suffix,binding:{namespace,generation,environment:'home-primary-v1',sourceId:'ats_crm_primary_20261029',sourceMigrationCount:102,captureMode:'transaction-barrier',privateFileFormat:'patch-v1',admissionProtocol:'certified-native-wal-v1',sourceBoot:randomUUID(),databaseBoot:new Date().toISOString(),topology:'a'.repeat(32),sourceDbImage:'sha256:'+'b'.repeat(64),systemIdentifier:'7701364729366052896',timeline:1}};}
test('compiled native authority has a separate identity and remains closed by default',async()=>{
 assert.equal(compiled.installationPerformed,false);assert.equal(compiled.inputs.length,5);const c=configuration('abcdef123456');await call(c);assert.equal((await call({action:'status',namespace:c.namespace})).enabled,false);
 for(const role of ['anon','authenticated'])assert.equal((await db.query(`select has_function_privilege('${role}','public.ats_home_native_control(jsonb)','execute') ok`)).rows[0].ok,false);
 await assert.rejects(call({...c,namespace:'ats-rehearsal-continuous-abcdef123456'}),/Invalid native namespace/);
 for(const change of [{environment:undefined},{sourceId:'ats_crm_candidate_20261027'},{sourceMigrationCount:129}])await assert.rejects(call({...c,binding:{...c.binding,...change}}));
});
test('only one source may be enabled and a successor waits for all older permits',async()=>{
 const a=configuration('111111111111'),b=configuration('222222222222',2);await call(a);await call(b);
 await call({action:'set_enabled',namespace:a.namespace,binding:a.binding,enabled:true});
 await assert.rejects(call({action:'set_enabled',namespace:b.namespace,binding:b.binding,enabled:true}),/duplicate key/);
 await call({action:'set_enabled',namespace:a.namespace,binding:a.binding,enabled:false});
 // Historical permits remain binding after disabling their source.
 const jobId=randomUUID();await db.query("insert into ats_home_backup.native_jobs(id,namespace,body_sha,kind,sequence,ticket,expected_objects,lease_until) values($1,$2,$3,'base',1,'{}','[]',clock_timestamp())",[jobId,a.namespace,'a'.repeat(64)]);
 await db.query("insert into ats_home_backup.native_admissions(namespace,sequence,request_id,body_sha,job_id,claims,chain) values($1,1,$2,$3,$4,$5,'{}')",[a.namespace,randomUUID(),'a'.repeat(64),jobId,JSON.stringify({generation:1,expiresAt:new Date(Date.now()+60000).toISOString()})]);
 await assert.rejects(call({action:'set_enabled',namespace:b.namespace,binding:b.binding,enabled:true}),/deadline/);
 await db.query("update ats_home_backup.native_admissions set claims=jsonb_set(claims,'{expiresAt}',to_jsonb((clock_timestamp()-interval '30 seconds')::text)) where namespace=$1",[a.namespace]);
 await call({action:'set_enabled',namespace:b.namespace,binding:b.binding,enabled:true});assert.equal((await call({action:'status',namespace:b.namespace})).enabled,true);
});
test('production retirement shares one catalog, records traffic, and skips previously completed components',async()=>{
 const{retireNativeBatch}=await import('./native-chain-retirement.mjs');const c=configuration('333333333333',3);await call(c);await db.query('insert into storage.buckets values($1,false,33554432)',[c.bucket]);const ids=Array.from({length:4},()=>randomUUID());
 for(let i=0;i<4;i++){
  const at=new Date(Date.now()-[10,9,8,.1][i]*86400000).toISOString();await db.query("insert into ats_home_backup.native_jobs(id,namespace,body_sha,kind,sequence,parent_job,ticket,expected_objects,created_at,lease_until,verified_at,component_sha,verification_started_at) values($1,$2,$3,$4,$5,$6,'{}','[]',$7,$7,$7,$3,$7)",[ids[i],c.namespace,'a'.repeat(64),i===1?'delta':'base',i+1,i?ids[i-1]:null,at]);
  for(const name of ['config','index/'+'a'.repeat(64)])await db.query('insert into storage.objects values($1,$2,$3,$4,$5)',[randomUUID(),c.bucket,ids[i]+'/'+name,'v1',JSON.stringify({size:100})]);
  await db.query('update ats_home_backup.native_jobs set inventory=ats_home_backup.native_inventory($1,id) where id=$2',[c.bucket,ids[i]]);
 }
 await db.query('update ats_home_backup.native_sources set last_job=$1,last_sequence=4 where namespace=$2',[ids[3],c.namespace]);
 let snapshots=0;const ledger=async p=>{if(p.action==='snapshot')snapshots++;return(await db.query('select public.ats_home_native_retention($1::jsonb) r',[JSON.stringify(p)])).rows[0].r;};
 const storage={async remove({bucket,prefix,objects}){assert.equal(bucket,c.bucket);for(const o of objects)await db.query('delete from storage.objects where bucket_id=$1 and name=$2 and id=$3 and version=$4',[bucket,prefix+o.name,o.id,o.version]);}};
 const result=await retireNativeBatch({namespace:c.namespace,expectedBinding:c.binding,ledger,storage});assert.equal(result.retiredJobs.length,2);assert.equal(result.deletedObjects,4);assert.equal(snapshots,1);assert.ok((await db.query('select max(octet_length(observed_snapshot::text))::int n from ats_home_backup.native_retirements')).rows[0].n<512);
 assert.equal((await db.query('select count(*)::int n from ats_home_backup.native_charges')).rows[0].n,5);
 const retry=await retireNativeBatch({namespace:c.namespace,expectedBinding:c.binding,ledger,storage});assert.equal(retry.retiredJobs.length,0);assert.equal(retry.deletedObjects,0);assert.equal(snapshots,2);
 const before=(await db.query('select count(*)::int n from ats_home_backup.native_charges')).rows[0].n;
 await db.query("insert into ats_home_backup.budgets values('commissioning-evidence','m:'||to_char(clock_timestamp(),'YYYY-MM'),3758096384)");
 await assert.rejects(ledger({action:'snapshot',namespace:c.namespace}),/budget exhausted/);
 assert.equal((await db.query('select count(*)::int n from ats_home_backup.native_charges')).rows[0].n,before);
});
