import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {writeFileSync} from 'node:fs';
import {quoteEditFixture} from './quote-edit-confirmation-fixture.mjs';
const literal=value=>value===null?'null':"'"+String(value).replaceAll("'","''")+"'";

test('durable quote drafts against isolated installed commands; synthetic rollback only',{
 skip:process.env.QUOTE_DRAFT_DISPOSABLE!=='1',timeout:120000,
},async t=>{
 assert.equal(process.env.DOCKER_HOST,'unix:///Users/noelsierra/.lima/pr02-disposable/sock/docker.sock');
 assert.ok(process.env.QUOTE_DRAFT_DOCKER_BIN);
 assert.match(process.env.QUOTE_DRAFT_DATABASE??'',/^ats_quote_fresh_[a-f0-9]{32}$/);
 const child=spawn(process.env.QUOTE_DRAFT_DOCKER_BIN,['exec','-i','supabase_db_ats_pr02_disposable',
  'psql','-X','-qAt','-U','postgres','-d',process.env.QUOTE_DRAFT_DATABASE,'-v','ON_ERROR_STOP=1'],{env:process.env,stdio:['pipe','pipe','pipe']});
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
   insert into roles(name)values('owner'),('admin'),('estimator'),('payroll_admin')on conflict(name)do nothing;
   create function pg_temp.capture_json(statement text) returns jsonb language plpgsql as $$
   declare result jsonb;begin execute statement into result;return jsonb_build_object('data',result,'error',null);
   exception when others then return jsonb_build_object('data',null,'error',jsonb_build_object('code',sqlstate));end;$$`);
  for(const c of [
   ...['owner','admin','estimator','payroll_admin'].map(staff=>({name:staff+' creates once with the existing quote audit',staff})),
   {name:'organization-only quote preserves contacts and property',organization:true},
   {name:'lost acknowledgement recovers one existing quote',lost:true},
   {name:'transport exception after save recovers one existing quote',throwAfter:true},
   {name:'replay after editing retains the original receipt for review',replay:true,edited:true},
   {name:'replay after approval does not reopen or edit',replay:true,closed:true},
   {name:'changed scope under an existing identity is rejected',changed:true,code:'23514'},
   {name:'another staff actor cannot recover this identity',otherActor:true,code:'23514'},
   {name:'inactive actor cannot replay',inactive:true,code:'42501'},
   {name:'withdrawn staff role cannot replay',revoked:true,code:'42501'},
   {name:'anonymous cannot create',role:'anon',code:'42501',initialReject:true},
   {name:'service role cannot substitute for staff',role:'service_role',code:'42501',initialReject:true},
   {name:'late line foreign-key failure leaves no quote or request',badLine:true,code:'23503',initialReject:true},
   {name:'required quote history failure rolls back everything',auditFailure:true,code:'23514',initialReject:true},
   {name:'receipt insert failure rolls back quote lines and audit',receiptFailure:true,code:'23514',initialReject:true},
  ])await t.test(c.name,async()=>{
   const actor=randomUUID(),party=randomUUID(),location=randomUUID(),request=randomUUID(),contact=randomUUID(),otherActor=randomUUID();
   await query(`savepoint fixture;
    insert into auth.users(id,email,raw_user_meta_data)values('${actor}','${actor}@example.invalid','{}'),('${otherActor}','${otherActor}@example.invalid','{}');
    update profiles set status='active' where id in('${actor}','${otherActor}');
    insert into employee_records(auth_user_id,legal_name,employment_status,is_active)values('${actor}','Quote request synthetic','active',true),('${otherActor}','Quote request synthetic','active',true);
    insert into user_roles(user_id,role_id)select a.id,r.id from auth.users a cross join roles r where a.id in('${actor}','${otherActor}')and r.name='${c.staff??'owner'}';
    ${c.organization?`insert into organizations(id,name)values('${party}','QUOTE_REQUEST_${actor}');
      insert into organization_contacts(id,organization_id,full_name)values('${contact}','${party}','Synthetic contact');`:
      `insert into customers(id,display_name)values('${party}','QUOTE_REQUEST_${actor}');`}
    insert into service_locations(id,customer_id,organization_id,street,city,state)
     values('${location}',${c.organization?'null':literal(party)},${c.organization?literal(party):'null'},'123 Synthetic Street','Fredericksburg','VA')`);
   if(c.auditFailure)await query(`alter table activity_log add constraint quote_request_test_audit check(event_type<>'quote_created')not valid`);
   if(c.receiptFailure)await query(`alter table app_private.quote_draft_requests add constraint quote_request_test_receipt check(request_id<>'${request}'::uuid)not valid`);
   const responses=[];let lost=Boolean(c.lost),throws=Boolean(c.throwAfter),subject=actor;
   const f=quoteEditFixture({create:true,party,location,actor,organization:c.organization,requestId:request,rpc:async(name,args)=>{
    if(c.badLine)args.p_lines[1].service_category_id=otherActor;
    if(c.organization){args.p_header.recipient_contact_id=contact;args.p_header.approval_contact_id=contact;}
    const statement=`select public.create_quote_draft_request(${literal(args.p_request_id)},${literal(JSON.stringify(args.p_header))}::jsonb,${literal(JSON.stringify(args.p_lines))}::jsonb)`;
    const role=c.role??'authenticated';
    const rows=await query(`set local role ${role};set local request.jwt.claims=${literal(JSON.stringify({role,sub:subject}))};
     select 'RESULT:'||pg_temp.capture_json(${literal(statement)})::text;reset role`);
    const response=JSON.parse(rows.find(r=>r.startsWith('RESULT:')).slice(7));responses.push(response);
    if(lost){lost=false;return{data:null,error:null};}if(throws){throws=false;throw Error('Synthetic loss after SQL');}return response;
   }});
   if(c.organization){f.form.set('recipient_contact_id',contact);f.form.set('approval_contact_id',contact);}
   // Fixture lookups are controlled, so preserve the actual organization contact
   // checks in SQL while allowing the web adapter to pass its preflight.
   if(c.organization){const original=f.db.from;f.db.from=table=>{if(table!=='organization_contacts')return original(table);const q={select:()=>q,in:()=>q,then:(resolve,reject)=>Promise.resolve({data:[{id:contact,organization_id:party,is_active:true}],error:null}).then(resolve,reject)};return q;};}
   let result=await f.runCreate();
   if(c.initialReject){assert.equal(result.status,'error');assert.equal(responses[0].error.code,c.code);}
   else{
    if(c.lost||c.throwAfter)assert.equal(result.status,'error');else assert.equal(result.status,'success');
    const id=responses[0].data.id;
    if(c.changed)f.form.set('customer_message','Changed after submission');
    if(c.otherActor)subject=otherActor;
    if(c.inactive)await query(`update employee_records set employment_status='inactive',is_active=false where auth_user_id='${actor}'`);
    if(c.revoked)await query(`delete from user_roles where user_id='${actor}'`);
    if(c.edited)await query(`update quotes set customer_message='Later saved edit' where id='${id}'`);
    if(c.closed)await query(`update quotes set status='approved' where id='${id}'`);
    if(c.changed||c.otherActor||c.inactive||c.revoked||c.replay||c.lost||c.throwAfter){
     f.paths.length=0;result=await f.runCreate();assert.equal(result.status,'error');assert.equal(result.navigateTo,undefined);assert.deepEqual(f.paths,[]);assert.equal(f.archives.length,0);
     if(c.code){assert.equal(responses[1].error.code,c.code);assert.equal(result.existingQuoteId,undefined);}
     else{assert.equal(result.existingQuoteId,id);assert.equal(responses[1].data.replayed,true);assert.equal(responses[1].data.edit_revision,responses[0].data.edit_revision);
      if(c.closed)assert.equal(responses[1].data.quote_status,'approved');}
    }
   }
   const state=await json(`select jsonb_build_object('quotes',(select count(*)from quotes where customer_id='${party}'or organization_id='${party}'),
    'lines',(select count(*)from quote_line_items l join quotes q on q.id=l.quote_id where q.customer_id='${party}'or q.organization_id='${party}'),
    'audits',(select count(*)from activity_log a join quotes q on q.id=a.subject_id where a.event_type='quote_created'and(q.customer_id='${party}'or q.organization_id='${party}')),
    'requests',(select count(*)from app_private.quote_draft_requests where request_id='${request}'))`);
   assert.deepEqual(state,c.initialReject?{quotes:0,lines:0,audits:0,requests:0}:{quotes:1,lines:2,audits:1,requests:1});
   proof.push({name:c.name,pass:true,calls:f.calls.length,...state,sqlCodes:responses.flatMap(r=>r.error?[r.error.code]:[])});
   await query('rollback to savepoint fixture;release savepoint fixture');
  });
  await t.test('private request ledger stays inaccessible and staff command grants stay narrow',async()=>{
   const result=await json(`select jsonb_build_object('authenticatedExecute',has_function_privilege('authenticated','public.create_quote_draft_request(uuid,jsonb,jsonb)','execute'),
    'anonExecute',has_function_privilege('anon','public.create_quote_draft_request(uuid,jsonb,jsonb)','execute'),
    'serviceExecute',has_function_privilege('service_role','public.create_quote_draft_request(uuid,jsonb,jsonb)','execute'),
    'rawRead',has_table_privilege('authenticated','app_private.quote_draft_requests','select'),
    'rawWrite',has_table_privilege('authenticated','app_private.quote_draft_requests','insert'))`);
   assert.deepEqual(result,{authenticatedExecute:true,anonExecute:false,serviceExecute:false,rawRead:false,rawWrite:false});proof.push({name:'narrow grants',pass:true});
  });
  await query('rollback');
 }finally{if(!exited){try{await query('rollback');}catch{}}child.stdin.end();reader.close();}
 if(process.env.QUOTE_DRAFT_RESULTS)writeFileSync(process.env.QUOTE_DRAFT_RESULTS,JSON.stringify(proof,null,2)+'\n');
});
