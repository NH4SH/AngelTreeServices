import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {writeFileSync} from 'node:fs';
import {invoiceEditFixture} from './invoice-edit-fixture.mjs';
const literal=value=>value===null?'null':"'"+String(value).replaceAll("'","''")+"'";

test('invoice edit confirmation against installed staff commands; synthetic rollback only',{
 skip:process.env.INVOICE_EDIT_DISPOSABLE!=='1',timeout:120000,
},async t=>{
 assert.equal(process.env.DOCKER_HOST,'unix:///Users/noelsierra/.lima/pr02-disposable/sock/docker.sock');
 assert.ok(process.env.INVOICE_EDIT_DOCKER_BIN);
 const child=spawn(process.env.INVOICE_EDIT_DOCKER_BIN,['exec','-i','supabase_db_ats_pr02_disposable',
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
   {name:'complete individual save retains, adds and removes lines; next save reuses identities',again:true},
   {name:'organization-only invoice keeps its party',organization:true},
   {name:'partial successful payment preserves the installed balance calculation',partial:true},
   {name:'lost acknowledgement retains draft; explicit old-version retry is rejected',lost:true},
   {name:'transport exception after SQL save retains draft without replay',throwAfter:true},
   {name:'stale revision is denied',stale:true,code:'40001'},
   {name:'paid invoice remains locked',status:'paid',code:'23514'},
   {name:'void invoice remains locked',status:'void',code:'23514'},
   {name:'pending payment remains locked',pending:true,code:'23514'},
   ...['creating','open','processing'].map(checkout=>({name:checkout+' checkout remains locked',checkout,code:'23514'})),
   {name:'inactive account fails inside existing SQL despite application role stub',inactive:true,code:'42501'},
   {name:'foreign line cannot change either invoice',foreign:true,code:'23514'},
   {name:'anonymous cannot execute the save command',role:'anon',code:'42501'},
   {name:'service role cannot replace an authorized staff command',role:'service_role',code:'42501'},
  ])await t.test(c.name,async()=>{
   const invoice=randomUUID(),party=randomUUID(),actor=randomUUID(),retained=randomUUID(),removed=randomUUID(),foreign=randomUUID(),otherInvoice=randomUUID();
   await query(`savepoint fixture;
    insert into auth.users(id,email,raw_user_meta_data)values('${actor}','${actor}@example.invalid','{}');
    insert into public.profiles(id,email,full_name,status)values('${actor}','${actor}@example.invalid','Invoice edit synthetic','${c.inactive?'disabled':'active'}')
     on conflict(id)do update set status=excluded.status;
    insert into public.employee_records(auth_user_id,legal_name,employment_status,is_active)values('${actor}','Invoice edit synthetic','active',true);
    insert into public.user_roles(user_id,role_id)select '${actor}',id from public.roles where name='owner';
    ${c.organization?`insert into public.organizations(id,name)values('${party}','INVOICE_EDIT_${invoice}')`:
     `insert into public.customers(id,display_name)values('${party}','INVOICE_EDIT_${invoice}')`};
    insert into public.invoices(id,invoice_number,customer_id,organization_id,status,subtotal_cents,total_cents,balance_due_cents,sent_at,updated_at)
     values('${invoice}','INVOICE_EDIT_${invoice}',${c.organization?'null':literal(party)},${c.organization?literal(party):'null'},'sent',1500,1500,1500,clock_timestamp(),'2026-10-01T00:00:00.123456Z');
    insert into public.invoice_line_items(id,invoice_id,name,quantity,unit_price_cents,total_cents,sort_order)
     values('${retained}','${invoice}','Original retained',1,1000,1000,0),('${removed}','${invoice}','Original removed',1,500,500,1)`);
   if(c.inactive)await query(`update employee_records set employment_status='inactive',is_active=false where auth_user_id='${actor}'`);
   if(c.status==='paid')await query(`update invoices set status='paid',balance_due_cents=0 where id='${invoice}'`);
   if(c.status==='void')await query(`set local role authenticated;set local request.jwt.claims=${literal(JSON.stringify({role:'authenticated',sub:actor}))};
    select public.finalize_invoice_void('${invoice}',(public.begin_invoice_void('${invoice}')->>'token')::uuid);
    reset role;set local request.jwt.claims='{}'`);
   if(c.partial||c.pending)await query(`insert into public.payments(invoice_id,customer_id,organization_id,amount_cents,total_collected_cents,surcharge_cents,currency,payment_method,provider,status)
    values('${invoice}',${c.organization?'null':literal(party)},${c.organization?literal(party):'null'},400,400,0,'usd','cash','manual','${c.pending?'pending':'succeeded'}')`);
   if(c.checkout)await query(`insert into public.invoice_checkout_sessions(invoice_id,customer_id,amount_cents,invoice_principal_cents,surcharge_cents,total_charge_cents,currency,payment_channel,status,processing_expires_at)
    values('${invoice}','${party}',1500,1500,0,1500,'usd','card','${c.checkout}',clock_timestamp()+interval '10 minutes')`);
   if(c.foreign)await query(`insert into public.invoices(id,invoice_number,customer_id,status,subtotal_cents,total_cents,balance_due_cents)
    values('${otherInvoice}','INVOICE_EDIT_OTHER_${invoice}','${party}','draft',700,700,700);
    insert into public.invoice_line_items(id,invoice_id,name,quantity,unit_price_cents,total_cents,sort_order)
    values('${foreign}','${otherInvoice}','Other invoice line',1,700,700,0)`);
   const initial=await json(`select jsonb_build_object('revision',updated_at,'total',total_cents)from invoices where id='${invoice}'`);
   const codes=[];let lost=Boolean(c.lost),throws=Boolean(c.throwAfter);
   async function rpc(name,args){
    assert.equal(name,'save_invoice_details');
    const statement=`select public.save_invoice_details(${literal(args.p_invoice_id)},${literal(args.p_expected_updated_at)},${literal(args.p_due_at)},${literal(JSON.stringify(args.p_lines))}::jsonb)`;
    const rows=await query(`set local role ${c.role??'authenticated'};set local request.jwt.claims=${literal(JSON.stringify({role:c.role??'authenticated',sub:actor}))};
     select 'RESULT:'||pg_temp.capture_json(${literal(statement)})::text;reset role`);
    const r=JSON.parse(rows.find(row=>row.startsWith('RESULT:')).slice(7));if(r.error)codes.push(r.error.code);
    if(lost){lost=false;return{data:null,error:null};}if(throws){throws=false;throw Error('Synthetic response lost after SQL');}return r;
   }
   const f=invoiceEditFixture({id:invoice,retainedId:c.foreign?foreign:retained,version:c.stale?'2026-09-01T00:00:00.000000Z':initial.revision,organization:c.organization,rpc});
   let result=await f.run();
   if(c.code){assert.equal(result.status,'error');assert.deepEqual(codes,[c.code]);assert.deepEqual(f.paths,[]);}
   else if(c.lost||c.throwAfter){
    assert.equal(result.status,'error');assert.deepEqual(f.paths,[]);assert.equal(f.calls.length,1);
    result=await f.run();assert.equal(result.status,'error');assert.deepEqual(codes,['40001']);assert.equal(f.calls.length,2);
   }else{
    assert.equal(result.status,'success');assert.equal(result.savedLineIds['retained-client'],retained);assert.ok(result.savedLineIds['new-client']);assert.equal(f.calls.length,1);assert.deepEqual(codes,[]);
    const revision=await json(`select to_jsonb(updated_at)from invoices where id='${invoice}'`);assert.equal(result.savedUpdatedAt,revision);
    if(c.again){
     f.form.set('expected_updated_at',result.savedUpdatedAt);f.form.delete('invoice_line_item_id');
     for(const id of [retained,result.savedLineIds['new-client']])f.form.append('invoice_line_item_id',id);
     const next=await f.run();assert.equal(next.status,'success');assert.deepEqual(next.savedLineIds,result.savedLineIds);assert.equal(f.calls.length,2);
    }
   }
   const state=await json(`select jsonb_build_object('total',i.total_cents,'balance',i.balance_due_cents,'customer',i.customer_id,'organization',i.organization_id,
    'lines',(select jsonb_agg(jsonb_build_object('id',id,'name',name,'total',total_cents)order by sort_order)from invoice_line_items where invoice_id=i.id),
    'audit',(select count(*)from activity_log where subject_id=i.id and event_type='invoice_updated'),
    'payments',(select count(*)from payments where invoice_id=i.id),'sources',(select count(*)from app_private.customer_source_events where event->>'subject_id'=i.id::text))from invoices i where id='${invoice}'`);
   assert.equal(state.total,1500);assert.equal(state.balance,c.partial?1100:c.status==='paid'?0:1500);
   assert.equal(state.customer,c.organization?null:party);assert.equal(state.organization,c.organization?party:null);
   assert.equal(state.lines.length,2);assert.equal(state.audit,c.code?0:c.again?2:1);assert.equal(state.payments,c.partial||c.pending?1:0);assert.equal(state.sources,0);
   assert.equal(state.lines.some(line=>line.id===removed),Boolean(c.code));
   if(c.foreign)assert.equal(await json(`select to_jsonb(total_cents)from invoice_line_items where id='${foreign}'`),700);
   proof.push({name:c.name,pass:true,commandCalls:f.calls.length,expectedSqlRejections:codes,audits:state.audit,lines:state.lines.length});
   await query('rollback to savepoint fixture;release savepoint fixture');
   assert.equal(await json(`select to_jsonb(count(*))from invoices where id='${invoice}'`),0);
  });
  await query('rollback');
 }finally{if(!exited){try{await query('rollback');}catch{}}child.stdin.end();reader.close();}
 if(process.env.INVOICE_EDIT_RESULTS)writeFileSync(process.env.INVOICE_EDIT_RESULTS,JSON.stringify(proof,null,2)+'\n');
});
