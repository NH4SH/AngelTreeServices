import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
const literal=v=>"'"+String(v).replaceAll("'","''")+"'";
test('durable quote creation serializes real committed sessions in a separate local database',{
 skip:process.env.QUOTE_DRAFT_DISPOSABLE!=='1',timeout:120000,
},async t=>{
 assert.equal(process.env.DOCKER_HOST,'unix:///Users/noelsierra/.lima/pr02-disposable/sock/docker.sock');
 const template=process.env.QUOTE_DRAFT_DATABASE,docker=process.env.QUOTE_DRAFT_DOCKER_BIN;
 assert.match(template??'',/^ats_quote_fresh_[a-f0-9]{32}$/);assert.ok(docker);
 const db='ats_quote_races_'+randomUUID().replaceAll('-','');
 const args=database=>['exec','-i','supabase_db_ats_pr02_disposable','psql','-X','-qAt','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1'];
 async function sql(source,database=db){
  const child=spawn(docker,args(database),{env:process.env});let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);
  const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>code===0?resolve(out.trim()):reject(Error(err)));});
  child.stdin.end(source);return done;
 }
 async function json(source){return JSON.parse(await sql(source));}
 async function lock(id){
  const child=spawn(docker,args(db),{env:process.env});let err='',pid;child.stderr.on('data',b=>err+=b);
  const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(err)));});
  const ready=new Promise((resolve,reject)=>{child.stdout.on('data',b=>{const match=String(b).match(/LOCK:(\d+)/);if(match){pid=Number(match[1]);resolve();}});child.on('error',reject);child.on('exit',()=>reject(Error('Lock ended before ready')));});
  child.stdin.write(`begin;select pg_advisory_xact_lock(hashtextextended('${id}',43667));select 'LOCK:'||pg_backend_pid();\n`);await ready;
  return{pid,release:async()=>{child.stdin.end('commit;\n');await done;}};
 }
 async function blocked(pid,count){
  for(let i=0;i<60;i++){
   if(Number(await sql(`select count(*)from pg_stat_activity where datname='${db}'and ${pid}=any(pg_blocking_pids(pid))`))>=count)return;
   await new Promise(r=>setTimeout(r,25));
  }assert.fail('Independent command did not reach request lock');
 }
 const proof=[];
 try{
  await sql(`create database ${db} template ${template}`,'postgres');
  await sql(`insert into roles(name)values('owner')on conflict(name)do nothing`);
  for(const c of [
   {name:'two identical submissions commit one quote and return one replay'},
   {name:'different details cannot share a request',changed:true},
   {name:'another staff actor cannot take a request',otherActor:true},
   {name:'role revoked while waiting is denied after the lock',revoked:true},
   {name:'employee deactivated while waiting is denied after the lock',inactive:true},
  ])await t.test(c.name,async()=>{
   const actor=randomUUID(),other=randomUUID(),party=randomUUID(),loc=randomUUID(),request=randomUUID();
   await sql(`insert into auth.users(id,email,raw_user_meta_data)values('${actor}','${actor}@example.invalid','{}'),('${other}','${other}@example.invalid','{}');
    update profiles set status='active'where id in('${actor}','${other}');
    insert into employee_records(auth_user_id,legal_name,employment_status,is_active)values('${actor}','Quote race synthetic','active',true),('${other}','Quote race synthetic','active',true);
    insert into user_roles(user_id,role_id)select a.id,r.id from auth.users a cross join roles r where a.id in('${actor}','${other}')and r.name='owner';
    insert into customers(id,display_name)values('${party}','QUOTE_RACE_${actor}');
    insert into service_locations(id,customer_id,street,city,state)values('${loc}','${party}','123 Synthetic Street','Fredericksburg','VA')`);
   const header={customer_id:party,organization_id:null,service_location_id:loc};
   async function create(subject,changed=false){
    const rows=await sql(`begin;set local statement_timeout='12s';
     create function pg_temp.capture()returns jsonb language plpgsql as $$declare result jsonb;begin
      result:=public.create_quote_draft_request('${request}',${literal(JSON.stringify({...header,customer_message:changed?'Different scope':null}))}::jsonb,
       '[{"name":"Synthetic scope","quantity":1,"unit_price_cents":1000,"total_cents":1000}]'::jsonb);
      return jsonb_build_object('data',result,'error',null);exception when others then return jsonb_build_object('data',null,'error',sqlstate);end;$$;
     set local role authenticated;set local request.jwt.claims=${literal(JSON.stringify({role:'authenticated',sub:subject}))};
     select 'RESULT:'||pg_temp.capture()::text;commit`);
    return JSON.parse(rows.split('\n').find(s=>s.startsWith('RESULT:')).slice(7));
   }
   const held=await lock(request),pending=[];let released=false;
   try{
    pending.push(create(actor));if(!c.revoked&&!c.inactive)pending.push(create(c.otherActor?other:actor,Boolean(c.changed)));
    await blocked(held.pid,pending.length);
    if(c.revoked)await sql(`delete from user_roles where user_id='${actor}'`);
    if(c.inactive)await sql(`update employee_records set employment_status='inactive',is_active=false where auth_user_id='${actor}'`);
    await held.release();released=true;
    const responses=await Promise.all(pending),success=responses.filter(r=>r.error===null),errors=responses.filter(r=>r.error!==null);
    if(c.revoked||c.inactive){assert.equal(success.length,0);assert.deepEqual(errors.map(r=>r.error),['42501']);}
    else if(c.changed||c.otherActor){assert.equal(success.length,1);assert.deepEqual(errors.map(r=>r.error),['23514']);}
    else{assert.equal(success.length,2);assert.equal(new Set(success.map(r=>r.data.id)).size,1);assert.deepEqual(success.map(r=>r.data.replayed).sort(),[false,true]);}
    const state=await json(`select jsonb_build_object('quotes',(select count(*)from quotes where customer_id='${party}'),
     'requests',(select count(*)from app_private.quote_draft_requests where request_id='${request}'),
     'audits',(select count(*)from activity_log a join quotes q on q.id=a.subject_id where q.customer_id='${party}'and a.event_type='quote_created'))`);
    const expected=c.revoked||c.inactive?0:1;assert.deepEqual(state,{quotes:expected,requests:expected,audits:expected});
    proof.push({name:c.name,pass:true,...state,errors:errors.map(r=>r.error)});
   }finally{if(!released)await held.release();await Promise.allSettled(pending);}
  });
 }finally{await sql(`drop database if exists ${db}`,'postgres');}
 if(process.env.QUOTE_DRAFT_RACE_RESULTS)writeFileSync(process.env.QUOTE_DRAFT_RACE_RESULTS,JSON.stringify({separateDatabaseDropped:true,results:proof},null,2)+'\n');
});
