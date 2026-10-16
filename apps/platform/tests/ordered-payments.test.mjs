import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {actor,fixture} from './webhook-receipt.sql-fixture.mjs';
const migration=name=>readFileSync(new URL('../../../supabase/migrations/'+name,import.meta.url),'utf8');
const boundary=migration('20261016010829_invoice_financial_write_boundary.sql');
const definition=(source,name)=>{const start=source.search(new RegExp('create (?:or replace )?function '+name.replaceAll('.','\\.')+'\\('));assert.ok(start>=0,name);return source.slice(start,source.indexOf('$$;',start)+3);};
test('PR07 actual SQL commands and refund observation boundaries',async t=>{
 const db=new PGlite();let counter=0;
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const root=()=>db.exec('reset role'),caller=async()=>{await root();await db.exec('set role authenticated');},server=async()=>{await root();await db.exec('set role service_role');};
 try{
  await db.exec(fixture);
  await db.exec(`alter table payments alter column surcharge_cents set default 0;
    alter table payments add column reference text,add column notes text,add column provider_dispute_id text,add column disputed_gross_cents integer default 0,
    add column disputed_surcharge_cents integer default 0,add column dispute_event_created_at timestamptz,add column dispute_closed_at timestamptz,
    add column dispute_principal_restored_at timestamptz,add column disputed_at timestamptz;`);
  for(const name of ['app_private.invoice_paid_principal','app_private.invoice_payment_status','public.reconcile_invoice_balance'])await db.exec(definition(boundary,name));
  await db.exec(migration('20260811185455_preserve_prepaid_invoice_delivery_state.sql'));
  await db.exec(definition(migration('20260720130614_payment_activation_blockers.sql'),'public.reconcile_stripe_dispute'));
  await db.exec(migration('20261016020444_recoverable_stripe_webhook_receipts.sql'));
  await db.exec(migration('20261016032012_ordered_payment_reconciliation.sql'));
  const invoice=async(status='sent')=>{await root();return (await q('insert into invoices(status,sent_at) values($1,case when $1=\'draft\' then null else now() end) returning *',[status]))[0];};
  const args=(inv,key=randomUUID(),amount=100)=>[key,inv.id,amount,'2026-10-15T12:00:00Z','cash',null,null];
  const record=async a=>(await q('select record_manual_invoice_payment_request($1,$2,$3,$4,$5,$6,$7) result',a))[0].result;
  const resolve=async a=>(await q('select resolve_manual_invoice_payment_request($1,$2) result',a.slice(0,2)))[0].result;
  const money=async inv=>{await root();return q('select * from payments where invoice_id=$1',[inv.id]);};
  const state=async inv=>{await root();return (await q('select status,balance_due_cents from invoices where id=$1',[inv.id]))[0];};
  await t.test('partial replay returns one immutable identity; an equal second installment is permitted',async()=>{
   const inv=await invoice(),a=args(inv);await caller();const first=await record(a),again=await record(a);assert.equal(first.payment_id,again.payment_id);assert.equal(again.replayed,true);
   const second=await record(args(inv));assert.notEqual(first.payment_id,second.payment_id);assert.equal((await money(inv)).length,2);assert.equal((await state(inv)).balance_due_cents,800);
  });
  await t.test('changed payload or target cannot reuse a recorded request',async()=>{
   const inv=await invoice(),other=await invoice(),a=args(inv);await caller();await record(a);
   for(const [index,value] of [[1,other.id],[2,101],[3,'2026-10-14T12:00:00Z'],[4,'check']]){const changed=[...a];changed[index]=value;await assert.rejects(record(changed),/different details/);}
   assert.equal((await money(inv)).length,1);assert.equal((await money(other)).length,0);
  });
  await t.test('tombstone closes an uncommitted attempt before a delayed original can create money',async()=>{
   const inv=await invoice(),a=args(inv);await caller();assert.equal((await resolve(a)).state,'abandoned');await assert.rejects(record(a),/closed without recording/);assert.equal((await money(inv)).length,0);
  });
  await t.test('full-payment and corrected-payment replay never create or restore money',async()=>{
   const inv=await invoice(),a=args(inv,randomUUID(),1000);await caller();const first=await record(a);assert.equal((await record(a)).payment_id,first.payment_id);
   await q("select cancel_manual_invoice_payment($1,$2,'fixture')",[inv.id,first.payment_id]);const replay=await record(a);assert.equal(replay.payment_status,'cancelled');
   assert.equal((await state(inv)).balance_due_cents,1000);await caller();await q('select restore_cancelled_manual_invoice_payment($1,$2)',[inv.id,first.payment_id]);assert.equal((await state(inv)).balance_due_cents,0);
  });
  await t.test('audit rejection rolls back payment, identity and derived balance',async()=>{
   const inv=await invoice(),a=args(inv);await db.exec(`alter table activity_log add constraint reject_pr07 check(subject_id<>'${inv.id}') not valid`);await caller();
   await assert.rejects(record(a));assert.equal((await money(inv)).length,0);assert.equal((await q('select * from app_private.manual_payment_requests where request_id=$1',[a[0]])).length,0);
   assert.equal((await state(inv)).balance_due_cents,1000);await db.exec('alter table activity_log drop constraint reject_pr07');await caller();assert.equal((await record(a)).replayed,false);
  });
  await t.test('unsent partial prepayment stays draft and full receipt stays independent of delivery',async()=>{
   const inv=await invoice('draft');await caller();await record(args(inv));assert.equal((await state(inv)).status,'draft');await caller();await record(args(inv,randomUUID(),900));assert.equal((await state(inv)).status,'paid');
  });
  await t.test('private observation/request tables and unsafe legacy RPCs are not exposed to caller roles',async()=>{
   const inv=await invoice(),a=args(inv);
   for(const role of ['anon','authenticated','service_role']){await root();await db.exec(`set role ${role}`);for(const table of ['manual_payment_requests','stripe_invoice_observations','stripe_refund_observations'])await assert.rejects(q(`select * from app_private.${table}`),/permission denied/);}
   await caller();await assert.rejects(q('select record_manual_invoice_payment($1,100,now(),\'cash\')',[inv.id]),/permission denied/);
   await root();await db.exec('set role anon');await assert.rejects(record(a),/permission denied/);
  });
  const claim=async(id,object,type='charge.refunded')=>(await q("select claim_stripe_webhook($1,$2,$3,now(),false) result",[id,type,object]))[0].result;
  const prepare=async f=>(await q('select prepare_stripe_webhook_snapshot($1,$2,$3::jsonb) result',[f.event,f.token,JSON.stringify(f.evidence)]))[0].result;
  const apply=async f=>(await q('select apply_stripe_webhook($1,$2,$3::jsonb) result',[f.event,f.token,JSON.stringify(f.evidence)]))[0].result;
  const financial=async()=>{
   const inv=await invoice();const suffix=++counter;
   const row=(await q(`insert into invoice_checkout_sessions(invoice_id,invoice_principal_cents,total_charge_cents,surcharge_cents,stripe_checkout_session_id,stripe_payment_intent_id) values($1,1000,1030,30,$2,$3) returning id`,[inv.id,`cs_pr07_${suffix}`,`pi_pr07_${suffix}`]))[0];
   await server();const event=`evt_unit_pr07_${++counter}`,owned=await claim(event,`cs_pr07_${suffix}`,'checkout.session.completed');
   const f={inv,event,token:owned.token,evidence:{operation:'succeeded',reservation_id:row.id,invoice_id:inv.id,session_id:`cs_pr07_${suffix}`,intent_id:`pi_pr07_${suffix}`,charge_id:`ch_pr07_${suffix}`,amount_cents:1030,currency:'usd',refunds:[]}};
   f.evidence.snapshot_token=await prepare(f);await apply(f);return f;
  };
  const refund=(f,amount,status='succeeded')=>({id:`re_pr07_${++counter}`,charge_id:f.evidence.charge_id,intent_id:f.evidence.intent_id,amount_cents:amount,currency:'usd',status,created_at:'2026-10-15T12:00:00Z'});
  const observation=async(f,refunds)=>{
   await server();const event=`evt_unit_pr07_${++counter}`,owned=await claim(event,f.evidence.charge_id);
   const o={inv:f.inv,event,token:owned.token,evidence:{operation:'refund',charge_id:f.evidence.charge_id,intent_id:f.evidence.intent_id,amount_cents:1030,currency:'usd',refunds}};
   o.evidence.snapshot_token=await prepare(o);return o;
  };
  await t.test('pending/succeeded/failed refund lifecycle allocates only successful principal and surcharge',async()=>{
   const f=await financial(),r=refund(f,515,'pending');await apply(await observation(f,[r]));assert.equal((await state(f.inv)).balance_due_cents,0);
   r.status='succeeded';await apply(await observation(f,[r]));const payment=(await money(f.inv))[0];assert.equal(payment.refunded_principal_cents,500);assert.equal(payment.refunded_surcharge_cents,15);
   r.status='failed';await apply(await observation(f,[r]));assert.equal((await state(f.inv)).balance_due_cents,0);assert.equal((await money(f.inv))[0].refunded_principal_cents,0);
  });
  await t.test('full refunded status can converge back to received money when that refund is canceled',async()=>{
   const f=await financial(),r=refund(f,1030);await apply(await observation(f,[r]));assert.equal((await money(f.inv))[0].status,'refunded');
   r.status='canceled';await apply(await observation(f,[r]));assert.equal((await money(f.inv))[0].status,'succeeded');assert.equal((await state(f.inv)).balance_due_cents,0);
  });
  await t.test('newer observation fences a live older snapshot instead of relying on arrival timestamps or max totals',async()=>{
   const f=await financial(),r=refund(f,300),older=await observation(f,[r]);const next=refund(f,200),newer=await observation(f,[r,next]);await apply(newer);
   await assert.rejects(apply(older),/newer provider observation/);assert.equal((await state(f.inv)).balance_due_cents,485);
  });
  await t.test('missing known IDs, duplicates and immutable refund changes roll back and preserve money',async()=>{
   const f=await financial(),r=refund(f,515);await apply(await observation(f,[r]));
   for(const records of [[],[r,r],[{...r,amount_cents:516}],[{...r,currency:'eur'}],[{...r,charge_id:'ch_other'}],[{...r,status:'unknown'}]])await assert.rejects(apply(await observation(f,records)));
   assert.equal((await money(f.inv))[0].refunded_principal_cents,500);assert.equal((await state(f.inv)).balance_due_cents,500);
  });
  await t.test('an unfenced financial apply cannot mutate money even with a live receipt',async()=>{
   const f=await financial(),o=await observation(f,[]);delete o.evidence.snapshot_token;await assert.rejects(apply(o),/newer provider observation/);
  });
  await t.test('a deleted recipient inbox row is skipped, but another receipt notification is rejected',async()=>{
   const f=await financial(),other=await financial();await root();
   const original=(await q('select id from admin_notifications where stripe_event_id=$1',[f.event]))[0];
   const foreign=(await q('select id from admin_notifications where stripe_event_id=$1',[other.event]))[0];
   await q('delete from admin_notifications where id=$1',[original.id]);await server();
   assert.equal((await q('select begin_stripe_notification_email($1,$2,$3) result',[f.event,f.token,original.id]))[0].result.status,'gone');
   await assert.rejects(q('select begin_stripe_notification_email($1,$2,$3)',[f.event,f.token,foreign.id]),/another receipt/);
  });
 }finally{await db.close();}
});
