import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {writeFileSync} from 'node:fs';
import {standaloneFixture} from './standalone-invoice-fixture.mjs';
const lit=v=>v===null?'null':"'"+String(v).replaceAll("'","''")+"'";
const line=(changes={})=>({name:'Synthetic work',quantity:1,unit_price_cents:1000,total_cents:1000,...changes});

test('standalone invoice transaction, recovery and independently committed races in an owned fresh database',{
 skip:process.env.STANDALONE_DISPOSABLE!=='1',timeout:180000,
},async t=>{
 const database=process.env.STANDALONE_DATABASE;
 assert.match(database??'',/^ats_standalone_fresh_[a-f0-9]{32}$/);
 assert.equal(process.env.DOCKER_HOST,'unix:///Users/noelsierra/.lima/pr02-disposable/sock/docker.sock');
 assert.ok(process.env.STANDALONE_DOCKER_BIN);
 const sessions=[],proof=[];
 async function session(label){
  const name='standalone_'+randomUUID().replaceAll('-','');
  const child=spawn(process.env.STANDALONE_DOCKER_BIN,['exec','-i','supabase_db_ats_pr02_disposable','psql','-X','-qAt','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1'],{env:process.env,stdio:['pipe','pipe','pipe']});
  let pending,exited=false,diagnostic='';const reader=createInterface({input:child.stdout});
  child.stderr.on('data',b=>{diagnostic+=b;});
  child.on('error',e=>{pending?.reject(e);pending=undefined;});
  child.on('exit',()=>{exited=true;pending?.reject(Error(label+' exited: '+diagnostic));pending=undefined;});
  reader.on('line',s=>{if(!pending)return;if(s===pending.marker){const p=pending;pending=undefined;p.resolve(p.rows);}else pending.rows.push(s);});
  const client={name,async query(sql){
   assert.equal(pending,undefined);assert.equal(exited,false);let timer;
   try{return await new Promise((resolve,reject)=>{pending={marker:'DONE_'+randomUUID(),rows:[],resolve,reject};timer=setTimeout(()=>{pending=undefined;child.stdin.end();reject(Error(label+' timeout'));},20000);
    child.stdin.write(sql+';\nselect '+lit(pending.marker)+';\n');});}finally{clearTimeout(timer);}
  },async json(sql){const rows=await client.query("select 'JSON:'||("+sql+")::text");const result=rows.find(s=>s.startsWith('JSON:'));assert.ok(result);return JSON.parse(result.slice(5));},
  close(){child.stdin.end();reader.close();}};
  sessions.push(client);
  await client.query(`set application_name='${name}';set statement_timeout='15s';set lock_timeout='10s';
   create function pg_temp.capture(statement text) returns jsonb language plpgsql as $$declare result jsonb;begin execute statement into result;
   return jsonb_build_object('data',result,'error',null);exception when others then return jsonb_build_object('data',null,'error',jsonb_build_object('code',sqlstate,'message',sqlerrm));end;$$`);
  return client;
 }
 const db=await session('control');
 const actor=randomUUID(),otherActor=randomUUID(),party=randomUUID(),organization=randomUUID(),location=randomUUID();
 const claims=(id=actor,role='authenticated')=>`set local role ${role};set local request.jwt.claims=${lit(JSON.stringify({role,sub:id}))};`;
 const args=(changes={})=>({p_request_id:randomUUID(),p_header:{customer_id:party,organization_id:null,service_location_id:null,due_at:'2026-11-04T17:00:00Z'},p_lines:[line()],p_notes:'Synthetic note',p_new_customer:null,...changes});
 const invoke=a=>`select public.create_standalone_invoice(${lit(a.p_request_id)},${lit(JSON.stringify(a.p_header))}::jsonb,${lit(JSON.stringify(a.p_lines))}::jsonb,${lit(a.p_notes)},${a.p_new_customer===null?'null':lit(JSON.stringify(a.p_new_customer))+'::jsonb'})`;
 async function call(client,a,id=actor,role='authenticated'){
  const rows=await client.query(`${claims(id,role)}select 'RESULT:'||pg_temp.capture(${lit(invoke(a))})::text;reset role`);
  const r=rows.find(s=>s.startsWith('RESULT:'));assert.ok(r);return JSON.parse(r.slice(7));
 }
 async function state(request){return db.json(`select jsonb_build_object('requests',count(*),'invoices',count(i.id),'notes',
  (select count(*)from public.notes n where n.author_user_id='${actor}'),'creationAudits',
  (select count(*)from public.activity_log l where l.subject_id in(select invoice_id from app_private.standalone_invoice_requests where request_id=${lit(request)}) and event_type in('invoice_created','invoice_draft_created')),
  'lines',(select count(*)from invoice_line_items where invoice_id in(select invoice_id from app_private.standalone_invoice_requests where request_id=${lit(request)})))
  from app_private.standalone_invoice_requests r left join invoices i on i.id=r.invoice_id where r.request_id=${lit(request)}`);}
 async function footprint(){return db.json(`select jsonb_build_object('customers',(select count(*)from customers),'locations',(select count(*)from service_locations),
  'invoices',(select count(*)from invoices),'lines',(select count(*)from invoice_line_items),'notes',(select count(*)from notes),
  'audits',(select count(*)from activity_log),'requests',(select count(*)from app_private.standalone_invoice_requests))`);}
 const run=(name,fn)=>t.test(name,async()=>{await fn();proof.push({name,pass:true});});
 try{
  // All fixtures belong to this newly replayed database, never the shared app DB.
  await db.query(`begin;
   insert into auth.users(id,email,raw_user_meta_data)values('${actor}','${actor}@example.invalid','{}'),('${otherActor}','${otherActor}@example.invalid','{}');
   insert into public.profiles(id,email,status)values('${actor}','${actor}@example.invalid','active'),('${otherActor}','${otherActor}@example.invalid','active')on conflict(id)do update set status='active';
   insert into public.roles(name)values('owner')on conflict(name)do nothing;
   insert into public.user_roles(user_id,role_id)select a.id,r.id from unnest(array['${actor}'::uuid,'${otherActor}'::uuid])a(id)cross join public.roles r where r.name='owner';
   insert into public.customers(id,display_name,email)values('${party}','STANDALONE synthetic','${party}@example.invalid');
   insert into public.organizations(id,name)values('${organization}','STANDALONE synthetic organization');
   insert into public.service_locations(id,organization_id,label,street,city,state)values('${location}','${organization}','Synthetic','1 Synthetic St','Fredericksburg','VA');commit`);
  await db.query('begin');
  await run('legacy low-level draft creation intentionally lacks submission replay protection',async()=>{
   const a=args();const statement=`select public.create_invoice_draft(${lit(JSON.stringify(a.p_header))}::jsonb,${lit(JSON.stringify(a.p_lines))}::jsonb)`;
   const rows=[];for(let i=0;i<2;i++){
    const output=await db.query(`${claims()}select 'CONTROL:'||pg_temp.capture(${lit(statement)})::text;reset role`);
    const r=JSON.parse(output.find(s=>s.startsWith('CONTROL:')).slice(8));assert.equal(r.error,null);rows.push(r.data.id);
   }assert.notEqual(rows[0],rows[1]);
  });
  await run('individual creation and exact replay create one invoice, note and each audit',async()=>{
   const a=args(),first=await call(db,a),second=await call(db,a);assert.equal(first.error,null);assert.equal(second.error,null);assert.equal(first.data.replayed,false);assert.equal(second.data.replayed,true);assert.equal(second.data.invoice_id,first.data.invoice_id);
   const s=await state(a.p_request_id);assert.equal(s.requests,1);assert.equal(s.invoices,1);assert.equal(s.creationAudits,2);
   const i=await db.json(`select to_jsonb(i)from invoices i where id='${first.data.invoice_id}'`);assert.equal(i.total_cents,1000);assert.equal(i.balance_due_cents,1000);assert.equal(i.status,'draft');assert.equal(i.customer_id,party);
   assert.equal(await db.json(`select to_jsonb(count(*))from notes where customer_id='${party}' and body='Invoice note: Synthetic note'`),1);
  });
  await run('new customer and primary address are atomic and reused on replay',async()=>{
   const email=randomUUID()+'@example.invalid';const a=args({p_header:{customer_id:null,organization_id:null,service_location_id:null},p_new_customer:{name:'New synthetic',email,phone:null,street:'123 Synthetic',city:'Fredericksburg',state:'va',postal_code:'22401'}});
   const one=await call(db,a),two=await call(db,a);assert.equal(one.error,null);assert.equal(two.error,null);assert.equal(two.data.customer_id,one.data.customer_id);assert.equal(two.data.service_location_id,one.data.service_location_id);
   assert.equal(await db.json(`select to_jsonb(count(*))from customers where email=${lit(email)}`),1);assert.equal((await state(a.p_request_id)).creationAudits,2);
  });
  for(const withLocation of [false,true])await run('organization-only billing '+(withLocation?'with a location retains the note':'retains the unattached-note warning'),async()=>{
   const r=await call(db,args({p_header:{customer_id:null,organization_id:organization,service_location_id:withLocation?location:null}}));assert.equal(r.error,null);assert.equal(r.data.customer_id,null);assert.equal(r.data.organization_id,organization);assert.equal(r.data.note_warning,!withLocation);
  });
  await run('changed request payload or actor cannot reuse a committed identity',async()=>{
   const a=args();assert.equal((await call(db,a)).error,null);
   assert.equal((await call(db,{...a,p_notes:'Different'})).error.code,'23514');assert.equal((await call(db,a,otherActor)).error.code,'23514');assert.equal((await state(a.p_request_id)).invoices,1);
  });
  await run('distinct command identities still allow intentional separate invoices',async()=>{
   const a=await call(db,args()),b=await call(db,args());assert.equal(a.error,null);assert.equal(b.error,null);assert.notEqual(a.data.invoice_id,b.data.invoice_id);
  });
  await run('voided saved invoice is returned for review, never replaced',async()=>{
   const a=args(),created=await call(db,a);assert.equal(created.error,null);
   await db.query(`${claims()}select public.finalize_invoice_void('${created.data.invoice_id}',(public.begin_invoice_void('${created.data.invoice_id}')->>'token')::uuid);reset role`);
   const r=await call(db,a);assert.equal(r.error,null);assert.equal(r.data.invoice_status,'void');assert.equal(r.data.invoice_id,created.data.invoice_id);assert.equal(r.data.replayed,true);assert.equal((await state(a.p_request_id)).invoices,1);
  });
  await run('deleted saved invoice is not silently recreated',async()=>{
   const a=args(),created=await call(db,a);assert.equal(created.error,null);
   await db.query(`delete from invoice_line_items where invoice_id='${created.data.invoice_id}';delete from invoices where id='${created.data.invoice_id}'`);
   const r=await call(db,a);assert.equal(r.error?.code,'23514');assert.equal((await state(a.p_request_id)).invoices,0);assert.equal((await state(a.p_request_id)).requests,1);
  });
  await run('lost action response recovers its actual saved invoice without another note or invoice',async()=>{
   let lost=true;const request=randomUUID();const f=standaloneFixture({requestId:request,partyId:party,rpc:async(_name,a)=>{const r=await call(db,a);if(lost){lost=false;return{data:null,error:null};}return r;}});
   assert.equal((await f.run()).status,'error');assert.equal(f.calls.length,1);assert.deepEqual(f.paths,[]);
   const r=await f.run();assert.equal(r.status,'success');assert.equal(r.existingInvoice,true);assert.equal(r.navigateTo,undefined);assert.equal(f.calls.length,2);assert.deepEqual(f.calls[0],f.calls[1]);assert.equal((await state(request)).creationAudits,2);
  });
  await run('late line failure rolls back a new customer and address',async()=>{
   const email=randomUUID()+'@example.invalid',a=args({p_header:{},p_new_customer:{name:'Rollback synthetic',email,street:'123 Synthetic',city:'Local',state:'VA'},p_lines:[line({service_category_id:randomUUID()})]});
   const before=await footprint();
   assert.equal((await call(db,a)).error.code,'23503');assert.equal((await state(a.p_request_id)).requests,0);assert.equal(await db.json(`select to_jsonb(count(*))from customers where email=${lit(email)}`),0);
   assert.deepEqual(await footprint(),before);
  });
  for(const failure of ['note','audit','request'])await run('mandatory '+failure+' failure rolls back the full submission',async()=>{
   await db.query('savepoint failure');const a=args({p_new_customer:{name:'Rollback synthetic',email:randomUUID()+'@example.invalid',street:'123 Synthetic',city:'Local',state:'VA'},p_header:{}});
   const table=failure==='note'?'public.notes':failure==='audit'?'public.activity_log':'app_private.standalone_invoice_requests';
   const condition=failure==='audit'?"new.event_type='invoice_draft_created'":'true';
   await db.query(`create function pg_temp.reject_submission()returns trigger language plpgsql as $$begin if ${condition} then raise exception 'Synthetic required-write failure' using errcode='23514';end if;return new;end;$$;
    create trigger standalone_failure before insert on ${table} for each row execute function pg_temp.reject_submission()`);
   const before=await footprint();
   assert.equal((await call(db,a)).error.code,'23514');assert.equal((await state(a.p_request_id)).requests,0);assert.equal(await db.json(`select to_jsonb(count(*))from customers where email=${lit(a.p_new_customer.email)}`),0);
   assert.deepEqual(await footprint(),before);
   await db.query('rollback to savepoint failure;release savepoint failure');
  });
  await run('party, new-customer contact and source validation remain enforced',async()=>{
   for(const [a,code]of [
    [args({p_header:{customer_id:party,organization_id:organization}}),'22023'],
    [args({p_header:{customer_id:party,service_location_id:location}}),'23514'],
    [args({p_header:{customer_id:party,job_id:randomUUID()}}),'22023'],
    [args({p_header:{},p_new_customer:{name:'Missing contact'}}),'22023'],
    [args({p_header:{},p_new_customer:{name:'Duplicate',email:(party+'@example.invalid').toUpperCase(),street:'1 Synthetic',city:'Local',state:'VA'}}),'23514'],
   ]){const r=await call(db,a);assert.equal(r.error?.code,code);assert.equal((await state(a.p_request_id)).requests,0);}
  });
  await run('caller-supplied money state and numbering never override draft creation',async()=>{
   const a=args();Object.assign(a.p_header,{status:'paid',total_cents:1,tax_cents:400,invoice_number:'FORGED',balance_due_cents:0});const r=await call(db,a);assert.equal(r.error,null);
   const i=await db.json(`select to_jsonb(i)from invoices i where id='${r.data.invoice_id}'`);assert.equal(i.status,'draft');assert.equal(i.total_cents,1000);assert.equal(i.tax_cents,0);assert.notEqual(i.invoice_number,'FORGED');
  });
  await run('inactive, anonymous and service callers cannot create or replay',async()=>{
   const a=args();assert.equal((await call(db,a)).error,null);
   for(const role of ['anon','service_role'])assert.equal((await call(db,a,actor,role)).error.code,'42501');
   await db.query('savepoint inactive');await db.query(`update profiles set status='disabled' where id='${actor}'`);assert.equal((await call(db,a)).error.code,'42501');await db.query('rollback to savepoint inactive;release savepoint inactive');
  });
  await run('all existing office roles retain creation access; no-role caller is denied',async()=>{
   await db.query('savepoint office_roles');
   for(const role of ['owner','admin','estimator','payroll_admin']){
    await db.query(`insert into roles(name)values('${role}')on conflict(name)do nothing;delete from user_roles where user_id='${otherActor}';
     insert into user_roles(user_id,role_id)select '${otherActor}',id from roles where name='${role}'`);
    assert.equal((await call(db,args(),otherActor)).error,null,role);
   }
   await db.query(`delete from user_roles where user_id='${otherActor}'`);assert.equal((await call(db,args(),otherActor)).error.code,'42501');
   await db.query('rollback to savepoint office_roles;release savepoint office_roles');
  });
  await run('private request history stays inaccessible and execute grants remain narrow',async()=>{
   const meta=await db.json(`select jsonb_build_object('rls',(select relrowsecurity from pg_class where oid='app_private.standalone_invoice_requests'::regclass),'definer',p.prosecdef,'config',p.proconfig,'auth',has_function_privilege('authenticated',p.oid,'execute'),'anon',has_function_privilege('anon',p.oid,'execute'),'service',has_function_privilege('service_role',p.oid,'execute'),'tableAuth',has_table_privilege('authenticated','app_private.standalone_invoice_requests','select,insert,update,delete'),'tableService',has_table_privilege('service_role','app_private.standalone_invoice_requests','select,insert,update,delete'))from pg_proc p where oid='public.create_standalone_invoice(uuid,jsonb,jsonb,text,jsonb)'::regprocedure`);
   assert.equal(meta.rls,true);assert.equal(meta.definer,true);assert.equal(meta.auth,true);assert.equal(meta.anon,false);assert.equal(meta.service,false);assert.equal(meta.tableAuth,false);assert.equal(meta.tableService,false);assert.ok(meta.config.includes('search_path=""'));
   const policy=await db.json(`select to_jsonb(p)from pg_policies p where schemaname='app_private' and tablename='standalone_invoice_requests'`);
   assert.equal(policy.permissive,'RESTRICTIVE');assert.equal(policy.qual,'false');assert.equal(policy.with_check,'false');
   assert.equal(await db.json(`select to_jsonb(count(*))from app_private.customer_source_events`),0);
  });
  await db.query('rollback');

  async function waiting(client){
   const deadline=Date.now()+3000;
   while(Date.now()<deadline){if(await db.json(`select to_jsonb(exists(select 1 from pg_stat_activity where application_name='${client.name}' and wait_event_type='Lock' and wait_event='advisory'))`))return;await new Promise(r=>setTimeout(r,15));}
   assert.fail('Competing session did not reach the expected transaction lock');
  }
  for(const kind of ['commit','rollback','changed','contact','revoked'])await run('independent sessions: '+kind+' handoff preserves one complete outcome',async()=>{
   const a=await session('first'),b=await session('second');const request=args();let second={...request};
   if(kind==='contact'){
    request.p_header={};request.p_new_customer={name:'Concurrent synthetic',email:randomUUID()+'@example.invalid',street:'1 Synthetic',city:'Local',state:'VA'};second={...request,p_request_id:randomUUID()};
   }
   if(kind==='changed')second={...request,p_notes:'Changed concurrent payload'};
   const beforeNotes=(await state(request.p_request_id)).notes;
   await a.query('begin');
   let first;
   if(kind==='revoked')await a.query(`select pg_advisory_xact_lock(hashtextextended('${request.p_request_id}',43665))`);
   else{first=await call(a,request);assert.equal(first.error,null);}
   await b.query('begin');const pending=call(b,second);
   try{
    await waiting(b);
    if(kind==='revoked')await a.query(`update profiles set status='disabled' where id='${actor}'`);
    await a.query(kind==='rollback'?'rollback':'commit');
    const result=await pending;
    if(['changed','contact','revoked'].includes(kind))assert.equal(result.error?.code,kind==='revoked'?'42501':'23514');
    else{assert.equal(result.error,null);assert.equal(result.data.replayed,kind==='commit');if(kind==='commit')assert.equal(result.data.invoice_id,first.data.invoice_id);else assert.notEqual(result.data.invoice_id,first.data.invoice_id);}
    await b.query('commit');
    const s=await state(request.p_request_id);assert.equal(s.requests,kind==='revoked'?0:1);assert.equal(s.invoices,kind==='revoked'?0:1);assert.equal(s.creationAudits,kind==='revoked'?0:2);
    assert.equal(s.lines,kind==='revoked'?0:1);assert.equal(s.notes,beforeNotes+(kind==='revoked'?0:1));
    if(kind==='contact'){
     assert.equal((await state(second.p_request_id)).requests,0);assert.equal(await db.json(`select to_jsonb(count(*))from customers where email=${lit(request.p_new_customer.email)}`),1);
    }
   }finally{
    if(kind==='revoked')await db.query(`update profiles set status='active' where id='${actor}'`);
    a.close();b.close();
   }
  });
 }finally{try{await db.query('rollback');}catch{}for(const s of sessions)s.close();}
 if(process.env.STANDALONE_RESULTS)writeFileSync(process.env.STANDALONE_RESULTS,JSON.stringify(proof,null,2)+'\n');
});
