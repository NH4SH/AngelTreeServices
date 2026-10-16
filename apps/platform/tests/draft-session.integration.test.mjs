import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,writeFileSync}from'node:fs';
import {randomBytes}from'node:crypto';
import {createClient}from'@supabase/supabase-js';
import {createServerClient}from'@supabase/ssr';
import {load}from'./pr10-test-helpers.mjs';
import * as parties from '../src/lib/contracting-parties.ts';
import * as businessTime from '../src/lib/business-time.ts';
import * as editResult from '../src/lib/quotes/edit-result.ts';
import * as returnContext from '../src/lib/drafts/return-context.ts';
const enabled=process.env.PR12_DISPOSABLE_STACK==='1'&&!!process.env.PR12_LOCAL_STATUS_FILE;
test('PR12 recovery identity uses a verified, live, private local session',{skip:!enabled,timeout:30000},async t=>{
 const c=JSON.parse(readFileSync(process.env.PR12_LOCAL_STATUS_FILE,'utf8'));
 assert.equal(c.API_URL,'http://127.0.0.1:54321');assert.equal(process.env.PR12_WEB_URL,'http://127.0.0.1:3102');
 const service=createClient(c.API_URL,c.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}}),check=r=>{assert.ifError(r.error);return r.data;};
 const marker=randomBytes(6).toString('hex'),password=randomBytes(24).toString('base64url');
 const user=check(await service.auth.admin.createUser({email:`pr12-session-${marker}@example.invalid`,password,email_confirm:true})).user;
 t.after(async()=>{check(await service.from('profiles').update({status:'disabled'}).eq('id',user.id));check(await service.from('employee_records').update({employment_status:'separated',is_active:false}).eq('auth_user_id',user.id));});
 check(await service.from('profiles').update({status:'active'}).eq('id',user.id));
 check(await service.from('employee_records').insert({auth_user_id:user.id,legal_name:`PR12 session test ${marker}`,employment_status:'active',is_active:true}));
 const role=check(await service.from('roles').select('id').eq('name','owner').single());check(await service.from('user_roles').insert({user_id:user.id,role_id:role.id}));
 const jar=new Map();
 const client=createServerClient(c.API_URL,c.ANON_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>{for(const value of values)jar.set(value.name,value.value);}}});
 check(await client.auth.signInWithPassword({email:user.email,password}));
 const url=process.env.PR12_WEB_URL+'/api/internal/draft-session';
 const get=(auth=true)=>fetch(url,{headers:auth?{cookie:[...jar].map(([name,value])=>`${name}=${value}`).join('; ')}:{}});
 const results=[];const run=(name,fn)=>t.test(name,async()=>{await fn();results.push({name,pass:true});});
 await run('anonymous requests receive no identity and cannot cache the result',async()=>{const r=await get(false);assert.equal(r.status,401);assert.deepEqual(await r.json(),{userId:null});assert.match(r.headers.get('cache-control'),/private.*no-store/);assert.match(r.headers.get('vary'),/Cookie/);});
 await run('authenticated response contains only the current user ID, with no credentials or profile data',async()=>{const r=await get();assert.equal(r.status,200);assert.deepEqual(await r.json(),{userId:user.id});assert.match(r.headers.get('cache-control'),/private.*no-store/);});
 const customer=check(await service.from('customers').insert({display_name:`PR12 action test ${marker}`}).select('id').single());
 const location=check(await service.from('service_locations').insert({customer_id:customer.id,street:'123 Test Street',city:'Fredericksburg',state:'VA'}).select('id').single());
 const roleCode=load('../src/lib/auth/roles.ts',{'@/lib/supabase/server':{createClient:async()=>client}});
 const actions=load('../src/app/admin/quotes/actions.ts',{
  'next/cache':{revalidatePath(){}},'next/navigation':{redirect:destination=>{throw Object.assign(new Error('redirect'),{destination});}},
  '@/lib/supabase/server':{createClient:async()=>client},'@/lib/drafts/return-context':returnContext,
  '@/lib/business-time':businessTime,'@/lib/auth/roles':roleCode,'@/lib/contracting-parties':parties,
  '@/lib/quotes/edit-result':editResult,'@/lib/security/errors':{safeStaffMessage:()=> 'The operation could not finish.'},
  '@/lib/leads/archive':{archiveWebsiteLead:()=>assert.fail('No lead in this fixture')},
  '@/lib/quotes/lead-prefill':{isMatchingQuoteLeadSource:()=>assert.fail('No lead in this fixture')},
 });
 function quoteForm(intent='save_close'){
  const f=new FormData();for(const[k,v]of Object.entries({contracting_party:`customer:${customer.id}`,service_location_id:location.id,line_item_name:'PR12 acknowledged quote',line_item_quantity:'1',line_item_unit_price:'200',submit_intent:intent,client_navigation:'1',returnTo:'/admin/quotes?q=PR12&page=2&token=DO_NOT_PROPAGATE'}))f.set(k,v);return f;
 }
 await run('new quote save-and-close acknowledges the real atomic write with safe return context',async()=>{
  const result=await actions.createQuote({status:'idle',message:''},quoteForm());assert.equal(result.status,'success');
  const destination=new URL(result.navigateTo,process.env.PR12_WEB_URL);assert.match(destination.pathname,/^\/admin\/quotes\/[0-9a-f-]+$/);assert.equal(destination.searchParams.get('returnTo'),'/admin/quotes?q=PR12&page=2');
  const q=check(await service.from('quotes').select('total_cents,quote_line_items(name)').eq('id',destination.pathname.split('/').at(-1)).single());assert.equal(q.total_cents,20000);assert.equal(q.quote_line_items.length,1);
 });
 await run('new quote save remains in the editor and rejects an external return destination',async()=>{
  const f=quoteForm('save');f.set('returnTo','https://untrusted.invalid');const result=await actions.createQuote({status:'idle',message:''},f);assert.equal(result.status,'success');const url=new URL(result.navigateTo,process.env.PR12_WEB_URL);assert.match(url.pathname,/\/edit$/);assert.equal(url.searchParams.get('saved'),'1');assert.equal(url.searchParams.get('returnTo'),'/admin/quotes');
 });
 await run('existing non-client-navigation callers still receive the successful server redirect',async()=>{
  const f=quoteForm();f.delete('client_navigation');await assert.rejects(actions.createQuote({status:'idle',message:''},f),error=>error.message==='redirect'&&error.destination.startsWith('/admin/quotes/'));
 });
 await run('offboarding blocks recovery identity even with an already-issued session cookie',async()=>{check(await service.from('employee_records').update({is_active:false,employment_status:'separated'}).eq('auth_user_id',user.id));const r=await get();assert.equal(r.status,403);assert.deepEqual(await r.json(),{userId:null});});
 await run('signing out clears identity instead of reviving a recovery owner',async()=>{check(await service.from('employee_records').update({is_active:true,employment_status:'active'}).eq('auth_user_id',user.id));check(await client.auth.signOut());const r=await get();assert.equal(r.status,401);assert.deepEqual(await r.json(),{userId:null});});
 if(process.env.PR12_RESULTS_FILE)writeFileSync(process.env.PR12_RESULTS_FILE,JSON.stringify({localOnly:true,results},null,2));
});
