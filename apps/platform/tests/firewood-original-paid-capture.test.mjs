import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';

// This is a local SQL ordering regression, not genuine provider evidence.
const candidate=readFileSync(new URL('../scripts/verification/sql/firewood-handoff-v2.sql',import.meta.url),'utf8');
const capture=candidate.slice(candidate.indexOf('create function app_private.capture_firewood_handoff_payment()'),candidate.indexOf('create function app_private.guard_firewood_handoff_invoice()'));
const schema=`
create schema app_private;
create table app_private.firewood_handoffs(source_id text,order_id uuid,invoice_id uuid unique,customer_id uuid,payload jsonb,payload_hash text,principal_cents integer,original_paid_evidence jsonb);
create table app_private.firewood_handoff_payment_events(invoice_id uuid,payment_id uuid,financial jsonb);
create table app_private.firewood_handoff_observations(snapshot jsonb);
create table public.payments(id uuid primary key,invoice_id uuid,status text,amount_cents integer,total_collected_cents integer,surcharge_cents integer,succeeded_at timestamptz,refunded_principal_cents integer default 0,refunded_surcharge_cents integer default 0);
create table app_private.stripe_refund_observations(refund_id text primary key,payment_id uuid,status text,amount_cents integer);
`;
test('original paid capture survives refund-before-success ordering and remains immutable',async()=>{
 const db=new PGlite();try{
  await db.exec(schema);await db.exec(capture);
  const invoice=randomUUID(),payment=randomUUID();
  await db.query('insert into app_private.firewood_handoffs(invoice_id,principal_cents)values($1,45000)',[invoice]);
  await db.query("insert into public.payments(id,invoice_id,status,amount_cents,total_collected_cents,surcharge_cents)values($1,$2,'pending',45000,45000,0)",[payment,invoice]);
  await db.query("insert into app_private.stripe_refund_observations(refund_id,payment_id,status,amount_cents)values('re_synthetic_ordering',$1,'pending',45000)",[payment]);
  const original=async()=>((await db.query('select original_paid_evidence value from app_private.firewood_handoffs where invoice_id=$1',[invoice])).rows[0].value);
  assert.equal(await original(),null,'Neither bank processing nor a refund request is paid proof.');
  await db.query("update public.payments set status='succeeded',succeeded_at=clock_timestamp()where id=$1",[payment]);
  const proof=await original();assert.equal(proof.paid,true);assert.equal(proof.principal_cents,45000);assert.equal(proof.gross_collected_cents,45000);assert.equal(proof.surcharge_collected_cents,0);assert.deepEqual(proof.payment_ids,[payment]);
  assert.equal((await db.query('select status from app_private.stripe_refund_observations')).rows[0].status,'pending');
  assert.equal((await db.query('select refunded_principal_cents amount from public.payments where id=$1',[payment])).rows[0].amount,0,'Pending refund does not allocate refunded principal.');
  await db.query("update public.payments set status='refunded',refunded_principal_cents=45000 where id=$1",[payment]);
  assert.deepEqual(await original(),proof,'Full refund cannot replace or delete original paid evidence.');
  await assert.rejects(db.query("update app_private.firewood_handoffs set original_paid_evidence='{}'where invoice_id=$1",[invoice]),/immutable/);
  assert.equal((await db.query('select count(*)::integer n from app_private.firewood_handoff_payment_events')).rows[0].n,3);
 }finally{await db.close();}
});
test('failed debit without historical success cannot create original paid evidence',async()=>{
 const db=new PGlite();try{
  await db.exec(schema);await db.exec(capture);const invoice=randomUUID(),payment=randomUUID();
  await db.query('insert into app_private.firewood_handoffs(invoice_id,principal_cents)values($1,45000)',[invoice]);
  await db.query("insert into public.payments(id,invoice_id,status,amount_cents,total_collected_cents,surcharge_cents)values($1,$2,'failed',45000,45000,0)",[payment,invoice]);
  assert.equal((await db.query('select original_paid_evidence value from app_private.firewood_handoffs')).rows[0].value,null);
 }finally{await db.close();}
});
