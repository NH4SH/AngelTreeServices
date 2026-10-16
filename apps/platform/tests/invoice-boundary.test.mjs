import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const migration=readFileSync(new URL('../../../supabase/migrations/20261016010829_invoice_financial_write_boundary.sql',import.meta.url),'utf8');
const enforcement=readFileSync(new URL('../../../supabase/migrations/20261016012251_enforce_invoice_financial_write_boundary.sql',import.meta.url),'utf8');
const actor='00000000-0000-4000-8000-000000000001',customer='00000000-0000-4000-8000-000000000002';
const fixture=`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema app_private; revoke all on schema app_private from public;
grant usage on schema auth,app_private to authenticated,service_role;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
-- Test-only predicates. Real issued JWTs/live employee/RLS run in the integration suite.
create function app_private.has_staff_role() returns boolean language sql stable as $$select coalesce(current_setting('test.staff',true),'false')='true'$$;
create function app_private.has_platform_admin_role() returns boolean language sql stable as $$select coalesce(current_setting('test.admin',true),'false')='true'$$;
create table invoices(id uuid primary key default gen_random_uuid(),job_id uuid,quote_id uuid,customer_id uuid,organization_id uuid,
 service_location_id uuid,billing_contact_id uuid,accounts_payable_contact_id uuid,recurring_service_plan_id uuid,recurring_occurrence_id uuid,
 purchase_order_reference text,payment_terms text,invoice_number text,due_at timestamptz,status text,
 subtotal_cents integer,tax_cents integer,total_cents integer,balance_due_cents integer,sent_at timestamptz,paid_at timestamptz,
 automatic_reminders_enabled boolean default true,archived_at timestamptz,archived_by_user_id uuid,updated_at timestamptz default clock_timestamp());
create function touch_invoice() returns trigger language plpgsql as $$begin new.updated_at:=clock_timestamp(); return new; end$$;
create trigger touch_invoice before update on invoices for each row execute function touch_invoice();
create table service_categories(id uuid primary key);
create table invoice_line_items(id uuid primary key default gen_random_uuid(),invoice_id uuid references invoices(id) on delete cascade,
 name text,description text,service_category_id uuid references service_categories(id),material_id uuid,quantity numeric(10,2),unit_price_cents integer,total_cents integer,sort_order integer,source_change_order_line_item_id uuid);
create unique index invoice_line_source on invoice_line_items(source_change_order_line_item_id) where source_change_order_line_item_id is not null;
create table payments(id uuid primary key default gen_random_uuid(),invoice_id uuid,amount_cents integer,status text,refunded_principal_cents integer default 0,disputed_principal_cents integer default 0,dispute_status text);
create table jobs(id uuid,customer_id uuid,organization_id uuid,recurring_service_plan_id uuid,recurring_occurrence_id uuid);
create table quotes(id uuid,customer_id uuid,organization_id uuid,job_id uuid);
create table service_locations(id uuid,customer_id uuid,organization_id uuid);
create table organization_contacts(id uuid,organization_id uuid,is_active boolean);
create table documents(id uuid,invoice_id uuid);
create table invoice_checkout_sessions(id uuid primary key default gen_random_uuid(),invoice_id uuid,status text);
create table app_private.invoice_void_leases(invoice_id uuid,expires_at timestamptz);
create table change_orders(id uuid,job_id uuid,status text,invoice_id uuid,created_at timestamptz);
create table change_order_line_items(id uuid,change_order_id uuid,title text,description text,service_category_id uuid,material_id uuid,quantity numeric,unit_price_cents integer,amount_cents integer,sort_order integer);
create table activity_log(actor_user_id uuid,actor_type text,subject_type text,subject_id uuid,event_type text,metadata_json jsonb,
 organization_id uuid,action_category text,record_label text,summary text,destination_path text,changes_json jsonb);
grant all on invoices,invoice_line_items to authenticated;
select set_config('test.uid','${actor}',false),set_config('test.staff','true',false),set_config('test.admin','true',false);
`;
const lines=(cents=1000,extra={})=>[{name:'Work',quantity:1,unit_price_cents:cents,total_cents:cents,...extra}];
test('invoice financial command SQL regression suite',async t=>{
 const db=new PGlite();
 try {
  await db.exec(fixture); await db.exec(migration);
  await t.test('command installation preserves old grants until the separate enforcement phase', async()=>{
   const rows=await db.query("select has_table_privilege('authenticated','public.invoices','UPDATE') allowed");
   assert.equal(rows.rows[0].allowed,true);
  });
  await db.exec(enforcement);
  const q=async(sql,params=[]) => (await db.query(sql,params)).rows;
  const create=async(items=lines(),header={})=>(await q('select public.create_invoice_draft($1,$2) value',[{customer_id:customer,...header},items]))[0].value;
  // Keep the timestamp as PostgreSQL text: JS Date truncates microseconds.
  const read=async id=>(await q('select *,updated_at::text as version from invoices where id=$1',[id]))[0];
  const save=async(inv,items=lines())=>(await q('select public.save_invoice_details($1,$2,null,$3) value',[inv.id,inv.version,items]))[0].value;
  await t.test('staff cannot directly patch financial state or delete lines',async()=>{
   const inv=await create(); await db.exec('set role authenticated');
   try {
    await assert.rejects(q("update invoices set status='paid',balance_due_cents=0 where id=$1",[inv.id]),/permission denied/);
    await assert.rejects(q("insert into invoices(customer_id,status) values($1,'paid')",[customer]),/permission denied/);
    await assert.rejects(q('delete from invoice_line_items where invoice_id=$1',[inv.id]),/permission denied/);
   } finally { await db.exec('reset role'); }
   assert.equal((await read(inv.id)).balance_due_cents,1000);
  });
  await t.test('draft creation computes totals and ignores forged state',async()=>{
   await db.exec('set role authenticated'); let inv;
   try { inv=await create(lines(1000),{status:'paid',total_cents:1,balance_due_cents:0,paid_at:'2026-01-01'}); }
   finally { await db.exec('reset role'); }
   const row=await read(inv.id); assert.equal(row.status,'draft'); assert.equal(row.total_cents,1000); assert.equal(row.balance_due_cents,1000); assert.equal(row.paid_at,null);
  });
  await t.test('invalid creation leaves no orphan header',async()=>{
   const before=(await q('select count(*)::integer n from invoices'))[0].n;
   await assert.rejects(create(lines(1000,{service_category_id:actor})),/foreign key/);
   assert.equal((await q('select count(*)::integer n from invoices'))[0].n,before);
  });
  await t.test('a later line failure rolls back earlier line, total and audit',async()=>{
   const inv=await create(),before=await read(inv.id);
   const [line]=await q('select * from invoice_line_items where invoice_id=$1',[inv.id]);
   await assert.rejects(save(before,[...lines(1200,{id:line.id}),...lines(300,{service_category_id:actor})]),/foreign key/);
   assert.equal((await read(inv.id)).total_cents,1000);
   assert.equal((await q('select total_cents from invoice_line_items where id=$1',[line.id]))[0].total_cents,1000);
   assert.equal((await q("select count(*)::integer n from activity_log where subject_id=$1 and event_type='invoice_updated'",[inv.id]))[0].n,0);
  });
  await t.test('foreign and repeated line IDs fail closed',async()=>{
   const a=await create(),b=await create(),row=await read(a.id);
   const [other]=await q('select id from invoice_line_items where invoice_id=$1',[b.id]);
   await assert.rejects(save(row,lines(1000,{id:other.id})),/belongs to another invoice/);
   const [own]=await q('select id from invoice_line_items where invoice_id=$1',[a.id]);
   await assert.rejects(save(row,[...lines(1000,{id:own.id}),...lines(1000,{id:own.id})]),/belongs to another invoice/);
  });
  await t.test('stale version cannot overwrite a complete save',async()=>{
   const a=await create(),row=await read(a.id); await save(row,lines(1500));
   await assert.rejects(save(row,lines(2000)),/changed since you opened/); assert.equal((await read(a.id)).total_cents,1500);
  });
  await t.test('net successful principal controls the editable minimum and balance',async()=>{
   const a=await create(lines(2000));
   await q("insert into payments(invoice_id,amount_cents,status,refunded_principal_cents,disputed_principal_cents,dispute_status) values($1,1000,'succeeded',100,200,'lost')",[a.id]);
   const row=await read(a.id); await assert.rejects(save(row,lines(699)),/recorded net payments/);
   await save(row,lines(1500)); assert.equal((await read(a.id)).balance_due_cents,800);
   await db.exec('set role service_role'); await q("select set_config('test.uid','',false)");
   try { const result=(await q('select public.reconcile_invoice_balance($1) value',[a.id]))[0].value; assert.equal(result.paid_cents,700); assert.equal(result.balance_due_cents,800); }
   finally { await db.exec('reset role'); await q("select set_config('test.uid',$1,false)",[actor]); }
  });
  await t.test('active collection and void fences prevent amount changes',async()=>{
   const a=await create(),row=await read(a.id); await q("insert into invoice_checkout_sessions(invoice_id,status) values($1,'processing')",[a.id]);
   await assert.rejects(save(row,lines(1200)),/checkout is in progress/);
   const b=await create(),other=await read(b.id); await q("insert into app_private.invoice_void_leases values($1,clock_timestamp()+interval '1 minute')",[b.id]);
   await assert.rejects(save(other,lines(1200)),/checkout is in progress/);
  });
  await t.test('invalid arithmetic/precision fails; rounded fractional quantities work',async()=>{
   for(const items of [lines(1000,{quantity:1.001}),lines(1000,{total_cents:999}),lines(-1),lines(1000,{quantity:0})]) await assert.rejects(create(items),/quantities and amounts/);
   const valid=await create([{name:'Fraction',quantity:1.25,unit_price_cents:101,total_cents:126}]); assert.equal((await read(valid.id)).total_cents,126);
  });
  await t.test('audit failure rolls back invoice and line changes',async()=>{
   const a=await create(),row=await read(a.id);
   await db.exec(`create function fail_test_audit() returns trigger language plpgsql as $$begin if new.event_type='invoice_updated' then raise exception 'test audit failure'; end if; return new; end$$;
    create trigger fail_test_audit before insert on activity_log for each row execute function fail_test_audit();`);
   try { await assert.rejects(save(row,lines(1200)),/test audit failure/); assert.equal((await read(a.id)).total_cents,1000); }
   finally { await db.exec('drop trigger fail_test_audit on activity_log; drop function fail_test_audit()'); }
  });
 } finally { await db.close(); }
});
