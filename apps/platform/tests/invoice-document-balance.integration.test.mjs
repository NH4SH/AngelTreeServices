import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {withDeadline} from '../src/lib/runtime/deadline.ts';
import {harness,load,elements,InvoiceDocument,Chooser} from './customer-invoice-fixture.mjs';

// Input is exported inside the rollback-only SQL verification transaction.
// The orchestration validates the exact target and before/after row seals.
const enabled=process.env.INVOICE_DISPLAY_SYNTHETIC==='1'&&Boolean(process.env.INVOICE_DISPLAY_RECEIPTS_FILE);
test('installed local/staging principal receipts drive the real customer invoice and printable document',{skip:!enabled},async t=>{
 const input=JSON.parse(readFileSync(process.env.INVOICE_DISPLAY_RECEIPTS_FILE,'utf8'));
 assert.ok(input.target==='local-disposable-116'||input.target==='staging-gbyhdsuiqeslgjdnbqng-116');
 assert.equal(input.rolledBack,true);assert.equal(input.cases.length,13);
 const forbid=()=>assert.fail('Rendering must not write balances, schedule notifications or call a provider');
 const reconciliation=load('../src/lib/payments/reconciliation.ts',{'server-only':{},'../runtime/deadline.ts':{withDeadline},'@/lib/communications/queue':{cancelPendingCommunications:forbid,syncAutomatedCommunications:forbid,syncInvoicePaymentCommunications:forbid},'@/lib/supabase/admin':{getServiceRoleClient:forbid}});
 for(const c of input.cases)await t.test(c.name,async()=>{
  assert.match(c.invoice.id,/^[a-f0-9-]{36}$/);assert.equal(c.receipt.invoice_id,c.invoice.id);
  const before=structuredClone(c.invoice),calls=[];
  const db={rpc(name,args){assert.equal(name,'get_invoice_payment_principal');assert.deepEqual(args,{p_invoice_id:c.invoice.id});calls.push(name);return{abortSignal:async()=>({data:c.receipt,error:null})};},from:forbid};
  const h=harness({record:c.invoice,paymentRead:()=>reconciliation.getSuccessfulPaymentTotal(db,c.invoice.id)});
  const view=await h.render(),markup=renderToStaticMarkup(view),document=elements(view).find(e=>e.type===InvoiceDocument);
  assert.ok(document);assert.equal(document.props.invoice.balance_due_cents,c.expectedDue);
  const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n/100);
  const totals=markup.match(/<dl class="[^"]*invoice-document-totals[^"]*">([\s\S]*?)<\/dl>/)?.[1];assert.ok(totals);
  assert.ok(totals.includes('<dt>Balance due</dt><dd>'+money(c.expectedDue)+'</dd>'));
  assert.ok(markup.includes('<strong>Balance due: '+money(c.expectedDue)+'</strong>'));
  const paid=Math.min(c.invoice.total_cents,c.receipt.paid_principal_cents);assert.equal(totals.includes('<dt>Paid</dt>'),paid>0);
  if(paid)assert.ok(totals.includes('<dt>Paid</dt><dd>-'+money(paid)+'</dd>'));
  const chooser=elements(view).find(e=>e.type===Chooser);assert.equal(Boolean(chooser),c.expectedChoose);
  if(chooser)assert.equal(chooser.props.amountDueCents,c.expectedDue);
  assert.deepEqual(c.invoice,before);assert.deepEqual(h.record,before);
  assert.deepEqual(calls,['get_invoice_payment_principal']);
 });
});
