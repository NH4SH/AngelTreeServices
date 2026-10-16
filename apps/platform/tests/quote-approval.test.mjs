import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const migration=readFileSync(new URL('../../../supabase/migrations/20261016060143_atomic_quote_editing.sql',import.meta.url),'utf8');
const enforcement=readFileSync(new URL('../../../supabase/migrations/20261016060503_enforce_quote_edit_boundary.sql',import.meta.url),'utf8');
const financial=readFileSync(new URL('../../../supabase/migrations/20261016010829_invoice_financial_write_boundary.sql',import.meta.url),'utf8');
const validate=financial.slice(financial.indexOf('create function app_private.validate_invoice_lines('),financial.indexOf('create function public.create_invoice_draft('));
const actor='00000000-0000-4000-8000-000000000001',customer='00000000-0000-4000-8000-000000000002',location='00000000-0000-4000-8000-000000000003';
const fixture=`
create role anon;create role authenticated;create role service_role bypassrls;
create schema auth;create schema app_private;revoke all on schema app_private from public;
grant usage on schema auth,app_private to authenticated,service_role;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
-- Actual Auth and effective-access/RLS predicates are exercised separately in
-- the real disposable integration suite. These are explicit fixture doubles.
create function app_private.has_staff_role() returns boolean language sql stable as $$select coalesce(current_setting('test.staff',true),'false')='true'$$;
create table profiles(id uuid primary key,full_name text);
create table roles(id uuid primary key,name text);create table user_roles(user_id uuid,role_id uuid);
insert into profiles values('${actor}','Local editor');insert into roles values('${actor}','owner');insert into user_roles values('${actor}','${actor}');
create table customers(id uuid primary key,status text);create table organizations(id uuid primary key,status text);
create table service_locations(id uuid primary key,customer_id uuid,organization_id uuid);
insert into customers values('${customer}','active');insert into service_locations values('${location}','${customer}',null);
create table jobs(id uuid primary key,customer_id uuid,organization_id uuid,service_location_id uuid,status text,source_quote_id uuid,website_submission_id uuid);
create table schedule_events(id uuid primary key,event_type text,service_location_id uuid);
create table organization_contacts(id uuid primary key,organization_id uuid,is_active boolean);
create table recurring_service_plans(id uuid primary key,customer_id uuid,organization_id uuid);
create table recurring_service_occurrences(id uuid primary key,recurring_plan_id uuid,service_location_id uuid,pricing_review_status text);
create table service_recommendations(id uuid primary key,customer_id uuid,organization_id uuid,service_location_id uuid);
create table quotes(id uuid primary key default gen_random_uuid(),job_id uuid,customer_id uuid,organization_id uuid,service_location_id uuid,
 estimate_schedule_event_id uuid,estimator_user_id uuid,estimator_employee_id uuid,recipient_contact_id uuid,approval_contact_id uuid,onsite_contact_id uuid,billing_contact_id uuid,
 purchase_order_reference text,payment_terms text,customer_message text,debris_handling text,debris_handling_notes text,expires_at timestamptz,status text,
 subtotal_cents integer,tax_cents integer,total_cents integer,recurring_service_plan_id uuid,recurring_occurrence_id uuid,source_recommendation_id uuid,renewal_source_quote_id uuid,
 pricing_reviewed_at timestamptz,pricing_reviewed_by_user_id uuid,approved_at timestamptz,sent_at timestamptz,sent_method text,sent_by_user_id uuid,
 first_viewed_at timestamptz,last_viewed_at timestamptz,view_count integer default 0,automatic_follow_ups_enabled boolean default true,archived_at timestamptz,archived_by_user_id uuid,
 quote_number text,updated_at timestamptz default clock_timestamp());
create table material_catalog(id uuid primary key);
create table quote_line_items(id uuid primary key default gen_random_uuid(),quote_id uuid references quotes(id) on delete cascade,name text,description text,
 service_category_id uuid,material_id uuid references material_catalog(id),quantity numeric(10,2),unit_price_cents integer,total_cents integer,sort_order integer);
create table quote_material_requirements(id uuid primary key,quote_id uuid,quote_line_item_id uuid,material_id uuid);
create table job_closeout_scope_items(quote_line_item_id uuid);
create table invoices(quote_id uuid);create table change_orders(source_quote_id uuid,status text);create table documents(quote_id uuid);
create table activity_log(actor_user_id uuid,actor_type text,subject_type text,subject_id uuid,event_type text,metadata_json jsonb,
 organization_id uuid,action_category text,summary text,destination_path text,changes_json jsonb);
grant all on quotes,quote_line_items,jobs to authenticated;
select set_config('test.uid','${actor}',false),set_config('test.staff','true',false);
`;
const lines=(n=1000,more={})=>[{name:'Work',quantity:1,unit_price_cents:n,total_cents:n,...more}];
const approval=readFileSync(new URL('../../../supabase/migrations/20261016064442_atomic_quote_approval.sql',import.meta.url),'utf8');
const lifecycle=readFileSync(new URL('../../../supabase/migrations/20260729165208_schedule_sources_and_lead_lifecycle.sql',import.meta.url),'utf8');
const leadGuard=lifecycle.slice(lifecycle.indexOf('create or replace function public.prevent_inactive_lead_conversion()'),lifecycle.indexOf('create or replace function public.schedule_party_estimate('));
// Explicit untouched-schema stand-ins. The local integration suite exercises
// the complete historical schema, real Auth/RLS and independent row-lock waits.
const approvalFixture=`
alter table jobs alter column id set default gen_random_uuid();
alter table jobs add column archived_at timestamptz,add column archived_by_user_id uuid,add column lead_disposition text default 'active',
 add column property_manager_contact_id uuid,add column onsite_contact_id uuid,add column service_type text,add column priority text,
 add column requested_scope text,add column debris_handling text,add column debris_handling_notes text,add column recurring_service_plan_id uuid,
 add column recurring_occurrence_id uuid,add column recurring_authorization_source text;
create unique index jobs_source_quote_unique on jobs(source_quote_id) where source_quote_id is not null;
alter table material_catalog add column default_unit text default 'each';
alter table quote_material_requirements alter column id set default gen_random_uuid();
alter table quote_material_requirements add column planned_quantity numeric,add column unit text,add column is_estimated boolean,add column notes text;
create table job_material_requirements(id uuid primary key default gen_random_uuid(),job_id uuid references jobs(id),material_id uuid,
 source_quote_requirement_id uuid,planned_quantity numeric,unit text,is_estimated boolean,notes text,unique(job_id,source_quote_requirement_id));
alter table recurring_service_occurrences add column status text default 'review_needed',add column work_order_id uuid,add column renewal_quote_id uuid;
create table quote_portal_tokens(id uuid primary key default gen_random_uuid(),quote_id uuid references quotes(id),token_hash text unique,
 expires_at timestamptz,revoked_at timestamptz,used_at timestamptz);
create table customer_communications(id uuid primary key default gen_random_uuid(),quote_id uuid,status text,cancelled_at timestamptz,
 last_error text,processing_started_at timestamptz,skip_reason text);
grant select,insert,update on quote_portal_tokens,customer_communications to service_role;
`;
test('actual approval migration: atomic acceptance, safe replay, source gates and authorization',async t=>{
 const db=new PGlite();try{
  await db.exec(fixture);await db.exec(validate);await db.exec(migration);await db.exec(enforcement);await db.exec(approvalFixture);await db.exec(leadGuard);await db.exec(approval);
  const query=async(s,p=[])=>(await db.query(s,p)).rows;
  const read=async id=>(await query('select * from quotes where id=$1',[id]))[0];
  const create=async(header={},items=lines())=>read((await query('select create_quote_draft($1,$2) value',[{customer_id:customer,service_location_id:location,...header},items]))[0].value.id);
  const accept=async q=>(await query('select approve_quote($1,$2) value',[q.id,q.edit_revision]))[0].value;
  const job=async q=>(await query('select * from jobs where source_quote_id=$1',[q.id]));
  await t.test('acceptance binds the exact version and ordered work scope in one transaction',async()=>{
   const q=await create({customer_message:'Local note'},[{name:'First',description:'Scope one',quantity:1,unit_price_cents:1000,total_cents:1000},{name:'Second',quantity:2,unit_price_cents:500,total_cents:1000}]),r=await accept(q),after=await read(q.id);
   assert.equal(after.status,'approved');assert.equal(after.approved_from_revision,q.edit_revision);assert.equal(after.job_id,r.job_id);assert.equal((await job(q))[0].requested_scope,'Local note\n\nScope one\n\nSecond');assert.equal((await job(q)).length,1);
  });
  await t.test('response-loss replay keeps one job, first timestamp and one approval event',async()=>{
   const q=await create(),first=await accept(q),before=await read(q.id),again=await accept(q);assert.equal(again.replayed,true);assert.equal(again.job_id,first.job_id);assert.deepEqual(await read(q.id),before);assert.equal((await query("select * from activity_log where subject_id=$1 and event_type='quote_approved'",[q.id])).length,1);
  });
  await t.test('a later edited version and a missing version fail without work or approval',async()=>{
   const q=await create();await query("update quotes set customer_message='Later scope' where id=$1",[q.id]);await assert.rejects(accept(q),/proposal changed/);await assert.rejects(query('select approve_quote($1,null)',[q.id]),/proposal changed/);assert.equal((await job(q)).length,0);assert.equal((await read(q.id)).status,'draft');
  });
  await t.test('late audit failure rolls back job, quote, material plans and reminder cancellation',async()=>{
   await query('insert into material_catalog(id) values($1)',[actor]);const q=await create({},lines(1000,{material_id:actor}));await query("insert into customer_communications(quote_id,status) values($1,'pending')",[q.id]);
   await db.exec(`alter table activity_log add constraint approval_failure check(subject_id<>'${q.id}'::uuid or event_type<>'quote_approved') not valid`);
   try{await assert.rejects(accept(q),/check constraint/);assert.deepEqual(await read(q.id),q);assert.equal((await job(q)).length,0);assert.equal((await query('select * from quote_material_requirements where quote_id=$1',[q.id])).length,0);assert.equal((await query('select status from customer_communications where quote_id=$1',[q.id]))[0].status,'pending');}finally{await db.exec('alter table activity_log drop constraint approval_failure');}
  });
  await t.test('live staff predicate denies approval even when the JWT identity still exists',async()=>{
   const q=await create();await db.exec("select set_config('test.staff','false',false)");try{await assert.rejects(accept(q),/active office staff/);}finally{await db.exec("select set_config('test.staff','true',false)");}assert.equal((await job(q)).length,0);
  });
  await t.test('a direct authenticated write or user-settable approval flag cannot forge acceptance',async()=>{
   const q=await create();await db.exec("set role authenticated;select set_config('app.quote_approval','true',false)");try{
    await assert.rejects(query("update quotes set status='approved' where id=$1",[q.id]),/approval action/);
    await assert.rejects(query('update quotes set approved_at=clock_timestamp() where id=$1',[q.id]),/approval action/);
    await assert.rejects(query('insert into jobs(source_quote_id) values($1)',[q.id]),/approval action/);
    await assert.rejects(query('select app_private.approve_quote_locked($1,$2)',[q.id,q.edit_revision]),/permission denied/);
   }finally{await db.exec('reset role');}assert.equal((await job(q)).length,0);
  });
  await t.test('customer-token command is server-only and a revoked token cannot mutate anything',async()=>{
   const q=await create(),hash='a'.repeat(64);await query('insert into quote_portal_tokens(quote_id,token_hash,revoked_at) values($1,$2,clock_timestamp())',[q.id,hash]);
   await db.exec('set role authenticated');try{await assert.rejects(query('select approve_quote_by_portal($1,$2)',[hash,q.edit_revision]),/permission denied/);}finally{await db.exec('reset role');}
   await db.exec("set role service_role;select set_config('test.uid','',false)");try{await assert.rejects(query('select approve_quote_by_portal($1,$2)',[hash,q.edit_revision]),/unavailable or expired/);}finally{await db.exec(`reset role;select set_config('test.uid','${actor}',false)`);}assert.equal((await job(q)).length,0);
  });
  await t.test('linked active work keeps its operational status and replay leaves its plan alone',async()=>{
   const j=(await query("insert into jobs(customer_id,service_location_id,status,requested_scope) values($1,$2,'in_progress','Existing operational scope') returning *",[customer,location]))[0],q=await create({job_id:j.id});const r=await accept(q);assert.equal(r.job_id,j.id);assert.equal((await job(q))[0].status,'in_progress');assert.equal((await job(q))[0].requested_scope,'Existing operational scope');await accept(q);assert.equal((await job(q)).length,1);
  });
  await t.test('the actual inactive-lead trigger permits atomic restore then acceptance and restoration rolls back on failure',async()=>{
   for(const fail of [true,false]) {
    const j=(await query("insert into jobs(customer_id,service_location_id,status,website_submission_id,archived_at,lead_disposition) values($1,$2,'quoted',gen_random_uuid(),clock_timestamp(),'archived') returning *",[customer,location]))[0],q=await create({job_id:j.id});
    if(fail){await db.exec(`alter table activity_log add constraint archived_failure check(subject_id<>'${q.id}'::uuid or event_type<>'quote_approved') not valid`);try{await assert.rejects(accept(q),/check constraint/);assert.deepEqual((await query('select * from jobs where id=$1',[j.id]))[0],j);assert.deepEqual(await read(q.id),q);}finally{await db.exec('alter table activity_log drop constraint archived_failure');}}
    else {await accept(q);const after=(await job(q))[0];assert.equal(after.status,'accepted');assert.equal(after.archived_at,null);assert.equal(after.lead_disposition,'active');}
   }
  });
  await t.test('closed quotes and claimed work orders cannot be accepted into new work',async()=>{
   const q=await create();await query("update quotes set status='declined' where id=$1",[q.id]);await assert.rejects(accept(await read(q.id)),/open quote/);assert.equal((await job(q)).length,0);
   const j=(await query("insert into jobs(customer_id,service_location_id,status) values($1,$2,'new_lead') returning *",[customer,location]))[0],q1=await create({job_id:j.id}),q2=await create({job_id:j.id});await accept(q1);await assert.rejects(accept(q2),/no longer matches/);assert.equal((await read(q2.id)).status,'draft');
  });
 }finally{await db.close();}
});
