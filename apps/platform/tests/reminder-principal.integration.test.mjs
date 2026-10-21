import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {reminderFixture} from './reminder-principal-fixture.mjs';

test('installed complete-principal receipts drive reminders and receipts without persistent fixtures or providers',{
 skip:process.env.REMINDER_PRINCIPAL_DISPOSABLE!=='1',timeout:120000,
},async t=>{
 assert.equal(process.env.DOCKER_HOST,'unix:///Users/noelsierra/.lima/pr02-disposable/sock/docker.sock');assert.ok(process.env.REMINDER_PRINCIPAL_DOCKER_BIN);
 const cases=[
  {name:'1005 successful rows exceed the API row cap',many:1005,total:2000,expected:995},
  {name:'ordinary reminder includes refunds and lost disputes',many:1005,amount:400,refund:200,dispute:100,state:'lost',total:2000,expected:895},
  {name:'overdue reminder retains won-dispute principal',many:1005,amount:400,refund:200,dispute:100,state:'won',total:2000,expected:795,overdue:true},
  {name:'overlapping refund/dispute adjustments cannot create negative principal',many:1005,amount:400,refund:400,dispute:400,state:'lost',total:2000,expected:995},
  {name:'a complete settled history cancels a stale reminder',many:1005,total:1005,cancelled:true},
  {name:'pending payments are not represented as successful principal',many:0,pending:true,total:1000,expected:1000},
  {name:'payment receipt remaining balance uses the same complete snapshot',many:1005,total:2000,expected:995,confirmation:true},
  {name:'authenticated API execution remains denied',many:0,total:1000,role:'authenticated',failed:true},
  {name:'privileged session with an end-user subject remains denied',many:0,total:1000,subject:true,failed:true},
  {name:'missing invoice is unavailable rather than guessed unpaid',many:0,total:1000,missing:true,failed:true},
 ].map(c=>({...c,invoiceId:randomUUID(),customerId:randomUUID()}));
 let sql=`begin;set local statement_timeout='10s';set local lock_timeout='3s';
 create function pg_temp.capture_snapshot(statement text) returns jsonb language plpgsql as $$declare r jsonb;begin execute statement into r;return jsonb_build_object('data',r,'error',null);exception when others then return jsonb_build_object('data',null,'error',jsonb_build_object('code',sqlstate));end;$$;\n`;
 for(const [i,c]of cases.entries()){
  sql+='savepoint fixture;\n';
  if(!c.missing){
   sql+=`insert into public.customers(id,display_name,email)values('${c.customerId}','REMINDER_SNAPSHOT_DISPOSABLE','synthetic@example.invalid');
   insert into public.invoices(id,invoice_number,customer_id,status,subtotal_cents,total_cents,balance_due_cents,sent_at)values('${c.invoiceId}','REMINDER_SNAPSHOT_DISPOSABLE','${c.customerId}','sent',${c.total},${c.total},${c.total},clock_timestamp());\n`;
   if(c.many)sql+=`insert into public.payments(invoice_id,customer_id,amount_cents,total_collected_cents,surcharge_cents,currency,payment_method,provider,status)select '${c.invoiceId}','${c.customerId}',1,1,0,'usd','cash','manual','succeeded' from generate_series(1,${c.many});\n`;
   if(c.amount)sql+=`insert into public.payments(invoice_id,customer_id,amount_cents,total_collected_cents,surcharge_cents,currency,payment_method,provider,status,refunded_principal_cents,disputed_principal_cents,disputed_gross_cents,dispute_status)values('${c.invoiceId}','${c.customerId}',${c.amount},${c.amount},0,'usd','cash','manual','succeeded',${c.refund},${c.dispute},${c.dispute},'${c.state}');\n`;
   if(c.pending)sql+=`insert into public.payments(invoice_id,customer_id,amount_cents,total_collected_cents,surcharge_cents,currency,payment_method,provider,status)values('${c.invoiceId}','${c.customerId}',1000,1000,0,'usd','ach','stripe','pending');\n`;
  }
  sql+=`set local role ${c.role??'service_role'};set local request.jwt.claims='${JSON.stringify({role:c.role??'service_role',...(c.subject?{sub:randomUUID()}:{})})}';
  select 'RECEIPT_${i}:'||pg_temp.capture_snapshot('select public.get_invoice_payment_principal(''${c.invoiceId}'')')::text;reset role;rollback to savepoint fixture;release savepoint fixture;\n`;
 }
 sql+=`rollback;select 'ABSENT:'||count(*) from public.invoices where id in (${cases.map(c=>"'"+c.invoiceId+"'").join(',')});`;
 const lines=execFileSync(process.env.REMINDER_PRINCIPAL_DOCKER_BIN,['exec','-i','supabase_db_ats_pr02_disposable','psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{input:sql,encoding:'utf8',timeout:60000}).trim().split('\n');
 assert.ok(lines.includes('ABSENT:0'));
 const proof=[];
 for(const [i,c]of cases.entries())await t.test(c.name,async()=>{
  const receipt=JSON.parse(lines.find(line=>line.startsWith(`RECEIPT_${i}:`)).slice(`RECEIPT_${i}:`.length));
  const f=reminderFixture({...c,readPrincipal:()=>receipt}),r=await f.run();
  if(c.failed){assert.equal(r.outcome,'not_sent');assert.equal(f.sends.length,0);assert.equal(f.balances.length,0);if(!c.missing)assert.equal(receipt.error.code,'42501');}
  else if(c.cancelled){assert.equal(r.status,'cancelled');assert.equal(f.sends.length,0);}
  else{assert.equal(r.outcome,'accepted');assert.deepEqual(f.balances,[c.expected]);assert.equal(f.sends.length,1);}
  assert.equal(f.reads.filter(r=>r.name).length,1);
  proof.push({name:c.name,pass:true,expectedRemainingCents:c.expected??null,paymentCount:receipt.data?.successful_payment_count??null,providerCalls:0});
 });
 if(process.env.REMINDER_PRINCIPAL_RESULTS_FILE)writeFileSync(process.env.REMINDER_PRINCIPAL_RESULTS_FILE,JSON.stringify({proof,allFixturesRolledBack:true,applicationSchemaChanged:false,providerCalls:0},null,2)+'\n',{mode:0o600});
});
