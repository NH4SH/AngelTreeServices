import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const migration=readFileSync(new URL('../../../supabase/migrations/20261016020444_recoverable_stripe_webhook_receipts.sql',import.meta.url),'utf8');
const boundary=readFileSync(new URL('../../../supabase/migrations/20261016010829_invoice_financial_write_boundary.sql',import.meta.url),'utf8');
function boundaryFunction(name){const start=boundary.indexOf('create function '+name);assert.ok(start>=0);return boundary.slice(start,boundary.indexOf('$$;',start)+3);}
const actor='00000000-0000-4000-8000-000000000001';
const fixture=`
 create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create schema app_private;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function app_private.has_platform_admin_role() returns boolean language sql stable as $$select current_setting('test.admin',true)='true'$$;
 create function app_private.effective_platform_access(p_id uuid) returns boolean language sql stable as $$select p_id is not null$$;
 create function app_private.has_staff_role() returns boolean language sql as $$select true$$;
 create table invoices(id uuid primary key default gen_random_uuid(),customer_id uuid,organization_id uuid,status text default 'sent',
   total_cents integer default 1000,balance_due_cents integer default 1000,paid_at timestamptz,sent_at timestamptz default now(),due_at timestamptz);
 create table invoice_checkout_sessions(id uuid primary key default gen_random_uuid(),invoice_id uuid,customer_id uuid,organization_id uuid,
   invoice_principal_cents integer default 1000,surcharge_cents integer default 0,total_charge_cents integer default 1000,currency text default 'usd',
   status text default 'open',payment_channel text default 'ach',stripe_checkout_session_id text,stripe_payment_intent_id text,stripe_confirmation_token_id text,
   card_brand text,card_funding_type text,submitted_at timestamptz,authorized_at timestamptz,completed_at timestamptz,failed_at timestamptz,processing_expires_at timestamptz);
 create table payments(id uuid primary key default gen_random_uuid(),invoice_id uuid,customer_id uuid,organization_id uuid,amount_cents integer,total_collected_cents integer,surcharge_cents integer,
   currency text,payment_method text,provider text,provider_checkout_session_id text,provider_payment_id text,provider_charge_id text,status text,
   refunded_principal_cents integer default 0,refunded_surcharge_cents integer default 0,disputed_principal_cents integer default 0,dispute_status text,
   card_brand text,card_funding_type text,stripe_fee_cents integer,net_received_cents integer,authorized_at timestamptz,submitted_at timestamptz,paid_at timestamptz,succeeded_at timestamptz,failed_at timestamptz,refunded_at timestamptz);
 create unique index payment_session_key on payments(provider_checkout_session_id) where provider='stripe' and provider_checkout_session_id is not null;
 create unique index payment_intent_key on payments(provider_payment_id) where provider='stripe' and provider_payment_id is not null;
 create table customer_communications(invoice_id uuid,status text,cancelled_at timestamptz,processing_started_at timestamptz,skip_reason text);
 create table stripe_webhook_events(event_id text primary key,event_type text not null,received_at timestamptz default now(),processed_at timestamptz);
 alter table stripe_webhook_events enable row level security;
 grant all on stripe_webhook_events to service_role;
 create table profiles(id uuid primary key,email text,status text);
 create table user_roles(user_id uuid,role_id uuid); create table roles(id uuid,name text);
 create table admin_notification_preferences(user_id uuid,payment_email_enabled boolean);
 create table activity_log(id uuid primary key default gen_random_uuid(),actor_user_id uuid,actor_type text,subject_type text,subject_id uuid,event_type text,metadata_json jsonb,
   action_category text,summary text,record_label text,destination_path text,organization_id uuid,idempotency_key text);
 create unique index activity_key on activity_log(idempotency_key) where idempotency_key is not null;
 create table admin_notifications(id uuid primary key default gen_random_uuid(),activity_id uuid,recipient_user_id uuid,organization_id uuid,
   category text,title text,body text,destination_path text,email_status text default 'pending',email_attempted_at timestamptz,unique(activity_id,recipient_user_id));
 grant select on admin_notifications to service_role;
 insert into profiles values('${actor}','fixture@example.invalid','active');
 insert into roles values('${actor}','owner');insert into user_roles values('${actor}','${actor}');
 insert into stripe_webhook_events values('evt_legacy_complete','fixture',now(),now()),('evt_legacy_pending','fixture',now(),null);
 select set_config('test.uid','${actor}',false),set_config('test.admin','true',false);
`;
test('owned Stripe receipt SQL protocol',async t=>{
 const db=new PGlite();let count=0;
 try {
  await db.exec(fixture);
  for(const name of ['app_private.invoice_paid_principal','app_private.invoice_payment_status','public.reconcile_invoice_balance'])await db.exec(boundaryFunction(name));
  await db.exec(migration);
  const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
  const claim=async(id=`evt_unit_${++count}`,type='fixture',object='obj_fixture')=>(await q("select public.claim_stripe_webhook($1,$2,$3,'2026-10-15T00:00:00Z',false) value",[id,type,object]))[0].value;
  const asServer=()=>db.exec('set role service_role');const reset=()=>db.exec('reset role');
  const read=async id=>(await q('select * from stripe_webhook_events where event_id=$1',[id]))[0];
  const expire=async id=>{await reset();await q("update stripe_webhook_events set lease_expires_at=clock_timestamp()-interval '1 second' where event_id=$1",[id]);await asServer();};
  const applyIgnored=(id,token)=>q("select public.apply_stripe_webhook($1,$2,'{\"operation\":\"ignored\"}'::jsonb)",[id,token]);
  const complete=(id,token)=>q('select public.complete_stripe_webhook($1,$2)',[id,token]);
  await t.test('historical incomplete is reclaimable, completed is preserved',async()=>{
   await asServer();assert.equal((await claim('evt_legacy_complete')).status,'completed');assert.equal((await claim('evt_legacy_pending')).status,'claimed');
  });
  await t.test('busy is distinct from durable completion',async()=>{
   const id=`evt_unit_${++count}`,a=await claim(id);assert.equal(a.status,'claimed');assert.equal((await claim(id)).status,'busy');assert.equal((await read(id)).processed_at,null);
  });
  await t.test('expired owners cannot apply, finish or release the replacement',async()=>{
   const id=`evt_unit_${++count}`,old=await claim(id);await expire(id);const next=await claim(id);
   await assert.rejects(applyIgnored(id,old.token),/ownership expired/);await assert.rejects(complete(id,old.token),/ownership expired/);
   assert.equal((await q("select public.fail_stripe_webhook($1,$2,'failed') result",[id,old.token]))[0].result,false);
   assert.equal((await read(id)).owner_token,next.token);
  });
  await t.test('only durable phase and owned completion allow an ACK',async()=>{
   const id=`evt_unit_${++count}`,c=await claim(id);await assert.rejects(complete(id,c.token),/unfinished work/);
   await applyIgnored(id,c.token);await complete(id,c.token);assert.equal((await claim(id)).status,'completed');
  });
  await t.test('an expired but unreplaced owner also has no write authority',async()=>{
   const id=`evt_unit_${++count}`,c=await claim(id);await expire(id);await assert.rejects(applyIgnored(id,c.token),/ownership expired/);
  });
  await t.test('receipt identity collisions fail closed',async()=>{
   const id=`evt_unit_${++count}`;await claim(id);
   await assert.rejects(q("select public.claim_stripe_webhook($1,'changed','obj_fixture','2026-10-15T00:00:00Z',false)",[id]),/identity conflict/);
   await assert.rejects(q("select public.claim_stripe_webhook($1,'fixture','other','2026-10-15T00:00:00Z',false)",[id]),/identity conflict/);
  });
  await t.test('attempt limit retains incomplete evidence instead of ACK or deletion',async()=>{
   const id=`evt_unit_${++count}`;await claim(id);await expire(id);await reset();await q('update stripe_webhook_events set attempts=12 where event_id=$1',[id]);await asServer();
   assert.equal((await claim(id)).status,'review');assert.equal((await read(id)).processed_at,null);
  });
  await t.test('staff and anonymous execution and direct receipt mutation are denied',async()=>{
   for(const role of ['anon','authenticated']){
    await reset();await db.exec(`set role ${role}`);await assert.rejects(claim(),/permission denied/);
    await assert.rejects(q('select * from stripe_webhook_events'),/permission denied/);
   }
   await reset();await asServer();await assert.rejects(q('delete from stripe_webhook_events'),/permission denied/);
  });
  await t.test('failure retains progress and stores only a normalized problem code',async()=>{
   const id=`evt_unit_${++count}`,c=await claim(id);await applyIgnored(id,c.token);
   await q('select public.fail_stripe_webhook($1,$2,$3)',[id,c.token,'Bearer fixture_should_not_persist']);
   const r=await read(id);assert.equal(r.phase,'effects_ready');assert.equal(r.last_problem,'processing_failed');assert.equal(r.state,'failed');
  });
  await t.test('uncertain email is never granted a second submission; late evidence is fenced',async()=>{
   const id=`evt_unit_${++count}`,c=await claim(id);await applyIgnored(id,c.token);await reset();
   const n=(await q("insert into admin_notifications(recipient_user_id,stripe_event_id,stripe_email_state,title,body) values($1,$2,'queued','Payment received','Fixture') returning id",[actor,id]))[0];
   await asServer();let result=(await q('select public.begin_stripe_notification_email($1,$2,$3) value',[id,c.token,n.id]))[0].value;assert.equal(result.status,'send');
   await expire(id);const next=await claim(id);result=(await q('select public.begin_stripe_notification_email($1,$2,$3) value',[id,next.token,n.id]))[0].value;assert.equal(result.status,'review');
   assert.equal((await q("select public.finish_stripe_notification_email($1,$2,'accepted','local_msg') result",[n.id,next.token]))[0].result,false);
   assert.equal((await q("select public.finish_stripe_notification_email($1,$2,'accepted','local_msg') result",[n.id,c.token]))[0].result,true);
   await complete(id,next.token);assert.equal((await read(id)).state,'completed');
  });
  async function financial(surcharge=0){
   await reset();const suffix=++count;
   const inv=(await q('insert into invoices(customer_id,total_cents,balance_due_cents) values($1,$2,$2) returning id',[actor,1000]))[0];
   const row=(await q('insert into invoice_checkout_sessions(invoice_id,customer_id,surcharge_cents,total_charge_cents,stripe_checkout_session_id,stripe_payment_intent_id) values($1,$2,$3,$4,$5,$6) returning id',[inv.id,actor,surcharge,1000+surcharge,`cs_unit_${suffix}`,`pi_unit_${suffix}`]))[0];
   await asServer();const id=`evt_money_${suffix}`,owned=await claim(id,'checkout.session.completed',`cs_unit_${suffix}`);
   return {id,token:owned.token,invoice:inv.id,evidence:{operation:'succeeded',reservation_id:row.id,invoice_id:inv.id,session_id:`cs_unit_${suffix}`,intent_id:`pi_unit_${suffix}`,charge_id:`ch_unit_${suffix}`,amount_cents:1000+surcharge,currency:'usd',refund_gross_cents:0}};
  }
  const apply=f=>q('select public.apply_stripe_webhook($1,$2,$3) value',[f.id,f.token,f.evidence]);
  const money=async f=>{await reset();const v=(await q('select * from payments where invoice_id=$1',[f.invoice]))[0];await asServer();return v;};
  const balance=async f=>{await reset();const v=(await q('select balance_due_cents from invoices where id=$1',[f.invoice]))[0].balance_due_cents;await asServer();return v;};
  await t.test('atomic apply records money, checkout, balance, activity, inbox and a durable progress checkpoint',async()=>{
   const f=await financial();await apply(f);assert.equal((await money(f)).status,'succeeded');assert.equal(await balance(f),0);
   assert.equal((await read(f.id)).phase,'effects_ready');assert.equal((await read(f.id)).processed_at,null);
   await reset();assert.equal((await q('select count(*)::integer n from admin_notifications where stripe_event_id=$1',[f.id]))[0].n,1);await asServer();
  });
  await t.test('an audit/inbox failure after balance derivation rolls the complete apply back',async()=>{
   const f=await financial();await reset();await q(`alter table activity_log add constraint fail_financial_audit check(subject_id<>'${f.invoice}'::uuid or event_type<>'customer_payment_succeeded') not valid`);await asServer();
   try {await assert.rejects(apply(f),/fail_financial_audit/);assert.equal(await money(f),undefined);assert.equal(await balance(f),1000);assert.equal((await read(f.id)).phase,'pending');}
   finally{await reset();await db.exec('alter table activity_log drop constraint fail_financial_audit');await asServer();}
  });
  await t.test('replayed success and stale pending/failed evidence cannot demote durable money',async()=>{
   const f=await financial();await apply(f);const first=await money(f);
   for(const operation of ['succeeded','pending','failed']){
    const id=`evt_money_${++count}`,c=await claim(id,'checkout.session.completed',f.evidence.session_id);
    await apply({...f,id,token:c.token,evidence:{...f.evidence,operation}});
   }
   assert.equal((await money(f)).id,first.id);assert.equal((await money(f)).status,'succeeded');assert.equal(await balance(f),0);
   await reset();assert.equal((await q("select count(*)::integer n from activity_log where subject_id=$1 and event_type='customer_payment_succeeded'",[f.invoice]))[0].n,1);await asServer();
  });
  await t.test('refund allocation excludes surcharge principal; decreased snapshots stay unresolved',async()=>{
   const f=await financial(30);await apply(f);
   for(const gross of [515,200,1030]){
    const id=`evt_refund_${++count}`,c=await claim(id,'charge.refunded',f.evidence.charge_id);
    const attempt={...f,id,token:c.token,evidence:{operation:'refund',charge_id:f.evidence.charge_id,amount_cents:1030,currency:'usd',refund_gross_cents:gross}};
    if(gross===200) await assert.rejects(apply(attempt),/Refund snapshot decreased/);
    else await apply(attempt);
    if(gross!==1030){const p=await money(f);assert.equal(p.refunded_principal_cents,500);assert.equal(p.refunded_surcharge_cents,15);assert.equal(await balance(f),500);}
   }
   const id=`evt_success_${++count}`,c=await claim(id,'checkout.session.completed',f.evidence.session_id);
   await apply({...f,id,token:c.token,evidence:{...f.evidence,refund_gross_cents:1030}});
   assert.equal((await money(f)).status,'refunded');assert.equal((await money(f)).refunded_principal_cents,1000);assert.equal(await balance(f),1000);
  });
 } finally {await db.close();}
});
