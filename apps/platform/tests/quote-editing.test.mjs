import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {quoteEditConflict,quoteSaveResult} from '../src/lib/quotes/edit-result.ts';
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
test('PR05 actual quote command migrations: transactional saves, revisions and financial grants',async t=>{
 const db=new PGlite();try{
 await db.exec(fixture);await db.exec(validate);await db.exec(migration);await db.exec(enforcement);
 const query=async(s,p=[])=>(await db.query(s,p)).rows;
 const create=async(items=lines(),header={})=>(await query('select public.create_quote_draft($1,$2) value',[{customer_id:customer,service_location_id:location,...header},items]))[0].value;
 const read=async id=>(await query('select * from quotes where id=$1',[id]))[0];
 const save=async(q,items=lines(),header={})=>(await query('select public.save_quote_details($1,$2,$3,$4) value',[q.id,q.edit_revision,header,items]))[0].value;
 await t.test('creation computes sums, freezes initial state and ignores forged IDs',async()=>{
  const q=await create(lines(),{id:actor,status:'approved',total_cents:1,tax_cents:100});const row=await read(q.id);assert.notEqual(q.id,actor);assert.equal(row.status,'draft');assert.equal(row.total_cents,1100);assert.equal(row.approved_at,null);
 });
 await t.test('direct authenticated header and line writes stay withdrawn',async()=>{
  const q=await create();await db.exec('set role authenticated');try{await assert.rejects(query('update quotes set total_cents=1 where id=$1',[q.id]),/permission denied/);await assert.rejects(query('insert into quote_line_items(quote_id,name) values($1,\'Bypass\')',[q.id]),/permission denied/);await assert.rejects(query('delete from quote_line_items where quote_id=$1',[q.id]),/permission denied/);}finally{await db.exec('reset role');}
 });
 await t.test('late line failure rolls back deletion, header, old version and all line changes',async()=>{
  const q=await read((await create()).id),before=await query('select * from quote_line_items where quote_id=$1',[q.id]);
  await assert.rejects(save(q,lines(500,{material_id:actor}),{customer_message:'Must roll back'}),/foreign key/);assert.deepEqual(await read(q.id),q);assert.deepEqual(await query('select * from quote_line_items where quote_id=$1',[q.id]),before);
 });
 await t.test('mandatory history failure rolls back a fully synchronized save',async()=>{
  const q=await read((await create()).id);await db.exec(`alter table activity_log add constraint fail_quote check(subject_id<>'${q.id}'::uuid or event_type<>'quote_updated') not valid`);
  try{await assert.rejects(save(q,lines(1800)),/check constraint/);assert.deepEqual(await read(q.id),q);}finally{await db.exec('alter table activity_log drop constraint fail_quote');}
 });
 await t.test('foreign and duplicate persisted identities cannot become new lines',async()=>{
  const q=await read((await create()).id),other=await create(),[foreign]=await query('select * from quote_line_items where quote_id=$1',[other.id]),[own]=await query('select * from quote_line_items where quote_id=$1',[q.id]);
  await assert.rejects(save(q,[foreign]),/belongs to another/);await assert.rejects(save(q,[own,own]),/belongs to another/);
 });
 await t.test('stale edits return the saved revision and never mutate the winning content',async()=>{
  const q=await read((await create()).id),first=await save(q,lines(1700),{customer_message:'Winner'}),conflict=await save(q,lines(1900));assert.equal(conflict.conflict,true);assert.equal(conflict.current_revision,first.edit_revision);assert.equal(conflict.current_total_cents,1700);assert.equal((await read(q.id)).customer_message,'Winner');
 });
 await t.test('telemetry does not advance content revision; status changes do',async()=>{
  const q=await read((await create()).id);await query('update quotes set view_count=2,last_viewed_at=now() where id=$1',[q.id]);assert.equal((await read(q.id)).edit_revision,q.edit_revision);
  await query("update quotes set status='sent' where id=$1",[q.id]);assert.ok((await read(q.id)).edit_revision>q.edit_revision);
 });
 await t.test('source/closed documents cannot be reopened or edited',async()=>{
  const q=await create();await query("update quotes set status='approved' where id=$1",[q.id]);const closed=await read(q.id);
  await assert.rejects(save(closed),/closed/);await assert.rejects(query("update quotes set status='draft' where id=$1",[q.id]),/closed/);await assert.rejects(query('delete from quotes where id=$1',[q.id]),/history/);
 });
 await t.test('material references survive partial mobile headers and missing metadata',async()=>{
  await query('insert into material_catalog values($1)',[actor]);const q=await create(lines(1000,{material_id:actor})),row=await read(q.id),[l]=await query('select * from quote_line_items where quote_id=$1',[q.id]);await query('insert into quote_material_requirements values($1,$2,$3,$4)',[actor,q.id,l.id,actor]);
  const {material_id,...payload}=l;await save(row,[payload]);assert.equal((await query('select material_id from quote_line_items where id=$1',[l.id]))[0].material_id,actor);
  await assert.rejects(save(await read(q.id),[]),/material plan/);
 });
 await t.test('a withdrawn live role loses command authority without changing input',async()=>{
  const q=await read((await create()).id);await db.exec("select set_config('test.staff','false',false)");try{await assert.rejects(save(q),/active office/);await assert.rejects(create(),/active office/);}finally{await db.exec("select set_config('test.staff','true',false)");}
 });
 }finally{await db.close();}
});
test('quote editor accepts only complete save acknowledgements and keeps conflict metadata separate',()=>{
 const id=actor,row={id,edit_revision:3,line_ids:[location]};assert.deepEqual(quoteSaveResult(row,1),row);assert.equal(quoteSaveResult({...row,line_ids:[]},1),null);assert.equal(quoteSaveResult({...row,line_ids:[location,location]},2),null);assert.equal(quoteSaveResult(null,0),null);
 assert.deepEqual(quoteEditConflict({conflict:true,current_revision:5,current_total_cents:1700,current_status:'sent',changed_by:'Another editor',changed_at:null}),{currentRevision:5,currentTotalCents:1700,currentStatus:'sent',changedBy:'Another editor',changedAt:null});assert.equal(quoteEditConflict(row),null);
});
