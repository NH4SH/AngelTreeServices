import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID,createHash} from 'node:crypto';
import {readyDb,q,role,admin,service,request,rehash,prepare,priceRequest,inspect,source,owner,officeSQL,void102SQL} from './fixtures/firewood-office-db.mjs';
import {liveHandoffDigest} from '../src/lib/firewood/handoff/live-contract.mjs';
test('office boundary compiles in isolation, starts closed and denies every direct API role',async()=>{
 const db=await readyDb();try{
 const tables=await q(db,"select c.relname name,c.relrowsecurity rls,has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') a,has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') u,has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE')s from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='app_private'and(c.relname like'firewood_live_office_%'or c.relname='firewood_live_order_workflows')and c.relkind='r'");
 assert.equal(tables.length,4);for(const row of tables){assert.equal(row.rls,true);assert.equal(row.a,false);assert.equal(row.u,false);assert.equal(row.s,false);}
 const rows=await q(db,'select collector_enabled,surcharge_reporting_enabled,sender_enabled from app_private.firewood_live_handoff_sources');assert.deepEqual(rows[0],{collector_enabled:false,surcharge_reporting_enabled:false,sender_enabled:false});
 await assert.rejects(service(db,'select public.list_firewood_live_office()'),/permission denied/);
 await assert.rejects(role(db,'authenticated','select public.list_firewood_live_office()',[],{user:owner}),/owner or admin/);
 assert.doesNotMatch(officeSQL,/supabase_migrations|insert into app_private\.firewood_live_handoff_sources|update public\.invoices|stripe\.(refund|payment)|http_post/i);
 }finally{await db.close();}
});

test('immutable website draft is genuinely approved by an active CRM actor and returns only its bound offer',async()=>{
 const db=await readyDb();try{
 const value=request(),draft={quantity:value.order.quantity,stacking:value.order.stacking,contact:value.order.contact},hash=liveHandoffDigest(draft);
 const pending=await priceRequest(db,value);assert.equal(pending.status,'pending');assert.equal(pending.revision,1);assert.equal(pending.approval,null);
 const again=await priceRequest(db,value);assert.deepEqual(again,pending);
 const changed=structuredClone(draft);changed.contact.address='2 Changed Fixture Lane';
 await assert.rejects(service(db,'select public.request_firewood_live_office_price($1,$2,$3,$4,$5)',[source,value.order_id,value.reference,liveHandoffDigest(changed),changed]),/identity changed/);
 const id=randomUUID(),args=[value.order_id,1,42750,14250,'Verified residential veterans price before purchase',id];
 await assert.rejects(service(db,'select public.approve_firewood_live_office_request($1,$2,$3,$4,$5,$6)',args),/permission denied/);
 await assert.rejects(role(db,'authenticated','select public.approve_firewood_live_office_request($1,$2,$3,$4,$5,$6)',args,{user:owner}),/owner or admin/);
 const approved=(await admin(db,'select public.approve_firewood_live_office_request($1,$2,$3,$4,$5,$6)value',args))[0].value;
 assert.equal(approved.revision,2);assert.equal(approved.status,'approved');assert.deepEqual(approved.prices,{wood_cents:42750,stacking_cents:14250,principal_cents:57000});
 assert.deepEqual((await admin(db,'select public.approve_firewood_live_office_request($1,$2,$3,$4,$5,$6)value',args))[0].value,approved);
 await assert.rejects(admin(db,'select public.approve_firewood_live_office_request($1,$2,$3,$4,$5,$6)',[...args.slice(0,4),'Changed price reason',id]),/identity changed/);
 const receipt=(await service(db,'select public.read_firewood_live_office_price($1,$2,$3)value',[source,value.order_id,hash]))[0].value;
 assert.deepEqual(receipt,approved);assert.equal('contact'in receipt,false);assert.equal('draft'in receipt,false);
 const inspected=await inspect(db,value);assert.equal(inspected.order.contact.email,value.order.contact.email);assert.equal(inspected.price_request.approval.approval_id,approved.approval.approval_id);
 const{expires_at,...assertion}=approved.approval;value.order.office_approval=assertion;value.order.wood_cents=42750;value.order.stacking_cents=14250;value.order.principal_cents=57000;value.order.accepted_at_ms=Date.now();
 const accepted=await prepare(db,rehash(value));assert.equal(accepted.principal_cents,57000);
 await assert.rejects(admin(db,'select public.revoke_firewood_live_office_request($1,$2,$3,$4)',[value.order_id,2,'Rescind',randomUUID()]),/Accepted price is frozen/);
 assert.equal((await q(db,'select count(*)::integer n from public.invoices'))[0].n,1);
 }finally{await db.close();}
});

test('price revocation and office paging retain all history and deny stale changed authority',async()=>{
 const db=await readyDb();try{
 const values=[request(),request(),request()];for(const value of values)await priceRequest(db,value);
 const args=[values[0].order_id,1,45000,15000,'Office-reviewed price',randomUUID()];
 const approved=(await admin(db,'select public.approve_firewood_live_office_request($1,$2,$3,$4,$5,$6)value',args))[0].value;
 const revoke=[values[0].order_id,approved.revision,'Customer changed plans before acceptance',randomUUID()];
 const result=(await admin(db,'select public.revoke_firewood_live_office_request($1,$2,$3,$4)value',revoke))[0].value;
 assert.equal(result.status,'revoked');assert.equal(result.approval,null);assert.equal(result.prices,null);
 assert.deepEqual((await admin(db,'select public.revoke_firewood_live_office_request($1,$2,$3,$4)value',revoke))[0].value,result);
 await assert.rejects(admin(db,'select public.approve_firewood_live_office_request($1,$2,$3,$4,$5,$6)',[values[0].order_id,1,45000,15000,'Cannot resurrect',randomUUID()]),/review changed/);
 const first=(await admin(db,'select public.list_firewood_live_office($1,$2)value',[1,2]))[0].value,second=(await admin(db,'select public.list_firewood_live_office($1,$2)value',[2,2]))[0].value;
 assert.equal(first.total_count,3);assert.equal(first.items.length,2);assert.equal(second.items.length,1);assert.equal(new Set([...first.items,...second.items].map(x=>x.order_id)).size,3);
 for(const sql of['delete from app_private.firewood_live_office_requests','delete from app_private.firewood_live_office_receipts','delete from app_private.firewood_live_office_events',"update app_private.firewood_live_office_requests set draft='{}'"])await assert.rejects(db.exec(sql),/immutable/);
 }finally{await db.close();}
});

const cancelRequest=async(db,receipt,revision=0,reason='customer_request')=>(await admin(db,'select public.request_firewood_live_cancellation($1,$2,$3,$4,$5)value',[receipt.invoice_id,revision,reason,'Office recorded the actual customer/company request',randomUUID()]))[0].value;
const delivery=async(db,receipt,revision,start,end=new Date(Date.parse(start)+7200000).toISOString())=>(await admin(db,'select public.record_firewood_live_delivery($1,$2,$3,$4,$5,$6)value',[receipt.invoice_id,revision,start,end,'Agreed with customer by phone; office verified the window',randomUUID()]))[0].value;
const confirm=async(db,receipt,view,key=randomUUID())=>(await admin(db,'select public.confirm_firewood_live_cancellation($1,$2,$3,$4)value',[receipt.invoice_id,view.lifecycle.revision,view.financial.ledger_hash,key]))[0].value;

test('unscheduled cancellation immediately holds collection and fulfillment and confirms once without money writes',async()=>{
 const db=await readyDb();try{
 const value=request(),receipt=await prepare(db,value),before=(await q(db,'select to_jsonb(i)row from public.invoices i where id=$1',[receipt.invoice_id]))[0].row;
 await db.exec('update app_private.firewood_live_handoff_sources set collector_enabled=true,surcharge_reporting_enabled=true');
 const requested=await cancelRequest(db,receipt);assert.equal(requested.state,'cancellation_requested');assert.equal(requested.revision,1);assert.equal(requested.refund_eligibility,'full');
 assert.ok(Date.now()-Date.parse(requested.requested_at)<10000);
 const ctx=(await service(db,'select public.get_firewood_live_collector_context($1)value',[receipt.invoice_id]))[0].value;assert.equal(ctx.allowed,false);assert.equal(ctx.order_state,'cancellation_requested');
 const replay=await prepare(db,value);assert.equal(replay.invoice_id,receipt.invoice_id);assert.equal(replay.payment_execution_ready,false);assert.deepEqual(replay.execution_blockers,['order_cancellation_hold']);
 const ledger=(await service(db,'select public.read_firewood_live_handoff($1,$2,$3,$4)value',[source,value.order_id,receipt.invoice_id,value.snapshot_hash]))[0].value;
 assert.deepEqual(ledger.workflow,{state:'cancellation_requested',revision:1,collection_held:true,fulfillment_held:true});
 const publicWorkflow=(await service(db,'select public.get_firewood_live_order_workflow($1,$2,$3,$4)value',[source,value.order_id,receipt.invoice_id,value.snapshot_hash]))[0].value;
 assert.equal(publicWorkflow.collection_held,true);for(const key of['contact','cancellation_reason','delivery_evidence','financial'])assert.equal(key in publicWorkflow,false);
 const view=await inspect(db,value);assert.equal(view.can_confirm,true);assert.equal(view.financial_disposition,'no_refund_due');
 const id=randomUUID(),result=await confirm(db,receipt,view,id);assert.equal(result.state,'cancelled');assert.equal(result.revision,2);
 assert.deepEqual(await confirm(db,receipt,view,id),result);
 assert.deepEqual((await q(db,'select to_jsonb(i)row from public.invoices i where id=$1',[receipt.invoice_id]))[0].row,{...before,status:'void'});
 assert.equal((await inspect(db,value)).financial.invoice_status,'void');
 assert.equal((await q(db,'select count(*)::integer n from app_private.invoice_void_leases'))[0].n,0);
 assert.equal((await q(db,'select count(*)::integer n from public.payments'))[0].n,0);
 await assert.rejects(q(db,"insert into public.invoice_checkout_sessions(invoice_id,status)values($1,'creating')",[receipt.invoice_id]),/cannot start/);
 await assert.rejects(delivery(db,receipt,2,new Date(Date.now()+86400000).toISOString()),/workflow changed/);
 await assert.rejects(db.exec("update app_private.firewood_live_order_workflows set state='active',revision=revision+1"),/immutable/);
 }finally{await db.close();}
});

test('48-hour policy uses the agreed immutable window and server request time, including company exceptions',async()=>{
 const db=await readyDb();try{
 for(const[item,hours,reason,expected]of[['early',49,'customer_request','full'],['late',47,'customer_request','non_refundable'],['company',1,'angel_cancelled','full'],['cannot',1,'cannot_fulfill','full'],['reschedule',1,'declined_angel_reschedule','full']]){
 const value=request(),receipt=await prepare(db,value),at=new Date(Date.now()+hours*3600000).toISOString();await delivery(db,receipt,0,at);
 const result=await cancelRequest(db,receipt,1,reason);assert.equal(result.refund_eligibility,expected,item);
 await assert.rejects(delivery(db,receipt,2,new Date(Date.now()+100*3600000).toISOString()),/workflow changed/);
 const view=await inspect(db,value);assert.equal(Date.parse(view.lifecycle.delivery_window_start),Date.parse(at));
 }
 const value=request(),receipt=await prepare(db,value);
 await assert.rejects(delivery(db,receipt,0,'infinity','infinity'),/window and evidence/);
 assert.equal((await inspect(db,value)).lifecycle.state,'active');
 }finally{await db.close();}
});

test('in-flight bank/checkout and genuine refund evidence remain writable but prevent premature final cancellation',async()=>{
 const db=await readyDb();try{
 const value=request(),receipt=await prepare(db,value),payment=randomUUID(),attempt=randomUUID();
 await q(db,"insert into public.invoice_checkout_sessions(id,invoice_id,status,stripe_payment_intent_id)values($1,$2,'processing','pi_inflight_office')",[attempt,receipt.invoice_id]);
 await q(db,"insert into public.payments(id,invoice_id,amount_cents,total_collected_cents,surcharge_cents,status,provider,provider_payment_id)values($1,$2,60000,61800,1800,'pending','stripe','pi_inflight_office')",[payment,receipt.invoice_id]);
 const requested=await cancelRequest(db,receipt);let view=await inspect(db,value);assert.equal(view.financial_disposition,'awaiting_settlement');assert.equal(view.can_confirm,false);await assert.rejects(confirm(db,receipt,view),/needs review/);
 await q(db,"update public.invoice_checkout_sessions set status='completed'where id=$1",[attempt]);
 await q(db,"update public.payments set status='succeeded',succeeded_at=clock_timestamp()where id=$1",[payment]);await q(db,"update public.invoices set status='paid',balance_due_cents=0 where id=$1",[receipt.invoice_id]);
 view=await inspect(db,value);assert.equal(view.financial_disposition,'refund_review');assert.equal(view.can_confirm,false);const original=(await q(db,'select original_paid_evidence proof from app_private.firewood_live_handoffs where invoice_id=$1',[receipt.invoice_id]))[0].proof;
 await q(db,"insert into app_private.stripe_refund_observations values('re_office_pending',$1,61800,'usd','pending')",[payment]);view=await inspect(db,value);assert.equal(view.financial_disposition,'awaiting_refund');await assert.rejects(confirm(db,receipt,view),/needs review/);
 await q(db,"update app_private.stripe_refund_observations set status='succeeded'where refund_id='re_office_pending'");await q(db,"update public.payments set status='refunded',refunded_principal_cents=60000,refunded_surcharge_cents=1800 where id=$1",[payment]);await q(db,"update public.invoices set balance_due_cents=60000 where id=$1",[receipt.invoice_id]);
 const after=await inspect(db,value);assert.equal(after.financial_disposition,'billing_closure_required');assert.equal(after.can_confirm,false);assert.deepEqual((await q(db,'select original_paid_evidence proof from app_private.firewood_live_handoffs where invoice_id=$1',[receipt.invoice_id]))[0].proof,original);
 await assert.rejects(confirm(db,receipt,view),/observation changed/);await assert.rejects(confirm(db,receipt,after),/needs review/);assert.equal((await inspect(db,value)).lifecycle.state,'cancellation_requested');
 assert.equal((await q(db,'select count(*)::integer n from public.payments'))[0].n,1);assert.equal((await q(db,'select count(*)::integer n from app_private.stripe_refund_observations'))[0].n,1);
 }finally{await db.close();}
});

test('retained office order review remains accessible while new-source and collector admission are paused',async()=>{
 const db=await readyDb();try{
 const value=request(),receipt=await prepare(db,value);await db.exec('update app_private.firewood_live_handoff_sources set enabled=false');
 assert.equal((await inspect(db,value)).order.invoice_id,receipt.invoice_id);assert.equal((await cancelRequest(db,receipt)).state,'cancellation_requested');
 const listed=(await admin(db,'select public.list_firewood_live_office()value'))[0].value;assert.equal(listed.total_count,1);
 const view=await inspect(db,value);assert.equal((await confirm(db,receipt,view)).state,'cancelled');
 await assert.rejects(service(db,'select public.get_firewood_live_order_workflow($1,$2,$3,$4)',[source,value.order_id,receipt.invoice_id,value.snapshot_hash]),/source unavailable/);
 }finally{await db.close();}
});

test('cancellation hold blocks reopening checkout but retains late provider success on an existing closed reservation',async()=>{
 const db=await readyDb();try{
 const value=request(),receipt=await prepare(db,value),attempt=randomUUID();
 await q(db,"insert into public.invoice_checkout_sessions(id,invoice_id,status,stripe_payment_intent_id)values($1,$2,'failed','pi_late_after_cancel')",[attempt,receipt.invoice_id]);
 await cancelRequest(db,receipt);
 await assert.rejects(q(db,"update public.invoice_checkout_sessions set status='creating'where id=$1",[attempt]),/cannot be reopened/);
 await q(db,"update public.invoice_checkout_sessions set status='processing'where id=$1",[attempt]);
 assert.equal((await inspect(db,value)).can_confirm,false);
 await q(db,"update public.invoice_checkout_sessions set status='completed'where id=$1",[attempt]);
 await q(db,"insert into public.payments(invoice_id,amount_cents,total_collected_cents,surcharge_cents,status,provider,provider_payment_id,succeeded_at)values($1,60000,61800,1800,'succeeded','stripe','pi_late_after_cancel',clock_timestamp())",[receipt.invoice_id]);
 await q(db,"update public.invoices set status='paid',balance_due_cents=0 where id=$1",[receipt.invoice_id]);
 const view=await inspect(db,value);assert.equal(view.financial_disposition,'refund_review');assert.equal(view.can_confirm,false);assert.equal(view.lifecycle.state,'cancellation_requested');
 }finally{await db.close();}
});

test('recent office history is bounded and ordered without deleting retained audit records',async()=>{
 const db=await readyDb();try{
 const value=request(),receipt=await prepare(db,value);
 for(let i=0;i<25;i++)await q(db,"insert into app_private.firewood_live_office_events(order_id,invoice_id,revision,operation,actor_id,details,created_at)values($1,$2,$3,'synthetic_history',$4,$5,clock_timestamp()+$3::integer*interval'1 second')",[value.order_id,receipt.invoice_id,i+1,owner,{sequence:i}]);
 const view=await inspect(db,value);assert.equal(view.events.length,20);assert.deepEqual(view.events.map(e=>e.details.sequence),Array.from({length:20},(_,i)=>i+5));
 assert.equal((await q(db,'select count(*)::integer n from app_private.firewood_live_office_events where order_id=$1',[value.order_id]))[0].n,25);
 assert.equal((await q(db,"select count(*)::integer n from pg_indexes where schemaname='app_private'and indexname='firewood_live_office_events_recent'"))[0].n,1);
 }finally{await db.close();}
});

test('the clean cancellation fixture executes exact retained 102 financial functions rather than success stubs',async()=>{
 const db=await readyDb();try{
 const hashes=[...void102SQL.matchAll(/-- ([a-z_]+)\.([a-z_]+) definition SHA256 ([a-f0-9]{64})/g)];assert.equal(hashes.length,7);
 for(const [,schema,name,expected]of hashes){const definition=(await q(db,'select pg_get_functiondef(p.oid)definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=$1 and p.proname=$2',[schema,name]))[0].definition;assert.equal(createHash('sha256').update(definition).digest('hex'),expected,name);}
 const value=request(),receipt=await prepare(db,value);
 await assert.rejects(admin(db,'select public.begin_invoice_void($1)value',[receipt.invoice_id]).then(async result=>admin(db,'select public.finalize_invoice_void($1,$2)',[receipt.invoice_id,result[0].value.token])),/coordinated cancellation/);
 assert.equal((await q(db,'select status from public.invoices where id=$1',[receipt.invoice_id]))[0].status,'sent');
 }finally{await db.close();}
});

test('missing original void prerequisite cannot acknowledge cancellation or leave a partial financial change',async()=>{
 const db=await readyDb();try{
 const value=request(),receipt=await prepare(db,value);await cancelRequest(db,receipt);const view=await inspect(db,value);
 await db.exec('drop function public.finalize_invoice_void(uuid,uuid)');
 await assert.rejects(confirm(db,receipt,view),/prerequisites unavailable/);
 assert.equal((await inspect(db,value)).lifecycle.state,'cancellation_requested');assert.equal((await q(db,'select status from public.invoices where id=$1',[receipt.invoice_id]))[0].status,'sent');assert.equal((await q(db,'select count(*)::integer n from app_private.invoice_void_leases'))[0].n,0);
 }finally{await db.close();}
});

test('a late cancellation audit failure rolls back the original void, pending communication closure and lifecycle together',async()=>{
 const db=await readyDb();try{
 const value=request(),receipt=await prepare(db,value);await cancelRequest(db,receipt);await q(db,"insert into public.customer_communications(invoice_id,status)values($1,'pending')",[receipt.invoice_id]);
 const view=await inspect(db,value);
 await db.exec("create function app_private.fail_office_confirmation_audit()returns trigger language plpgsql as $$begin if new.operation='cancellation_confirmed'then raise exception 'Synthetic late audit failure';end if;return new;end$$;create trigger fail_office_confirmation_audit before insert on app_private.firewood_live_office_events for each row execute function app_private.fail_office_confirmation_audit();");
 await assert.rejects(confirm(db,receipt,view),/late audit failure/);
 assert.equal((await inspect(db,value)).lifecycle.state,'cancellation_requested');assert.equal((await q(db,'select status from public.invoices where id=$1',[receipt.invoice_id]))[0].status,'sent');assert.equal((await q(db,'select status from public.customer_communications where invoice_id=$1',[receipt.invoice_id]))[0].status,'pending');assert.equal((await q(db,'select count(*)::integer n from app_private.invoice_void_leases'))[0].n,0);assert.equal((await q(db,"select count(*)::integer n from public.activity_log where event_type='invoice_voided'"))[0].n,0);
 }finally{await db.close();}
});

test('historical failed or expired collection cannot be misclassified as a clean invoice void',async()=>{
 const db=await readyDb();try{
 for(const kind of['failed_payment','expired_checkout']){
 const value=request(),receipt=await prepare(db,value);
 if(kind==='failed_payment')await q(db,"insert into public.payments(invoice_id,amount_cents,total_collected_cents,surcharge_cents,status)values($1,60000,60000,0,'failed')",[receipt.invoice_id]);
 else await q(db,"insert into public.invoice_checkout_sessions(invoice_id,status)values($1,'expired')",[receipt.invoice_id]);
 await cancelRequest(db,receipt);const view=await inspect(db,value);assert.equal(view.financial.no_money_history,false);assert.equal(view.financial_disposition,'billing_closure_required');assert.equal(view.can_confirm,false);await assert.rejects(confirm(db,receipt,view),/needs review/);assert.equal((await q(db,'select status from public.invoices where id=$1',[receipt.invoice_id]))[0].status,'sent');
 }
 }finally{await db.close();}
});

test('late customer cancellation with settled payment and zero invoice balance confirms without voiding or refunding',async()=>{
 const db=await readyDb();try{
 const value=request(),receipt=await prepare(db,value);await delivery(db,receipt,0,new Date(Date.now()+24*3600000).toISOString());
 await q(db,"insert into public.payments(invoice_id,amount_cents,total_collected_cents,surcharge_cents,status,succeeded_at)values($1,60000,61800,1800,'succeeded',clock_timestamp())",[receipt.invoice_id]);await q(db,"update public.invoices set status='paid',balance_due_cents=0 where id=$1",[receipt.invoice_id]);
 await cancelRequest(db,receipt,1);const view=await inspect(db,value);assert.equal(view.lifecycle.refund_eligibility,'non_refundable');assert.equal(view.financial_disposition,'no_refund_due');assert.equal(view.can_confirm,true);assert.equal((await confirm(db,receipt,view)).state,'cancelled');assert.equal((await q(db,'select status from public.invoices where id=$1',[receipt.invoice_id]))[0].status,'paid');assert.equal((await q(db,'select count(*)::integer n from app_private.stripe_refund_observations'))[0].n,0);
 }finally{await db.close();}
});
