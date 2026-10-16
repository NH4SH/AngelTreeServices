import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
import {load} from './pr10-test-helpers.mjs';
import {normalizeAdminSearchTerm,escapeSearchLike} from '../src/lib/record-search.ts';

const enabled=process.env.PR18_DISPOSABLE_STACK==='1'&&Boolean(process.env.PR18_LOCAL_STATUS_FILE);
test('PR18 measured search retains semantics, permissions and stable pages',{skip:!enabled},async t=>{
 const c=JSON.parse(readFileSync(process.env.PR18_LOCAL_STATUS_FILE,'utf8'));assert.equal(c.API_URL,'http://127.0.0.1:54321');
 const opts={auth:{persistSession:false,autoRefreshToken:false}};const db=createClient(c.API_URL,c.SERVICE_ROLE_KEY,opts);
 const marker='pr18-'+randomUUID().slice(0,8),actors=[],results=[],orgs=[];
 const check=r=>{assert.ifError(r.error&&Error(r.error.message));return r.data;};
 const sql=source=>new Promise((resolve,reject)=>{const p=spawn(process.env.PR18_DOCKER_BIN,['exec','-i','supabase_db_ats_pr02_disposable','psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{env:process.env});let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('error',reject);p.on('exit',code=>code?reject(Error(err)):resolve(out.trim()));p.stdin.end(source);});
 const run=(name,fn)=>t.test(name,async()=>{await fn();results.push({name,pass:true});});
 async function actor(role){const password=randomUUID()+randomUUID();const u=check(await db.auth.admin.createUser({email:`${marker}-${role}@example.invalid`,password,email_confirm:true})).user;actors.push(u.id);check(await db.from('profiles').update({status:'active'}).eq('id',u.id));check(await db.from('employee_records').insert({auth_user_id:u.id,legal_name:`${marker} ${role}`,is_active:true,employment_status:'active'}));const r=check(await db.from('roles').select('id').eq('name',role).single());check(await db.from('user_roles').insert({user_id:u.id,role_id:r.id}));const client=createClient(c.API_URL,c.ANON_KEY,opts);check(await client.auth.signInWithPassword({email:u.email,password}));return{client,id:u.id};}
 const owner=await actor('owner'),crew=await actor('crew');let selected=owner.client;
 const adapter=load('../src/lib/data/admin-search.ts',{'server-only':{},'@/lib/record-search':{normalizeAdminSearchTerm,escapeSearchLike},'@/lib/supabase/server':{createClient:async()=>selected},'@/lib/security/errors':{safeStaffMessage:()=> 'Search unavailable'}});
 const created='2026-01-01T00:00:00.000Z';
 for(let i=0;i<12;i++){const o=check(await db.from('organizations').insert({name:`${marker} Organization ${i}`,organization_type:'property_manager',billing_phone:'+15405550123',billing_email:`${marker}-${i}@example.invalid`,created_at:created}).select('id').single());orgs.push(o.id);check(await db.from('service_locations').insert({organization_id:o.id,label:marker,street:`${i} ${marker} Cedar Lane`,city:'Fredericksburg',state:'VA',postal_code:'22401'}));}
 t.after(async()=>{if(orgs.length)check(await db.from('organizations').update({archived_at:new Date().toISOString()}).in('id',orgs));check(await db.from('profiles').update({status:'disabled'}).in('id',actors));check(await db.from('employee_records').update({is_active:false,employment_status:'separated'}).in('auth_user_id',actors));if(process.env.PR18_RESULTS_FILE)writeFileSync(process.env.PR18_RESULTS_FILE,JSON.stringify({marker,results},null,2));});
 await run('measured FK index exists and original invoker view stays unchanged',async()=>{assert.match(await sql("select indexdef from pg_indexes where schemaname='public' and indexname='service_locations_organization_id_idx'"),/\(organization_id\)/);assert.match(await sql("select reloptions::text from pg_class where oid='public.admin_record_search'::regclass"),/security_invoker=true/);});
 await run('equal-date result pages have no repeats or gaps and preserve exact count',async()=>{const all=[];for(let page=1;page<=3;page++){const r=await adapter.getAdminSearchPage({recordType:'organization',query:marker,page,pageSize:5});assert.equal(r.error,null);assert.equal(r.count,12);all.push(...r.ids);}assert.deepEqual(all,[...orgs].sort());assert.equal(new Set(all).size,12);});
 await run('organization address, name, email and normalized phone searches retain results',async()=>{for(const query of [marker,`${marker} cedar lane`,`${marker}-0@example.invalid`]){const r=await adapter.getAdminSearchPage({recordType:'organization',query,pageSize:100});assert.equal(r.error,null);assert.ok(r.count>0);}const r=await adapter.getAdminSearchPage({recordType:'organization',query:'(540) 555-0123',pageSize:500});assert.ok(orgs.every(id=>r.ids.includes(id)));});
 await run('archive state and count-only reads retain their meaning',async()=>{check(await db.from('organizations').update({archived_at:new Date().toISOString()}).eq('id',orgs[0]));const active=await adapter.countAdminSearchRecords({recordType:'organization',query:marker}),archived=await adapter.getAdminSearchPage({recordType:'organization',query:marker,archived:true});assert.equal(active.count,11);assert.deepEqual(archived.ids,[orgs[0]]);});
 await run('literal percent/underscore are escaped and cannot expand to all records',async()=>{const r=await adapter.getAdminSearchPage({recordType:'organization',query:`${marker}%_`});assert.equal(r.count,0);});
 await run('crew and disabled issued tokens cannot discover staff-only organizations',async()=>{selected=crew.client;const r=await adapter.getAdminSearchPage({recordType:'organization',query:marker});assert.equal(r.count,0);selected=owner.client;check(await db.from('profiles').update({status:'disabled'}).eq('id',owner.id));const offboarded=await adapter.getAdminSearchPage({recordType:'organization',query:marker});assert.equal(offboarded.count,0);});
});
