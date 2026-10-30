import {test,after} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {randomBytes,randomUUID} from 'node:crypto';
import {retireNativeComponent} from './native-chain-retirement.mjs';
const {PGlite}=await import(process.env.HOME_HOSTING_PGLITE_MODULE??'@electric-sql/pglite');const db=new PGlite();after(()=>db.close());
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create function auth.role() returns text language sql as $$select current_setting('request.jwt.claim.role',true)$$;create schema storage;create table storage.buckets(id text primary key,public boolean,file_size_limit bigint);create table storage.objects(id uuid,bucket_id text,name text,version text,metadata jsonb);`);
for(const n of ['cloud-ledger.sql','native-wal-ledger.sql','native-wal-verification-lease.sql','native-wal-inventory-prefix.sql','native-wal-file-patch.sql','native-chain-retention.sql'])await db.exec(fs.readFileSync(new URL('./'+n,import.meta.url),'utf8').replace(/do \$guard\$[\s\S]*?end \$guard\$;/,''));
await db.exec("set request.jwt.claim.role='service_role'");
const hash='a'.repeat(64),call=async p=>(await db.query('select public.ats_recovery_native_retention($1::jsonb) r',[JSON.stringify(p)])).rows[0].r;
async function fixture(){
 const suffix=randomBytes(6).toString('hex'),namespace='ats-rehearsal-continuous-'+suffix,bucket='crm-native-lab-'+suffix,ids=Array.from({length:5},()=>randomUUID());
 await db.query('insert into storage.buckets values($1,false,33554432)',[bucket]);
 await db.query('insert into ats_recovery_lab.native_sources(namespace,bucket,binding,last_sequence,last_job) values($1,$2,$3,5,$4)',[namespace,bucket,JSON.stringify({sourceId:'ats_crm_candidate_20261027'}),ids[4]]);
 for(let i=0;i<5;i++){
  const age=[10,9,6,2,.1][i],at=new Date(Date.now()-age*86400000).toISOString();
  await db.query("insert into ats_recovery_lab.native_jobs(id,namespace,body_sha,kind,sequence,parent_job,ticket,expected_objects,created_at,lease_until,verified_at,component_sha,verification_started_at) values($1,$2,$3,$4,$5,$6,'{}','[]',$7,$7,$7,$3,$7)",[ids[i],namespace,hash,i===1||i===3?'delta':'base',i+1,i?ids[i-1]:null,at]);
  for(const name of ['config','index/'+hash])await db.query('insert into storage.objects values($1,$2,$3,$4,$5)',[randomUUID(),bucket,ids[i]+'/'+name,'v1',JSON.stringify({size:100})]);
  await db.query('update ats_recovery_lab.native_jobs set inventory=ats_recovery_lab.native_inventory($1,id) where id=$2',[bucket,ids[i]]);
 }
 const snapshot=()=>call({action:'snapshot',namespace});const prepare=async(jobId,s)=>call({action:'prepare',namespace,jobId,snapshot:s??await snapshot()});
 const storage={async remove({bucket:requested,prefix,objects}){assert.equal(requested,bucket);for(const o of objects)await db.query('delete from storage.objects where bucket_id=$1 and name=$2 and id=$3 and version=$4',[bucket,prefix+o.name,o.id,o.version]);}};
 return {namespace,bucket,ids,snapshot,prepare,storage};
}
test('SQL independently protects the head, ancestors, daily points, pins and fresh evidence',async()=>{
 const f=await fixture();for(const i of [2,3,4])await assert.rejects(f.prepare(f.ids[i]),/Protected/);
 await call({action:'pin',namespace:f.namespace,jobId:f.ids[1],snapshot:await f.snapshot(),reason:'manual recovery point'});
 for(const i of [0,1])await assert.rejects(f.prepare(f.ids[i]),/Protected/);
});
test('changed head observations and changed physical provider versions fail closed',async()=>{
 const f=await fixture(),old=await f.snapshot();await db.query('update ats_recovery_lab.native_sources set last_job=$1 where namespace=$2',[f.ids[3],f.namespace]);await assert.rejects(f.prepare(f.ids[0],old),/observation changed/);
 await db.query("update storage.objects set version='v2' where bucket_id=$1 and name=$2",[f.bucket,f.ids[0]+'/config']);await assert.rejects(f.prepare(f.ids[0]),/Provider versions changed/);
});
test('retirement keeps history and charges, resumes partial deletes and confirms empty provider inventory',async()=>{
 const f=await fixture(),grant=await f.prepare(f.ids[0]);assert.equal(grant.retired,true);
 await f.storage.remove({bucket:f.bucket,prefix:grant.prefix,objects:grant.remaining.filter(o=>o.name==='config')});
 await assert.rejects(call({action:'finish',namespace:f.namespace,jobId:f.ids[0],snapshot:await f.snapshot()}),/incomplete/);
 const result=await retireNativeComponent({namespace:f.namespace,jobId:f.ids[0],ledger:call,storage:f.storage});assert.equal(result.deletedObjects,1);
 const again=await retireNativeComponent({namespace:f.namespace,jobId:f.ids[0],ledger:call,storage:f.storage});assert.equal(again.deletedObjects,0);
 assert.equal((await db.query('select count(*)::int n from ats_recovery_lab.native_jobs where namespace=$1',[f.namespace])).rows[0].n,5);
 await assert.rejects(call({action:'pin',namespace:f.namespace,jobId:f.ids[0],snapshot:await f.snapshot(),reason:'too late'}),/Retired/);
});
test('an ambiguous transport failure never marks retirement complete and can be retried safely',async()=>{
 const f=await fixture();await assert.rejects(retireNativeComponent({namespace:f.namespace,jobId:f.ids[0],ledger:call,storage:{remove:async()=>{throw Error('ambiguous');}}}),/ambiguous/);
 assert.equal((await db.query('select completed_at from ats_recovery_lab.native_retirements where job_id=$1',[f.ids[0]])).rows[0].completed_at,null);
 assert.equal((await retireNativeComponent({namespace:f.namespace,jobId:f.ids[0],ledger:call,storage:f.storage})).deletedObjects,2);
});
test('ordinary CRM clients and direct service-role table access stay denied',async()=>{
 const f=await fixture();for(const role of ['anon','authenticated'])assert.equal((await db.query(`select has_function_privilege('${role}','public.ats_recovery_native_retention(jsonb)','execute') ok`)).rows[0].ok,false);
 for(const table of ['native_retirements','native_pins'])assert.equal((await db.query(`select has_table_privilege('service_role','ats_recovery_lab.${table}','select') ok`)).rows[0].ok,false);
 await db.exec("set request.jwt.claim.role='authenticated'");await assert.rejects(f.snapshot(),/service_role required/);await db.exec("set request.jwt.claim.role='service_role'");
});
test('a new recovery pin cannot revive a descendant whose base is already retired',async()=>{
 const f=await fixture();await f.prepare(f.ids[0]);
 await assert.rejects(call({action:'pin',namespace:f.namespace,jobId:f.ids[1],snapshot:await f.snapshot(),reason:'late pin'}),/dependency is retired/);
});
