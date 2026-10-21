import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {writeFileSync} from 'node:fs';
import {generationFixture,jobId,quoteId,other,requestId} from './invoice-generation-confirmation-fixture.mjs';
const literal=value=>value===null?'null':"'"+String(value).replaceAll("'","''")+"'";

test('invoice generation confirmations against installed commands and staff-scoped reads; rollback only',{
 skip:process.env.GENERATION_CONFIRMATION_DISPOSABLE!=='1',timeout:120000,
},async t=>{
 assert.equal(process.env.DOCKER_HOST,'unix:///Users/noelsierra/.lima/pr02-disposable/sock/docker.sock');
 assert.ok(process.env.GENERATION_CONFIRMATION_DOCKER_BIN);
 const child=spawn(process.env.GENERATION_CONFIRMATION_DOCKER_BIN,['exec','-i','supabase_db_ats_pr02_disposable',
  'psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{env:process.env,stdio:['pipe','pipe','pipe']});
 const reader=createInterface({input:child.stdout});let pending,exited=false,diagnostic='';
 child.stderr.on('data',b=>{diagnostic+=b;});child.on('exit',()=>{exited=true;pending?.reject(Error('Disposable SQL exited: '+diagnostic));pending=undefined;});
 child.on('error',e=>{pending?.reject(e);pending=undefined;});
 reader.on('line',line=>{if(!pending)return;if(line===pending.marker){const current=pending;pending=undefined;current.resolve(current.rows);}else pending.rows.push(line);});
 async function query(sql){
  assert.equal(pending,undefined);assert.equal(exited,false);let timer;
  try{return await new Promise((resolve,reject)=>{pending={marker:'DONE_'+randomUUID(),rows:[],resolve,reject};
   timer=setTimeout(()=>{pending=undefined;child.stdin.end();reject(Error('Disposable SQL timeout'));},20000);
   child.stdin.write(sql+';\nselect '+literal(pending.marker)+';\n');});}finally{clearTimeout(timer);}
 }
 async function json(sql){const rows=await query("select 'JSON:'||("+sql+")::text");const result=rows.find(row=>row.startsWith('JSON:'));assert.ok(result);return JSON.parse(result.slice(5));}
 const proof=[];
 try{
  await query(`begin;set local statement_timeout='10s';set local lock_timeout='3s';
   create function pg_temp.capture_json(statement text) returns jsonb language plpgsql as $$
   declare result jsonb;begin execute statement into result;return jsonb_build_object('data',result,'error',null);
   exception when others then return jsonb_build_object('data',null,'error',jsonb_build_object('code',sqlstate,'message',sqlerrm));end;$$`);
  for(const c of [
   ...['owner','admin','estimator','payroll_admin'].map(staff=>({name:staff+' generates and confirms through authorized invoice reads',staff})),
   {name:'approved quote binds its existing work order',mode:'quote'},
   {name:'approved quote creates and binds a work order',mode:'quote',newJob:true},
   {name:'legacy reverse quote link recovers an existing invoice',mode:'quote',legacy:true,existing:true},
   {name:'manual work-order lines preserve totals and return context',mode:'manual'},
   {name:'lost response recovers the same invoice without another draft audit',lost:true},
   {name:'transport loss after SQL is recoverable without an automatic replay',throwAfter:true},
   {name:'pre-PR09 stored completion flag survives as a review-only replay',legacyReceipt:true},
   {name:'invoice lookup denied after a successful command retains uncertainty',deniedRead:true},
   {name:'combined completion confirms the invoice and finished work',mode:'completion'},
   {name:'complete-only never creates billing',mode:'complete'},
   {name:'future visits require the existing confirmation',mode:'completion',future:true,code:'23514'},
   {name:'confirmed future visits close atomically with the invoice',mode:'completion',future:true,confirm:true},
   {name:'stale completion review cannot close work or invoice it',mode:'completion',stale:true,code:'PT409'},
   {name:'inactive account cannot generate despite stale action roles',inactive:true,code:'42501'},
   {name:'revoked role cannot recover a generated invoice',revoked:true,code:'42501'},
   {name:'anonymous cannot generate',role:'anon',code:'42501'},
   {name:'service role cannot substitute for office command',role:'service_role',code:'42501'},
   {name:'generation paperwork never completes scheduled work'},
  ])await t.test(c.name,async()=>{
   const actor=randomUUID();
   await query(`savepoint fixture;
    insert into auth.users(id,email,raw_user_meta_data)values('${actor}','${actor}@example.invalid','{}');
    update profiles set status='active'where id='${actor}';
    insert into employee_records(auth_user_id,legal_name,employment_status,is_active)values('${actor}','Generation confirmation synthetic','active',true);
    insert into user_roles(user_id,role_id)select '${actor}',id from roles where name='${c.staff??'owner'}';
    insert into customers(id,display_name)values('${other}','GENERATION_CONFIRMATION_${actor}');
    insert into service_locations(id,customer_id,street,city,state)values('${other}','${other}','123 Synthetic Street','Fredericksburg','VA');
    ${c.newJob?'':`insert into jobs(id,customer_id,service_location_id,status,service_type,requested_scope)values('${jobId}','${other}','${other}','scheduled','tree_removal','Synthetic local scope');`}
    insert into quotes(id,job_id,customer_id,service_location_id,status,subtotal_cents,tax_cents,total_cents)
     values('${quoteId}',${c.newJob||c.legacy?'null':literal(jobId)},'${other}','${other}','approved',1000,0,1000);
    insert into quote_line_items(quote_id,name,quantity,unit_price_cents,total_cents,sort_order)values('${quoteId}','Synthetic scope',1,1000,1000,0);
    ${c.newJob?'':`update jobs set source_quote_id='${quoteId}'where id='${jobId}'`}`);
   try{
   if(c.existing)await query(`insert into invoices(job_id,customer_id,quote_id,invoice_number,status,subtotal_cents,total_cents,balance_due_cents)
    values('${jobId}','${other}',null,'GENERATION_LEGACY_${actor}','sent',1000,1000,1000)`);
   if(c.future)await query(`insert into schedule_events(job_id,service_location_id,title,event_type,status,starts_at,ends_at,created_by_user_id)
    values('${jobId}','${other}','Synthetic future visit','job','scheduled','2030-01-01T14:00:00Z','2030-01-01T16:00:00Z','${actor}')`);
   const claims=literal(JSON.stringify({role:'authenticated',sub:actor}));
   async function scoped(statement,role=c.role??'authenticated'){
    const rows=await query(`set local role ${role};set local request.jwt.claims=${literal(JSON.stringify({role,sub:actor}))};
     select 'RESULT:'||pg_temp.capture_json(${literal(statement)})::text;reset role`);
    return JSON.parse(rows.find(r=>r.startsWith('RESULT:')).slice(7));
   }
   const context=c.mode==='completion'||c.mode==='complete'?(await scoped(`select public.get_job_completion_context('${jobId}')`)).data:null;
   let lost=Boolean(c.lost),throws=Boolean(c.throwAfter),deny=Boolean(c.deniedRead);const responses=[],readRoles=[];
   const f=generationFixture({mode:c.mode??'job',rpc:async(name,args)=>{
    let statement;
    if(name==='generate_job_invoice')statement=`select public.generate_job_invoice(${literal(args.p_request_id)},${literal(args.p_job_id??null)},${literal(args.p_quote_id??null)},${args.p_manual?literal(JSON.stringify(args.p_manual))+'::jsonb':'null'})`;
    else{assert.equal(name,'complete_job_work');statement=`select public.complete_job_work(${literal(args.p_request_id)},${literal(args.p_job_id)},${args.p_expected_revision},${literal(JSON.stringify(args.p_expected_snapshot))}::jsonb,${args.p_confirm_future?'true':'false'},${literal(args.p_mode)},${literal(args.p_reason??null)})`;}
    const response=await scoped(statement);responses.push(response);
    if(lost){lost=false;return{data:null,error:null};}if(throws){throws=false;throw Error('Synthetic loss after SQL');}return response;
   },read:async(table,id)=>{
    assert.ok(['invoices','quotes','jobs'].includes(table));assert.match(id,/^[a-f0-9-]{36}$/i);
    if(deny){deny=false;return{data:null,error:{code:'42501'}};}
    const columns=table==='jobs'?'id,source_quote_id':'id,job_id';
    readRoles.push('authenticated');return scoped(`select to_jsonb(t)from(select ${columns} from public.${table} where id=${literal(id)})t`,'authenticated');
   }});
   if(context){f.form.set('expected_revision',String(context.revision+(c.stale?1:0)));f.form.set('expected_snapshot',JSON.stringify(context.snapshot));if(c.confirm)f.form.set('confirm_future','on');}
   if(c.inactive)await query(`update employee_records set employment_status='inactive',is_active=false where auth_user_id='${actor}'`);
   async function run(){try{return await f.run();}catch(e){assert.match(e.message,/TEST_REDIRECT/);return{status:'success',redirect:true};}}
   let result=await run();
   if(c.legacyReceipt){
    assert.equal(result.status,'success');await query(`update app_private.invoice_generation_requests set result_json=jsonb_set(result_json,'{job_completed}','true'::jsonb)where request_id='${requestId}'`);
    f.redirects.length=0;result=await run();assert.equal(result.status,'success');assert.equal(result.invoiceId,responses[0].data.invoice_id);assert.equal(responses[1].data.replayed,true);assert.equal(f.redirects.length,0);
   }
   if(c.revoked){assert.equal(result.status,'success');await query(`delete from user_roles where user_id='${actor}'`);f.paths.length=0;f.redirects.length=0;result=await run();}
   if(c.code){assert.equal(result.status,'error');assert.equal(responses.at(-1).error.code,c.code);assert.deepEqual(f.paths,[]);}
   else if(c.lost||c.throwAfter||c.deniedRead){
    assert.equal(result.status,'error');assert.equal(f.calls.length,1);assert.deepEqual(f.paths,[]);assert.deepEqual(f.redirects,[]);
    result=await run();assert.equal(result.status,'success');assert.equal(result.invoiceId,responses[0].data.invoice_id);assert.equal(responses[1].data.replayed,true);assert.equal(f.redirects.length,0);
   }else assert.equal(result.status,'success',JSON.stringify({result,responses,readRoles}));
   const state=await json(`select jsonb_build_object('invoices',(select count(*)from invoices where customer_id='${other}'),
    'invoiceAudits',(select count(*)from activity_log a join invoices i on i.id=a.subject_id where i.customer_id='${other}'and event_type='invoice_draft_created'),
    'completed',(select completed_at is not null from jobs where customer_id='${other}'limit 1),
    'visits',(select count(*)from schedule_events where job_id='${jobId}'and status='completed'),
    'payments',(select count(*)from payments where customer_id='${other}'))`);
   const rejected=Boolean(c.code&&!c.revoked),complete=c.mode==='complete'||c.mode==='completion';
   assert.equal(state.invoices,rejected||c.mode==='complete'?0:1);assert.equal(state.invoiceAudits,rejected||c.mode==='complete'||c.existing?0:1);
   assert.equal(state.completed,complete&&!rejected);assert.equal(state.visits,c.future&&c.confirm?1:0);assert.equal(state.payments,0);
   proof.push({name:c.name,pass:true,calls:f.calls.length,staffScopedReads:readRoles.length,...state});
   }finally{await query('rollback to savepoint fixture;release savepoint fixture');}
  });
  await query('rollback');
 }finally{if(!exited){try{await query('rollback');}catch{}}child.stdin.end();reader.close();}
 if(process.env.GENERATION_CONFIRMATION_RESULTS)writeFileSync(process.env.GENERATION_CONFIRMATION_RESULTS,JSON.stringify(proof,null,2)+'\n');
});
