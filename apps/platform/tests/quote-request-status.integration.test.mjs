import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {load} from './pr10-test-helpers.mjs';
import * as editResult from '../src/lib/quotes/edit-result.ts';
import {withDeadline} from '../src/lib/runtime/deadline.ts';
const literal=v=>"'"+String(v).replaceAll("'","''")+"'";
const helper=load('../src/lib/quotes/request-status.ts',{'server-only':{},'./edit-result':editResult,'../runtime/deadline.ts':{withDeadline}});
const validation=load('../src/lib/api/mobile-quotes.ts');
const mobile=load('../src/lib/data/mobile-quotes.ts',{'server-only':{},'@/lib/quotes/edit-result':editResult,'@/lib/quotes/request-status':helper,'@/lib/quotes/draft-request':{},'@/lib/quotes/save-confirmation':{},'@/lib/quotes/proposal-number':{},'@/lib/api/mobile-quotes':{}});

test('read-only quote request reconciliation in an empty local clone', {skip:process.env.QUOTE_STATUS_DISPOSABLE!=='1',timeout:150000},async t=>{
 assert.equal(process.env.DOCKER_HOST,'unix:///Users/noelsierra/.lima/pr02-disposable/sock/docker.sock');
 const template=process.env.QUOTE_STATUS_DATABASE,docker=process.env.QUOTE_STATUS_DOCKER_BIN;
 assert.match(template??'',/^ats_quote_fresh_[a-f0-9]{32}$/);assert.ok(docker);
 const db='ats_quote_status_'+randomUUID().replaceAll('-',''),proof=[];
 const args=database=>['exec','-i','supabase_db_ats_pr02_disposable','psql','-X','-qAt','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1'];
 function start(){const child=spawn(docker,args(db),{env:process.env});let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>code===0?resolve(out.trim()):reject(Error(err)));});return{child,done};}
 async function sql(source,database=db){const child=spawn(docker,args(database),{env:process.env});let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>code===0?resolve(out.trim()):reject(Error(err)));});child.stdin.end(source);return done;}
 const json=async source=>JSON.parse(await sql(source));
 const capture=`create function pg_temp.capture(statement text)returns jsonb language plpgsql as $$declare r jsonb;begin execute statement into r;return jsonb_build_object('data',r,'error',null);exception when others then return jsonb_build_object('data',null,'error',jsonb_build_object('code',sqlstate));end;$$;`;
 const actorSQL=(actor,role='authenticated')=>`set local role ${role};set local request.jwt.claims=${literal(JSON.stringify({role,sub:actor}))};`;
 const command=(name,f,header=f.header)=>`select public.${name}('${f.request}',${literal(JSON.stringify(header))}::jsonb,${literal(JSON.stringify(f.lines))}::jsonb)`;
 async function call(f,{name='resolve_quote_draft_request',actor=f.actor,role='authenticated',header=f.header,isolation='read committed',readOnly=true}={}){
  const raw=await sql(`${capture}begin isolation level ${isolation}${readOnly?' read only':''};${actorSQL(actor,role)}select 'RESULT:'||pg_temp.capture(${literal(command(name,f,header))})::text;commit`);
  return JSON.parse(raw.split('\n').find(s=>s.startsWith('RESULT:')).slice(7));
 }
 async function fixture(role='owner',organization=false){
  const f={actor:randomUUID(),other:randomUUID(),party:randomUUID(),location:randomUUID(),contact:randomUUID(),request:randomUUID()};
  await sql(`insert into auth.users(id,email,raw_user_meta_data)values('${f.actor}','${f.actor}@example.invalid','{}'),('${f.other}','${f.other}@example.invalid','{}');update profiles set status='active'where id in('${f.actor}','${f.other}');
   insert into employee_records(auth_user_id,legal_name,employment_status,is_active)values('${f.actor}','Synthetic status actor','active',true),('${f.other}','Synthetic status other','active',true);
   insert into user_roles(user_id,role_id)select a.id,r.id from auth.users a cross join roles r where a.id in('${f.actor}','${f.other}')and r.name='${role}';
   ${organization?`insert into organizations(id,name)values('${f.party}','Synthetic organization');insert into organization_contacts(id,organization_id,full_name)values('${f.contact}','${f.party}','Synthetic contact');`:`insert into customers(id,display_name)values('${f.party}','Synthetic customer');`}
   insert into service_locations(id,customer_id,organization_id,street,city,state)values('${f.location}',${organization?'null':literal(f.party)},${organization?literal(f.party):'null'},'123 Synthetic Street','Fredericksburg','VA')`);
  const input={requestId:f.request,customerId:organization?null:f.party,organizationId:organization?f.party:null,serviceLocationId:f.location,recipientContactId:organization?f.contact:null,approvalContactId:organization?f.contact:null,customerMessage:'  Original\r\nnotes  ',expiresAt:'2030-01-01T00:00:00Z',lines:[{name:'  Original scope  ',description:'Keep\r\nending  ',quantity:1.5,unitPriceCents:1000}]};
  // Obtain the exact real mobile adapter values before making the original call.
  const spy={rpc(name,args){assert.equal(name,'resolve_quote_draft_request');f.header=args.p_header;f.lines=args.p_lines;return Promise.resolve({data:{request_id:f.request,state:'not_recorded',receipt:null,quote_status:null},error:null});}};
  f.input=validation.validateMobileQuoteCopyInput(input).value;await mobile.resolveMobileQuoteRequest(spy,f.input);return f;
 }
 async function fingerprint(){const tables=await json(`select json_agg(quote_ident(schemaname)||'.'||quote_ident(tablename)order by schemaname,tablename)from pg_tables where schemaname in('public','app_private','auth','storage')`);return json(`select jsonb_object_agg(name,hash)from(${tables.map(table=>`select ${literal(table)}name,md5(coalesce(jsonb_agg(to_jsonb(t)order by to_jsonb(t)::text)::text,''))hash from ${table} t`).join(' union all ')})s`);}
 async function blocked(pid){for(let i=0;i<65;i++){if(Number(await sql(`select count(*)from pg_stat_activity where datname='${db}'and ${pid}=any(pg_blocking_pids(pid))`)))return;await new Promise(r=>setTimeout(r,10));}assert.fail('Read did not wait on the creator');}
 async function hold(f,create=false){const running=start();const ready=new Promise((resolve,reject)=>{running.child.stdout.on('data',b=>{const m=String(b).match(/HELD:(\d+)/);if(m)resolve(Number(m[1]));});running.child.on('error',reject);running.child.on('exit',()=>reject(Error('Holder exited early')));});running.child.stdin.write(`begin;${create?actorSQL(f.actor)+command('create_quote_draft_request',f)+';':`select pg_advisory_xact_lock(hashtextextended('${f.request}',43667));`}select 'HELD:'||pg_backend_pid();\n`);const pid=await ready;return{pid,release:async rollback=>{running.child.stdin.end(rollback?'rollback;':'commit;');await running.done;}};}
 try{
  await sql(`create database ${db} template ${template}`,'postgres');await sql(`insert into roles(name)values('owner'),('admin'),('estimator'),('payroll_admin'),('crew')on conflict(name)do nothing`);
  for(const c of [
   ...['owner','admin','estimator','payroll_admin'].map(role=>({name:role+' checks recorded request in READ ONLY',role})),
   {name:'not recorded is point-in-time only',missing:true},
   {name:'organization receipt survives inactive contact',organization:true,inactiveContact:true},
   {name:'later edits and approval preserve original receipt',edited:true},
   {name:'deleted quote retains an unavailable receipt',deleted:true},
   {name:'different details return no quote identity',mismatch:true,code:'42501'},
   {name:'another active office actor cannot read the receipt',other:true,code:'42501'},
   {name:'offboarded actor denied with old JWT',inactive:true,code:'42501'},
   {name:'revoked office role denied',revoked:true,code:'42501'},
   {name:'anonymous denied',apiRole:'anon',code:'42501'},
   {name:'service key cannot substitute for staff',apiRole:'service_role',code:'42501'},
   {name:'stale repeatable read snapshot denied',isolation:'repeatable read',code:'55000'},
   {name:'stale serializable snapshot denied',isolation:'serializable',code:'55000'},
  ])await t.test(c.name,async()=>{
   const f=await fixture(c.role??'owner',c.organization);let created;
   if(!c.missing){created=await call(f,{name:'create_quote_draft_request',readOnly:false});assert.equal(created.error,null);}
   if(c.inactiveContact)await sql(`update organization_contacts set is_active=false where id='${f.contact}'`);
   if(c.edited)await sql(`update quotes set customer_message='Later edit',status='approved'where id='${created.data.id}'`);
   if(c.deleted)await sql(`delete from quotes where id='${created.data.id}'`);
   if(c.inactive)await sql(`update employee_records set employment_status='inactive',is_active=false where auth_user_id='${f.actor}'`);
   if(c.revoked)await sql(`delete from user_roles where user_id='${f.actor}'`);
   const before=await fingerprint();
   const result=await call(f,{actor:c.other?f.other:f.actor,role:c.apiRole??'authenticated',header:c.mismatch?{...f.header,customer_message:'Different'}:f.header,isolation:c.isolation??'read committed'});
   if(c.code){assert.equal(result.error.code,c.code);assert.equal(result.data,null);}
   else{assert.equal(result.error,null);assert.equal(result.data.state,c.missing?'not_recorded':c.deleted?'unavailable':'recorded');if(!c.missing)assert.deepEqual(result.data.receipt,created.data);
    if(c.edited)assert.equal(result.data.quote_status,'approved');
    const calls=[],dbClient={rpc(name,args){calls.push(name);return Promise.resolve(result);},from(){assert.fail('No current ownership read for old request');}};
    const resolved=await mobile.resolveMobileQuoteRequest(dbClient,f.input);assert.equal(resolved.state,result.data.state);assert.equal(calls.length,1);
   }
   assert.deepEqual(await fingerprint(),before);proof.push({name:c.name,pass:true,readOnlyTransaction:true,rowFingerprintsUnchanged:true});
  });
  for(const c of [{name:'waits for in-flight creation commit',create:true},{name:'rollback is not recorded and does not retry',create:true,rollback:true},{name:'revocation while waiting is denied',revoked:true},{name:'offboarding while waiting is denied',inactive:true},{name:'lock timeout is uncertainty, never not-recorded',timeout:true}])await t.test(c.name,async()=>{
   const f=await fixture(),holder=await hold(f,c.create);let released=false,pending;
   try{
    pending=call(f);await blocked(holder.pid);
    if(c.revoked)await sql(`delete from user_roles where user_id='${f.actor}'`);
    if(c.inactive)await sql(`update employee_records set employment_status='inactive',is_active=false where auth_user_id='${f.actor}'`);
    let result;
    if(c.timeout){result=await pending;assert.equal(result.error.code,'55P03');}
    await holder.release(c.rollback);released=true;result??=await pending;
    if(c.revoked||c.inactive)assert.equal(result.error.code,'42501');
    else if(!c.timeout){assert.equal(result.error,null);assert.equal(result.data.state,c.rollback?'not_recorded':'recorded');}
    const counts=await json(`select jsonb_build_object('quotes',(select count(*)from quotes where customer_id='${f.party}'),'receipts',(select count(*)from app_private.quote_draft_requests where request_id='${f.request}'),'audits',(select count(*)from activity_log a join quotes q on q.id=a.subject_id where q.customer_id='${f.party}'and a.event_type='quote_created'))`);
    const n=c.create&&!c.rollback?1:0;assert.deepEqual(counts,{quotes:n,receipts:n,audits:n});proof.push({name:c.name,pass:true,...counts});
   }finally{if(!released)await holder.release(true);if(pending)await Promise.allSettled([pending]);}
  });
  await t.test('a negative check cannot prevent a later save; the next check finds that same receipt',async()=>{
   const f=await fixture(),first=await call(f);assert.equal(first.data.state,'not_recorded');
   const saved=await call(f,{name:'create_quote_draft_request',readOnly:false});assert.equal(saved.error,null);
   const before=await fingerprint(),later=await call(f);assert.equal(later.data.state,'recorded');assert.equal(later.data.receipt.id,saved.data.id);
   assert.deepEqual(await fingerprint(),before);assert.equal(await sql(`select count(*)from app_private.quote_draft_requests where request_id='${f.request}'`),'1');
   proof.push({name:'negative point-in-time check then later commit',pass:true});
  });
  await t.test('private ledger grants remain closed',async()=>{
   const grants=await json(`select jsonb_build_object('anon',has_function_privilege('anon','public.resolve_quote_draft_request(uuid,jsonb,jsonb)','EXECUTE'),'service',has_function_privilege('service_role','public.resolve_quote_draft_request(uuid,jsonb,jsonb)','EXECUTE'),'staff',has_function_privilege('authenticated','public.resolve_quote_draft_request(uuid,jsonb,jsonb)','EXECUTE'),'ledger',has_table_privilege('authenticated','app_private.quote_draft_requests','SELECT'))`);
   assert.deepEqual(grants,{anon:false,service:false,staff:true,ledger:false});proof.push({name:'narrow grants',pass:true});
  });
 }finally{await sql(`drop database if exists ${db}`,'postgres');}
 if(process.env.QUOTE_STATUS_RESULTS)writeFileSync(process.env.QUOTE_STATUS_RESULTS,JSON.stringify({cloneDropped:true,sourceRowsCopied:false,results:proof},null,2)+'\n');
});
