import {test} from 'node:test';import assert from 'node:assert/strict';
import {captureManifestSql} from './capture-manifest.mjs';
const {PGlite}=await import(process.env.HOME_HOSTING_PGLITE_MODULE??'@electric-sql/pglite');
test('repeated manifests preserve row digests, ACL/RLS metadata and the namespace catalog',async()=>{
 const db=new PGlite();try{
  await db.exec('create schema auth;create schema storage;create schema app_private;create schema supabase_migrations;create table public.fixture(id int primary key,amount numeric);alter table public.fixture enable row level security;insert into public.fixture values(1,25.50);');
  const catalog=async()=>(await db.query('select oid,nspname from pg_namespace order by oid')).rows;
  const before=await catalog(),read=async()=>{const results=await db.exec(captureManifestSql);return results.at(-1).rows[0].jsonb_build_object;};
  const first=await read(),second=await read();assert.deepEqual(first,second);assert.deepEqual(await catalog(),before);assert.equal(first.tables[0].n,1);
  await db.exec('update public.fixture set amount=30.50 where id=1');const changed=await read();assert.notEqual(changed.tables[0].digest,first.tables[0].digest);assert.equal(changed.permissions,first.permissions);assert.equal(changed.policies,first.policies);assert.deepEqual(await catalog(),before);
 }finally{await db.close();}
});
