import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { readyDb,q,role,admin,service,request,prepare,priceRequest,inspect,owner } from './fixtures/firewood-office-db.mjs';
import { priceLiveOrder } from '../src/lib/firewood/handoff/live-contract.mjs';
const patch=readFileSync(new URL('../../../supabase/review/firewood-live/handoff-recovery.sql',import.meta.url),'utf8');
async function dbReady(){
 const db=await readyDb();
 await db.exec(`create table app_private.fwofficev2_orders(id uuid primary key,request jsonb,created_at bigint);
 create table app_private.fwofficev2_prepare(id uuid primary key,status text,tries integer default 0,receipt jsonb,invoice_id uuid,lease uuid,retry_at bigint default 0);
 alter table app_private.fwofficev2_orders enable row level security;alter table app_private.fwofficev2_prepare enable row level security;
 revoke all on app_private.fwofficev2_orders,app_private.fwofficev2_prepare from public,anon,authenticated,service_role;
 create function app_private.firewood_live_credit_blockers(uuid)returns jsonb language sql as $$select '[]'::jsonb$$;`);
 await db.exec(patch);return db;
}
async function customer(db,value,changes={}){
 const c={...value.order.contact,...changes};
 return (await q(db,'insert into public.customers(display_name,email,phone,status,customer_type,organization_id,archived_at)values($1,$2,$3,$4,$5,$6,$7)returning id',
  [c.name,c.email,c.phone,c.status??'active',c.type??'residential',c.organization??null,c.archived??null]))[0].id;
}
async function save(db,value,{status='review',tries=1}={}){
 await q(db,'insert into app_private.fwofficev2_orders values($1,$2,$3)',[value.order_id,value,Date.now()]);
 await q(db,'insert into app_private.fwofficev2_prepare(id,status,tries)values($1,$2,$3)',[value.order_id,status,tries]);
}

test('shared household email/phone reuses the one exact active residential match, with one invoice across lost acknowledgements',async()=>{
 const db=await dbReady();try{
 const value=request({...priceLiveOrder({quantity:'two',stacking:false})});
 await customer(db,value,{name:'Different Household Member'});const exact=await customer(db,value);
 const before=await q(db,'select to_jsonb(c) row from public.customers c order by id');
 const first=await prepare(db,value),retry=await prepare(db,value);
 assert.equal(first.principal_cents,84000);assert.equal(retry.invoice_id,first.invoice_id);assert.equal(retry.replayed,true);
 assert.deepEqual(await q(db,'select to_jsonb(c) row from public.customers c order by id'),before);
 assert.equal((await q(db,'select customer_id from public.invoices'))[0].customer_id,exact);
 assert.equal((await q(db,'select count(*)::int n from public.invoices'))[0].n,1);
 assert.equal((await q(db,'select count(*)::int n from public.payments'))[0].n,0);
 assert.equal((await q(db,'select count(*)::int n from public.invoice_checkout_sessions'))[0].n,0);
 assert.equal((await q(db,"select count(*)::int n from public.activity_log where metadata_json->>'customer_email_sent'='true'"))[0].n,0);
 }finally{await db.close();}
});

test('multiple exact, partial, archived, organization and non-residential matches remain blocked without invoice/customer writes',async()=>{
 const db=await dbReady();try{
 for(const changes of [[{},{}],[{name:'Another Person'}],[{phone:'2025559999'}],[{archived:new Date().toISOString()}],[{organization:randomUUID()}],[{type:'commercial'}]]){
  const value=request();for(const change of changes)await customer(db,value,change);
  const before=(await q(db,'select count(*)::int n from public.customers'))[0].n;
  await assert.rejects(prepare(db,value),/contact requires review/);
  assert.equal((await q(db,'select count(*)::int n from public.customers'))[0].n,before);
 }
 assert.equal((await q(db,'select count(*)::int n from public.invoices'))[0].n,0);
 }finally{await db.close();}
});

test('office paging includes saved pending and review orders, keeps price requests, and never duplicates an accepted order',async()=>{
 const db=await dbReady();try{
 const blocked=request(),pending=request(),priced=request();await save(db,blocked);await save(db,pending,{status:'pending',tries:0});await priceRequest(db,priced);
 let list=(await admin(db,'select public.list_firewood_live_office(1,20) value'))[0].value;
 assert.equal(list.total_count,3);assert.deepEqual(new Set(list.items.map(x=>x.kind)),new Set(['saved_order','price_request']));
 const detail=await inspect(db,blocked);assert.equal(detail.order.reference,blocked.reference);assert.equal(detail.order.invoice_id,null);assert.equal(detail.preparation.can_retry,true);
 assert.deepEqual(detail.order.contact,blocked.order.contact);
 assert.equal((await inspect(db,pending)).preparation.can_retry,false);
 await prepare(db,blocked);
 list=(await admin(db,'select public.list_firewood_live_office(1,20) value'))[0].value;
 assert.equal(list.total_count,3);assert.equal(list.items.filter(x=>x.order_id===blocked.order_id).length,1);
 assert.equal(list.items.find(x=>x.order_id===blocked.order_id).kind,'accepted_order');
 await assert.rejects(service(db,'select public.list_firewood_live_office()'),/permission denied/);
 await assert.rejects(role(db,'authenticated','select public.inspect_firewood_live_office($1)',[pending.order_id],{user:owner}),/owner or admin/);
 }finally{await db.close();}
});

test('office retry is authorized, versioned and idempotent; it preserves accepted bytes, tries and delivery history',async()=>{
 const db=await dbReady();try{
 const value=request();await save(db,value);const id=randomUUID(),args=[value.order_id,1,'Reviewed exact customer match; no merge or price change.',id];
 const sql='select public.retry_firewood_live_preparation($1,$2,$3,$4) value';
 for(const name of ['anon','service_role'])await assert.rejects(role(db,name,sql,args),/permission denied/);
 await assert.rejects(role(db,'authenticated',sql,args,{user:owner}),/owner or admin/);
 const first=(await admin(db,sql,args))[0].value;assert.equal(first.status,'pending');
 assert.deepEqual((await admin(db,sql,args))[0].value,first);
 await assert.rejects(admin(db,sql,[...args.slice(0,3),randomUUID()]),/preparation changed/);
 assert.equal((await q(db,'select tries from app_private.fwofficev2_prepare'))[0].tries,1);
 assert.deepEqual((await q(db,'select request from app_private.fwofficev2_orders'))[0].request,value);
 assert.equal((await q(db,'select count(*)::int n from app_private.firewood_live_office_events'))[0].n,1);
 assert.equal((await q(db,'select count(*)::int n from public.invoices'))[0].n,0);
 const receipt=await prepare(db,value),again=await prepare(db,value);assert.equal(again.invoice_id,receipt.invoice_id);
 await q(db,"update app_private.fwofficev2_prepare set status='review'");
 await assert.rejects(admin(db,sql,[...args.slice(0,3),randomUUID()]),/preparation changed/);
 assert.equal((await q(db,'select count(*)::int n from public.invoices'))[0].n,1);
 assert.equal((await q(db,'select count(*)::int n from public.payments'))[0].n,0);
 }finally{await db.close();}
});
