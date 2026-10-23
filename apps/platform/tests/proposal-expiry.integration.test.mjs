import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,writeFileSync} from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';
const enabled=process.env.PROPOSAL_EXPIRY_DISPOSABLE==='1';
test('proposal deadlines with independent installed-schema transactions',{skip:!enabled,timeout:60000},async t=>{
 const env=JSON.parse(readFileSync(process.env.PROPOSAL_EXPIRY_ENV_FILE));
 assert.equal(env.projectId,'ats_docmail_30e1592cbeea');assert.equal(env.container,'supabase_db_'+env.projectId);assert.equal(env.api,'http://127.0.0.1:60421');
 assert.equal(env.reusedRetainedTaskStack,true);assert.equal(process.env.DOCKER_HOST,'unix:///Users/noelsierra/.lima/pr02-disposable/sock/docker.sock');
 const docker=process.env.PROPOSAL_EXPIRY_DOCKER_BIN;assert.ok(docker);
 const args=['exec','-i',env.container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-U','postgres','-d','postgres'];
 function sql(source){const r=spawnSync(docker,args,{env:process.env,input:source,encoding:'utf8',timeout:20000});assert.equal(r.status,0,r.stderr);return r.stdout.trim();}
 function asyncSql(source){const p=spawn(docker,args,{env:process.env});let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);const done=new Promise((resolve,reject)=>{p.on('error',reject);p.on('exit',code=>resolve({code,out:out.trim(),err}));});p.stdin.end(source);return done;}
 async function hold(id){const p=spawn(docker,args,{env:process.env});let out='',err='';p.stderr.on('data',b=>err+=b);const done=new Promise((resolve,reject)=>{p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(Error(err)));});const ready=new Promise(resolve=>p.stdout.on('data',b=>{out+=b;const m=out.match(/EXPIRY_LOCKED:(\d+)/);if(m)resolve(Number(m[1]));}));p.stdin.write(`begin;select id from public.jobs where id='${id}' for update;select 'EXPIRY_LOCKED:'||pg_backend_pid();\n`);const pid=await ready;return{pid,release:async()=>{p.stdin.end('commit;\n');await done;}};}
 const seed=JSON.parse(sql(`begin;create temporary table expiry_native(data jsonb);do $$
 declare actor uuid:=gen_random_uuid();party uuid:=gen_random_uuid();site uuid:=gen_random_uuid();j uuid;q uuid;raw text;case_name text;cases jsonb:='{}';
 begin
 insert into public.roles(name)values('owner')on conflict(name)do nothing;
 insert into auth.users(id,email,raw_user_meta_data)values(actor,'expiry-native-'||actor||'@example.invalid','{}');
 update public.profiles set status='active'where id=actor;insert into public.employee_records(auth_user_id,legal_name,is_active,employment_status)values(actor,'Synthetic expiry operator',true,'active');
 insert into public.user_roles(user_id,role_id)select actor,id from public.roles where name='owner';
 insert into public.customers(id,display_name,email)values(party,'Synthetic proposal expiry customer','expiry-native-'||party||'@example.invalid');
 insert into public.service_locations(id,customer_id,label,street,city,state,postal_code)values(site,party,'Synthetic expiry property','1 Test Lane','Fredericksburg','VA','22401');
 foreach case_name in array array['parent_wait','token_wait','simultaneous','expired','future','undated','approved']loop
  j:=gen_random_uuid();q:=gen_random_uuid();raw:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  insert into public.jobs(id,customer_id,service_location_id,status,service_type,requested_scope)values(j,party,site,'new_lead','tree_removal','Synthetic retained expiry scope');
  insert into public.quotes(id,customer_id,service_location_id,job_id,quote_number,status,subtotal_cents,total_cents,expires_at)values(q,party,site,j,'EXPIRY-NATIVE-'||q,'sent',10000,10000,case when case_name='undated'then null when case_name='expired'then clock_timestamp()-interval '1 day'else clock_timestamp()+interval '1 day'end);
  insert into public.quote_line_items(quote_id,name,description,quantity,unit_price_cents,total_cents)values(q,'Synthetic tree pruning','Synthetic retained expiry scope',1,10000,10000);
  insert into public.quote_portal_tokens(quote_id,customer_id,token_hash,expires_at)values(q,party,encode(sha256(convert_to(raw,'UTF8')),'hex'),clock_timestamp()+interval '1 day');
  cases:=cases||jsonb_build_object(case_name,jsonb_build_object('id',q,'job',j,'rawToken',raw,'hash',encode(sha256(convert_to(raw,'UTF8')),'hex')));
 end loop;
 insert into expiry_native values(jsonb_build_object('actor',actor,'cases',cases));
 end $$;select data from expiry_native;commit;`));
 t.after(()=>{sql(`update public.profiles set status='disabled'where id='${seed.actor}';update public.employee_records set is_active=false,employment_status='separated'where auth_user_id='${seed.actor}';`);});
 const read=q=>JSON.parse(sql(`select jsonb_build_object('quote',(select to_jsonb(x)from public.quotes x where id='${q.id}'),'job',(select to_jsonb(x)from public.jobs x where id='${q.job}'),'events',(select jsonb_agg(to_jsonb(x)order by id)from public.activity_log x where subject_id='${q.id}'),'handoffs',(select jsonb_agg(to_jsonb(x)order by id)from app_private.customer_source_events x where source_key like 'quote:${q.id}:%'))`));
 const approve=(q,portal=true)=>`begin;set local application_name='ATS_PROPOSAL_EXPIRY';set local role ${portal?'service_role':'authenticated'};select set_config('request.jwt.claim.sub','${portal?'':seed.actor}',true);select set_config('request.jwt.claims','${JSON.stringify(portal?{role:'service_role'}:{role:'authenticated',sub:seed.actor})}',true);select ${portal?`public.approve_quote_by_portal('${q.hash}',${read(q).quote.edit_revision})`:`public.approve_quote('${q.id}',${read(q).quote.edit_revision})`};commit;`;
 for(const mode of ['parent_wait','token_wait'])await t.test(mode+' checks wall time after the parent lock is released',async()=>{
  const q=seed.cases[mode];
  if(mode==='parent_wait')sql(`update public.quotes set expires_at=clock_timestamp()+interval '1200 milliseconds'where id='${q.id}'`);
  else sql(`update public.quote_portal_tokens set expires_at=clock_timestamp()+interval '1200 milliseconds'where quote_id='${q.id}'`);
  const before=read(q),lock=await hold(q.job),pending=asyncSql(approve(q));let blocked=false;
  try{
   for(let i=0;i<30;i++){if(Number(sql(`select count(*)from pg_stat_activity where ${lock.pid}=any(pg_blocking_pids(pid))`))>0){blocked=true;break;}await new Promise(r=>setTimeout(r,20));}
   while(sql(mode==='parent_wait'?`select expires_at<=clock_timestamp()from public.quotes where id='${q.id}'`:`select expires_at<=clock_timestamp()from public.quote_portal_tokens where quote_id='${q.id}'`)!=='t')await new Promise(r=>setTimeout(r,50));
  }finally{await lock.release();}
  const result=await pending;assert.equal(blocked,true,'approval must actually wait in a separate transaction: '+result.err);assert.notEqual(result.code,0);assert.match(result.err,mode==='parent_wait'?/23514.*proposal has expired/s:/42501.*unavailable or expired/s);assert.deepEqual(read(q),before);
 });
 await t.test('two simultaneous customer approvals keep one work order audit and source event',async()=>{
  const q=seed.cases.simultaneous,command=approve(q),r=await Promise.all([asyncSql(command),asyncSql(command)]);
  for(const x of r)assert.equal(x.code,0,x.err);const after=read(q);assert.equal(after.quote.status,'approved');assert.equal(after.job.source_quote_id,q.id);
  assert.equal(after.events.filter(x=>x.event_type==='quote_approved').length,1);assert.equal(after.handoffs.length,1);
 });
 const approved=seed.cases.approved;const accepted=await asyncSql(approve(approved));assert.equal(accepted.code,0,accepted.err);
 sql(`update public.quotes set expires_at=clock_timestamp()-interval '1 day'where id='${approved.id}'`);
 if(process.env.PROPOSAL_EXPIRY_OUTPUT_FILE)writeFileSync(process.env.PROPOSAL_EXPIRY_OUTPUT_FILE,JSON.stringify({syntheticOnly:true,origin:'http://127.0.0.1:3187',actor:seed.actor,cases:seed.cases},null,2),{mode:0o600});
});
