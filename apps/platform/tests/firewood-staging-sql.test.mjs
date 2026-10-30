import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {FIREWOOD_STAGING as stage} from '../src/lib/firewood/handoff/staging-profile.mjs';
const install=readFileSync(new URL('../../../supabase/staging/firewood-v2/migrations/20261030004004_firewood_v2_staging_boundary.sql',import.meta.url),'utf8');
const body=install.split('-- BEGIN REVIEWED INSTALL BODY')[1];
const fixture=`
create role anon;create role authenticated;create role service_role bypassrls;
create schema auth;create schema app_private;revoke all on schema app_private from public;
grant usage on schema auth to anon,authenticated,service_role;
create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create table public.customers(id uuid primary key default gen_random_uuid());
create table public.service_locations(id uuid primary key default gen_random_uuid());
create table public.invoices(id uuid primary key default gen_random_uuid(),invoice_number text,customer_id uuid,organization_id uuid,service_location_id uuid,job_id uuid,total_cents integer,subtotal_cents integer,tax_cents integer,balance_due_cents integer,status text,automatic_reminders_enabled boolean default false,document_terms_version text constraint invoices_document_terms_version_known check(document_terms_version in('legacy-2026-10-22','firewood-household-2026-10-24')));
create table public.invoice_portal_tokens(id uuid primary key default gen_random_uuid(),invoice_id uuid,customer_id uuid,organization_id uuid,token_hash text,token_hint text,token_encrypted text,expires_at timestamptz,revoked_at timestamptz,created_by_user_id uuid);
create table public.invoice_line_items(id uuid primary key default gen_random_uuid(),invoice_id uuid);
create table public.payments(id uuid primary key default gen_random_uuid(),invoice_id uuid,amount_cents integer,total_collected_cents integer,surcharge_cents integer,status text,succeeded_at timestamptz,refunded_principal_cents integer default 0,refunded_surcharge_cents integer default 0,dispute_status text);
create table public.invoice_checkout_sessions(id uuid primary key default gen_random_uuid(),invoice_id uuid,status text);
create table app_private.stripe_refund_observations(refund_id text primary key,payment_id uuid,amount_cents integer,currency text,status text);
`;
const ids={customer:'11111111-1111-4111-8111-111111111111',invoice:'22222222-2222-4222-8222-222222222222',token:'33333333-3333-4333-8333-333333333333',order:'44444444-4444-4444-8444-444444444444',payment:'55555555-5555-4555-8555-555555555555'};
const q=async(db,sql,values=[]) => (await db.query(sql,values)).rows;
async function service(db,sql,values=[]){await db.exec('set role service_role');try{return await q(db,sql,values);}finally{await db.exec('reset role');}}
test('managed installation refuses an unreviewed database before creating anything',async()=>{const db=new PGlite();try{await assert.rejects(db.exec(install),/reviewed staging target/);assert.equal((await q(db,"select to_regclass('app_private.firewood_handoffs') is null absent"))[0].absent,true);}finally{await db.close();}});
test('reviewed staging install has service-only commands, immutable history and refund-aware CAS',async t=>{
 const db=new PGlite();try{
  await db.exec(fixture);await db.exec('begin');await db.exec(body);await db.exec('commit');
  await t.test('no source is installed enabled; only the exact staging environment may be inserted',async()=>{
   assert.equal((await q(db,'select count(*)::integer n from app_private.firewood_handoff_sources'))[0].n,0);
   await assert.rejects(q(db,'insert into app_private.firewood_handoff_sources(id,stripe_account_id,environment_id)values($1,$2,$3)',[stage.sourceId,stage.accountId,'ats_fwhandoff_home_123456abcdef']),/check constraint/);
   await q(db,'insert into app_private.firewood_handoff_sources(id,stripe_account_id,environment_id)values($1,$2,$3)',[stage.sourceId,stage.accountId,stage.environmentId]);
   assert.deepEqual((await q(db,'select enabled,collector_enabled,surcharge_reporting_enabled from app_private.firewood_handoff_sources'))[0],{enabled:false,collector_enabled:false,surcharge_reporting_enabled:false});
  });
  await t.test('old terms remain valid and unknown terms stay rejected',async()=>{for(const terms of ['legacy-2026-10-22','firewood-household-2026-10-24','firewood-handoff-test-2026-10-29'])await q(db,'insert into public.invoices(document_terms_version)values($1)',[terms]);await assert.rejects(q(db,"insert into public.invoices(document_terms_version)values('unknown')"),/check constraint/);});
  await t.test('private tables retain RLS with no direct client or service rights; only service may invoke six public commands',async()=>{
   const tables=await q(db,"select c.relrowsecurity rls,has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') anonymous,has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') authenticated,has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE') service from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='app_private'and c.relname like 'firewood_handoff%'and c.relkind='r'");assert.equal(tables.length,4);for(const row of tables)assert.deepEqual(row,{rls:true,anonymous:false,authenticated:false,service:false});
   const routines=await q(db,"select n.nspname schema,has_function_privilege('anon',p.oid,'EXECUTE') anonymous,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,has_function_privilege('service_role',p.oid,'EXECUTE') service from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','app_private')and(p.proname like '%firewood_handoff%'or p.proname='get_firewood_collector_context')");assert.equal(routines.length,13);assert.equal(routines.filter(r=>r.schema==='public').length,6);for(const row of routines){assert.equal(row.anonymous,false);assert.equal(row.authenticated,false);assert.equal(row.service,row.schema==='public');}
  });
  await t.test('commands reject default fixture identity and disabled sources; service role still rejects user identity',async()=>{
   await assert.rejects(q(db,'select public.get_firewood_handoff_context($1)',[stage.sourceId]),/server operation only/);await assert.rejects(service(db,'select public.get_firewood_handoff_context($1)',[stage.sourceId]),/source unavailable/);
   await db.exec('update app_private.firewood_handoff_sources set enabled=true');assert.deepEqual((await service(db,'select public.get_firewood_handoff_context($1) context',[stage.sourceId]))[0].context,{account_id:stage.accountId,environment_id:stage.environmentId,livemode:false});
   await db.exec("select set_config('test.uid','11111111-1111-4111-8111-111111111111',false)");await assert.rejects(service(db,'select public.get_firewood_handoff_context($1)',[stage.sourceId]),/server operation only/);await db.exec("select set_config('test.uid','',false)");
  });
  await q(db,'insert into public.customers(id)values($1)',[ids.customer]);await q(db,"insert into public.invoices(id,customer_id,invoice_number,total_cents,subtotal_cents,tax_cents,balance_due_cents,status,document_terms_version)values($1,$2,'TEST-FW2-SYNTHETIC',60000,60000,0,0,'paid','firewood-handoff-test-2026-10-29')",[ids.invoice,ids.customer]);
  await q(db,"insert into public.invoice_portal_tokens(id,invoice_id,expires_at)values($1,$2,clock_timestamp()+interval'30 minutes')",[ids.token,ids.invoice]);await q(db,"insert into app_private.firewood_handoffs(source_id,order_id,reference,payload,payload_hash,principal_cents,customer_id,invoice_id,token_id)values($1,$2,'FW-44444444',$3,$4,60000,$5,$6,$7)",[stage.sourceId,ids.order,{account_id:stage.accountId,snapshot_hash:'a'.repeat(64)},'b'.repeat(64),ids.customer,ids.invoice,ids.token]);await q(db,"insert into public.payments(id,invoice_id,amount_cents,total_collected_cents,surcharge_cents,status,succeeded_at)values($1,$2,60000,61800,1800,'succeeded',clock_timestamp())",[ids.payment,ids.invoice]);
  const args=[stage.sourceId,ids.order,ids.invoice,'a'.repeat(64)];
  await t.test('pending refund changes the complete ledger and blocks stale paid observation before a new revision',async()=>{
   const before=(await service(db,'select public.read_firewood_handoff($1,$2,$3,$4) value',args))[0].value,financial={totals:{invoice_principal_cents:60000,balance_due_cents:0}};await service(db,'select public.record_firewood_handoff_observation($1,$2,$3,$4,$5,$6)',[...args,before.ledger_hash,financial]);await q(db,"insert into app_private.stripe_refund_observations(refund_id,payment_id,amount_cents,currency,status)values('re_synthetic',$1,61800,'usd','pending')",[ids.payment]);await assert.rejects(service(db,'select public.record_firewood_handoff_observation($1,$2,$3,$4,$5,$6)',[...args,before.ledger_hash,financial]),/Financial observation changed/);
   const after=(await service(db,'select public.read_firewood_handoff($1,$2,$3,$4) value',args))[0].value;assert.notEqual(after.ledger_hash,before.ledger_hash);assert.equal(after.refunds[0].status,'pending');assert.deepEqual(after.original_paid_evidence,before.original_paid_evidence);
   const context=(await service(db,'select public.get_firewood_collector_context($1) value',[ids.invoice]))[0].value;assert.equal(context.review_required,true);assert.equal(context.allowed,false);assert.equal(context.already_paid,false);assert.equal((await q(db,'select observation_revision::integer revision from app_private.firewood_handoffs'))[0].revision,1);
  });
  await t.test('identity, original proof, events and prior observations cannot be overwritten',async()=>{for(const sql of ["update app_private.firewood_handoffs set principal_cents=1","update app_private.firewood_handoffs set original_paid_evidence='{}'","delete from app_private.firewood_handoff_payment_events","update app_private.firewood_handoff_observations set snapshot='{}'","update public.invoices set total_cents=1 where invoice_number='TEST-FW2-SYNTHETIC'"])await assert.rejects(db.exec(sql),/immutable|frozen/);});
 }finally{await db.close();}
});
