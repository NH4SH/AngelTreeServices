import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {writeFileSync} from 'node:fs';
import {quoteEditFixture} from './quote-edit-confirmation-fixture.mjs';
const literal=value=>value===null?'null':"'"+String(value).replaceAll("'","''")+"'";

test('quote edit confirmation against installed staff commands; synthetic rollback only',{
 skip:process.env.QUOTE_EDIT_DISPOSABLE!=='1',timeout:120000,
},async t=>{
 assert.equal(process.env.DOCKER_HOST,'unix:///Users/noelsierra/.lima/pr02-disposable/sock/docker.sock');
 assert.ok(process.env.QUOTE_EDIT_DOCKER_BIN);
 const child=spawn(process.env.QUOTE_EDIT_DOCKER_BIN,['exec','-i','supabase_db_ats_pr02_disposable',
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
   exception when others then return jsonb_build_object('data',null,'error',jsonb_build_object('code',sqlstate));end;$$`);
  for(const c of [
   ...['owner','admin','estimator','payroll_admin'].map(staff=>({name:staff+' saves ordered retained/new lines and removes the omitted line',staff,again:staff==='owner'})),
   {name:'mobile confirms the same installed command',mobile:true},
   {name:'lost acknowledgement keeps draft and explicit retry sees conflict',lost:true},
   {name:'transport loss after write keeps draft without automatic retry',throwAfter:true},
   {name:'mobile lost acknowledgement retains uncertainty',mobile:true,lost:true},
   {name:'stale revision returns the saved version without editing',stale:true,conflict:true},
   {name:'inactive account loses authority inside SQL',inactive:true,code:'42501'},
   {name:'nonstaff loses authority inside SQL',staff:'crew',code:'42501'},
   {name:'anonymous cannot execute',role:'anon',code:'42501'},
   {name:'service role cannot substitute for staff command',role:'service_role',code:'42501'},
   {name:'approved quote remains locked',closed:true,code:'23514'},
   {name:'foreign retained line changes neither quote',foreign:true,code:'23514'},
  ])await t.test(c.name,async()=>{
   const actor=randomUUID(),party=randomUUID(),location=randomUUID();
   await query(`savepoint fixture;
    insert into auth.users(id,email,raw_user_meta_data)values('${actor}','${actor}@example.invalid','{}');
    insert into public.profiles(id,email,full_name,status)values('${actor}','${actor}@example.invalid','Quote edit synthetic','active')on conflict(id)do update set status='active';
    insert into public.employee_records(auth_user_id,legal_name,employment_status,is_active)values('${actor}','Quote edit synthetic','active',true);
    insert into public.user_roles(user_id,role_id)select '${actor}',id from public.roles where name='${c.staff==='crew'?'owner':c.staff??'owner'}';
    insert into public.customers(id,display_name)values('${party}','QUOTE_EDIT_${actor}');
    insert into public.service_locations(id,customer_id,street,city,state)values('${location}','${party}','123 Synthetic Street','Fredericksburg','VA')`);
   const claims=literal(JSON.stringify({role:'authenticated',sub:actor}));
   async function createDraft(){
    const rows=await query(`set local role authenticated;set local request.jwt.claims=${claims};
     select 'DRAFT:'||public.create_quote_draft(${literal(JSON.stringify({customer_id:party,service_location_id:location}))}::jsonb,
      '[{"name":"Original retained","quantity":1,"unit_price_cents":1000,"total_cents":1000},{"name":"Original removed","quantity":1,"unit_price_cents":500,"total_cents":500}]'::jsonb)::text;reset role`);
    return JSON.parse(rows.find(r=>r.startsWith('DRAFT:')).slice(6));
   }
   const draft=await createDraft(),id=draft.id,retained=draft.line_ids[0],removed=draft.line_ids[1];
   let foreign;
   if(c.foreign)foreign=(await createDraft()).line_ids[0];
   if(c.closed)await query(`update quotes set status='approved' where id='${id}'`);
   const before=await json(`select jsonb_build_object('revision',edit_revision,'total',total_cents)from quotes where id='${id}'`);
   if(c.inactive)await query(`update employee_records set employment_status='inactive',is_active=false where auth_user_id='${actor}'`);
   if(c.staff==='crew')await query(`delete from user_roles where user_id='${actor}'`);
   let lost=Boolean(c.lost),throws=Boolean(c.throwAfter);const responses=[];
   const f=quoteEditFixture({id,party,location,actor,retainedId:c.foreign?foreign:retained,rpc:async(name,args)=>{
    const statement=`select public.save_quote_details(${literal(args.p_quote_id)},${args.p_expected_revision},${literal(JSON.stringify(args.p_header))}::jsonb,${literal(JSON.stringify(args.p_lines))}::jsonb,${args.p_confirm_party_change?'true':'false'})`;
    const role=c.role??'authenticated';
    const rows=await query(`set local role ${role};set local request.jwt.claims=${literal(JSON.stringify({role,sub:actor}))};
     select 'RESULT:'||pg_temp.capture_json(${literal(statement)})::text;reset role`);
    const response=JSON.parse(rows.find(r=>r.startsWith('RESULT:')).slice(7));responses.push(response);
    if(lost){lost=false;return{data:null,error:null};}if(throws){throws=false;throw Error('Synthetic loss after SQL');}return response;
   }});
   f.form.set('expected_revision',String(before.revision-(c.stale?1:0)));f.input.expectedRevision=before.revision-(c.stale?1:0);
   const run=async()=>{
    if(!c.mobile)return f.run();
    try{return{status:'success',quote:await f.runMobile()};}catch(e){return{status:'error',message:e.message,conflict:e.conflict};}
   };
   let result=await run();
   if(c.code){assert.equal(result.status,'error');assert.equal(responses[0].error.code,c.code);assert.equal(f.calls.length,1);}
   else if(c.stale){assert.equal(result.status,'error');assert.equal(result.conflict.currentRevision,before.revision);assert.equal(responses[0].data.conflict,true);}
   else if(c.lost||c.throwAfter){
    assert.equal(result.status,'error');assert.equal(f.calls.length,1);assert.deepEqual(f.paths,[]);
    result=await run();assert.equal(result.status,'error');assert.equal(result.conflict.currentRevision,responses[0].data.edit_revision);assert.equal(f.calls.length,2);
   }else{
    assert.equal(result.status,'success');assert.ok(responses[0].data.edit_revision>before.revision);assert.equal(responses[0].data.line_ids[0],retained);
    if(!c.mobile){assert.equal(result.savedRevision,responses[0].data.edit_revision);assert.equal(result.savedLineIds['retained-client'],retained);}
    if(c.again){
     f.form.set('expected_revision',String(result.savedRevision));f.form.delete('line_item_id');
     for(const line of responses[0].data.line_ids)f.form.append('line_item_id',line);
     const next=await run();assert.equal(next.status,'success');assert.deepEqual(next.savedLineIds,result.savedLineIds);assert.ok(next.savedRevision>result.savedRevision);
    }
   }
   const state=await json(`select jsonb_build_object('total',q.total_cents,'party',q.customer_id,'revision',q.edit_revision,
    'lines',(select jsonb_agg(jsonb_build_object('id',id,'name',name,'total',total_cents)order by sort_order)from quote_line_items where quote_id=q.id),
    'audit',(select count(*)from activity_log where subject_id=q.id and event_type='quote_updated'),
    'sources',(select count(*)from app_private.customer_source_events where event->>'subject_id'=q.id::text))from quotes q where id='${id}'`);
   const denied=Boolean(c.code||c.stale);assert.equal(state.total,1500);assert.equal(state.party,party);assert.equal(state.lines.length,2);
   assert.equal(state.audit,denied?0:c.again?2:1);assert.equal(state.lines.some(line=>line.id===removed),denied);assert.equal(state.sources,0);
   if(denied){assert.equal(state.revision,before.revision);assert.deepEqual(f.paths,[]);}else assert.ok(state.revision>before.revision);
   if(c.foreign)assert.equal(await json(`select to_jsonb(total_cents)from quote_line_items where id='${foreign}'`),1000);
   proof.push({name:c.name,pass:true,calls:f.calls.length,audits:state.audit,denied,sqlCodes:responses.flatMap(r=>r.error?[r.error.code]:[])});
   await query('rollback to savepoint fixture;release savepoint fixture');
   assert.equal(await json(`select to_jsonb(count(*))from quotes where id='${id}'`),0);
  });
  await query('rollback');
 }finally{if(!exited){try{await query('rollback');}catch{}}child.stdin.end();reader.close();}
 if(process.env.QUOTE_EDIT_RESULTS)writeFileSync(process.env.QUOTE_EDIT_RESULTS,JSON.stringify(proof,null,2)+'\n');
});
