import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {writeFileSync} from 'node:fs';
import {quoteEditFixture} from './quote-edit-confirmation-fixture.mjs';
const literal=value=>value===null?'null':"'"+String(value).replaceAll("'","''")+"'";

test('mobile durable creation against installed staff commands; synthetic rollback only',{
 skip:process.env.MOBILE_QUOTE_DISPOSABLE!=='1',timeout:120000,
},async t=>{
 assert.equal(process.env.DOCKER_HOST,'unix:///Users/noelsierra/.lima/pr02-disposable/sock/docker.sock');
 assert.ok(process.env.MOBILE_QUOTE_DOCKER_BIN);
 const child=spawn(process.env.MOBILE_QUOTE_DOCKER_BIN,['exec','-i','supabase_db_ats_pr02_disposable',
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
 try {
  await query(`begin;set local statement_timeout='10s';set local lock_timeout='3s';
   create function pg_temp.capture_json(statement text) returns jsonb language plpgsql as $$
   declare result jsonb;begin execute statement into result;return jsonb_build_object('data',result,'error',null);
   exception when others then return jsonb_build_object('data',null,'error',jsonb_build_object('code',sqlstate));end;$$`);
  for (const c of [
   ...['owner','admin','estimator','payroll_admin'].map(staff=>({name:staff+' creates one mobile proposal',staff})),
   {name:'organization proposal retains active contacts and property',organization:true},
   {name:'lost acknowledgement recovers once',lost:true}, {name:'exception after SQL recovers once',throwAfter:true},
   {name:'replay returns current approved record without reopening',closed:true},
   {name:'replay returns later edits for review',edited:true},
   {name:'changed retry is rejected',changed:true,code:'23514'},
   {name:'another actor cannot replay',otherActor:true,code:'23514'},
   {name:'inactive employee cannot replay',inactive:true,code:'42501'},
   {name:'withdrawn office role cannot replay',revoked:true,code:'42501'},
   {name:'required audit failure rolls everything back',auditFailure:true,initialReject:true,code:'23514'},
   {name:'receipt failure rolls everything back',receiptFailure:true,initialReject:true,code:'23514'},
   {name:'anonymous cannot execute',role:'anon',initialReject:true,code:'42501'},
   {name:'service role cannot replace staff',role:'service_role',initialReject:true,code:'42501'},
  ]) await t.test(c.name,async()=>{
   const actor=randomUUID(),otherActor=randomUUID(),party=randomUUID(),location=randomUUID(),request=randomUUID(),contact=randomUUID();
   await query(`savepoint fixture;
    insert into auth.users(id,email,raw_user_meta_data)values('${actor}','${actor}@example.invalid','{}'),('${otherActor}','${otherActor}@example.invalid','{}');
    update profiles set status='active' where id in('${actor}','${otherActor}');
    insert into employee_records(auth_user_id,legal_name,employment_status,is_active)values('${actor}','Mobile request synthetic','active',true),('${otherActor}','Mobile request synthetic','active',true);
    insert into user_roles(user_id,role_id)select a.id,r.id from auth.users a cross join roles r where a.id in('${actor}','${otherActor}')and r.name='${c.staff??'owner'}';
    ${c.organization?`insert into organizations(id,name)values('${party}','MOBILE_QUOTE_${actor}');
      insert into organization_contacts(id,organization_id,full_name)values('${contact}','${party}','Synthetic contact');`:
      `insert into customers(id,display_name)values('${party}','MOBILE_QUOTE_${actor}');`}
    insert into service_locations(id,customer_id,organization_id,street,city,state)values('${location}',${c.organization?'null':literal(party)},${c.organization?literal(party):'null'},'123 Synthetic Street','Fredericksburg','VA')`);
   if(c.auditFailure)await query(`alter table activity_log add constraint mobile_request_audit_test check(event_type<>'quote_created')not valid`);
   if(c.receiptFailure)await query(`alter table app_private.quote_draft_requests add constraint mobile_request_receipt_test check(request_id<>'${request}'::uuid)not valid`);
   let subject=actor,lost=Boolean(c.lost),throws=Boolean(c.throwAfter);const responses=[];
   async function asActor(statement){
    const role=c.role??'authenticated';
    const rows=await query(`set local role ${role};set local request.jwt.claims=${literal(JSON.stringify({role,sub:subject}))};
     select 'RESULT:'||pg_temp.capture_json(${literal(statement)})::text;reset role`);
    return JSON.parse(rows.find(r=>r.startsWith('RESULT:')).slice(7));
   }
   const f=quoteEditFixture({create:true,actor,party,location,organization:c.organization,requestId:request,rpc:async(name,args)=>{
    assert.equal(name,'create_quote_draft_request');
    const response=await asActor(`select public.create_quote_draft_request(${literal(args.p_request_id)},${literal(JSON.stringify(args.p_header))}::jsonb,${literal(JSON.stringify(args.p_lines))}::jsonb)`);
    responses.push(response);
    if(lost){lost=false;return{data:null,error:null};}if(throws){throws=false;throw Error('Synthetic acknowledgement loss');}return response;
   }});
   f.input.requestId=request;
   if(c.organization){f.input.recipientContactId=contact;f.input.approvalContactId=contact;}
   // Execute mobile ownership/detail reads under the same actual RLS principal.
   f.db.from=table=>{
    assert.ok(['service_locations','quotes','quote_portal_tokens','organization_contacts'].includes(table));let id;
    const q={select(){return q;},eq(key,value){if(key==='id')id=value;return q;},order(){return q;},limit(){return q;},in(){return q;},
     then(resolve,reject){return asActor(`select jsonb_agg(to_jsonb(c))from organization_contacts c where c.id='${contact}'and c.organization_id='${party}'and c.is_active`).then(resolve,reject);},
     single:async()=>table==='service_locations'?asActor(`select to_jsonb(l)from service_locations l where id=${literal(id)}`):
      asActor(`select to_jsonb(q)||jsonb_build_object('customers',(select to_jsonb(c)from customers c where c.id=q.customer_id),'organizations',(select to_jsonb(o)from organizations o where o.id=q.organization_id),'service_locations',(select to_jsonb(l)from service_locations l where l.id=q.service_location_id),'quote_line_items',(select jsonb_agg(to_jsonb(l)order by sort_order)from quote_line_items l where l.quote_id=q.id))from quotes q where id=${literal(id)}`),
     maybeSingle:async()=>({data:null,error:null})};return q;
   };
   const run=()=>f.runMobileCreate();let first;
   if(c.initialReject){
    await assert.rejects(run());
    if(responses.length)assert.equal(responses[0].error.code,c.code);
    else{
     assert.equal(c.role,'anon');assert.equal(f.calls.length,0);
     const denied=await asActor(`select public.create_quote_draft_request('${request}','{}'::jsonb,'[]'::jsonb)`);
     assert.equal(denied.error.code,'42501');
    }
   }
   else {
    if(c.lost||c.throwAfter)await assert.rejects(run());else{first=await run();assert.equal(first.creationReplayed,false);}
    const id=responses[0].data.id;
    if(c.closed)await query(`update quotes set status='approved' where id='${id}'`);
    if(c.edited)await query(`update quotes set customer_message='Later saved edit' where id='${id}'`);
    if(c.changed)f.input.customerMessage='Changed scope';
    if(c.otherActor)subject=otherActor;
    if(c.inactive)await query(`update employee_records set employment_status='inactive',is_active=false where auth_user_id='${actor}'`);
    if(c.revoked)await query(`delete from user_roles where user_id='${actor}'`);
    if(c.code){
     const beforeCalls=responses.length;await assert.rejects(run());
     if(c.inactive||c.revoked){
      assert.equal(responses.length,beforeCalls); // Actual ownership RLS already denies the application preflight.
      const args=f.calls[0].args;
      const denied=await asActor(`select public.create_quote_draft_request(${literal(args.p_request_id)},${literal(JSON.stringify(args.p_header))}::jsonb,${literal(JSON.stringify(args.p_lines))}::jsonb)`);
      assert.equal(denied.error.code,c.code); // The installed command independently refuses the same actor.
     }else assert.equal(responses.at(-1).error.code,c.code);
    }
    else{const replay=await run();assert.equal(replay.id,id);
     if(c.organization){assert.equal(replay.party.kind,'organization');assert.equal(replay.party.id,party);assert.equal(replay.recipientContactId,contact);assert.equal(replay.approvalContactId,contact);}assert.equal(replay.creationReplayed,true);assert.equal(replay.creationRequestId,request);
     if(c.closed)assert.equal(replay.status,'approved');if(c.edited)assert.equal(replay.customerMessage,'Later saved edit');}
   }
   const state=await json(`select jsonb_build_object('quotes',(select count(*)from quotes where customer_id='${party}'or organization_id='${party}'),
    'lines',(select count(*)from quote_line_items l join quotes q on q.id=l.quote_id where q.customer_id='${party}'or q.organization_id='${party}'),
    'audits',(select count(*)from activity_log a join quotes q on q.id=a.subject_id where a.event_type='quote_created'and(q.customer_id='${party}'or q.organization_id='${party}')),
    'requests',(select count(*)from app_private.quote_draft_requests where request_id='${request}'))`);
   assert.deepEqual(state,c.initialReject?{quotes:0,lines:0,audits:0,requests:0}:{quotes:1,lines:2,audits:1,requests:1});
   proof.push({name:c.name,pass:true,...state});await query('rollback to savepoint fixture;release savepoint fixture');
  });
  await query('rollback');
 }finally{if(!exited){try{await query('rollback');}catch{}}child.stdin.end();reader.close();}
 if(process.env.MOBILE_QUOTE_RESULTS)writeFileSync(process.env.MOBILE_QUOTE_RESULTS,JSON.stringify(proof,null,2)+'\n');
});
