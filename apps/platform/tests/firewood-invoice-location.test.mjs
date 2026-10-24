import assert from 'node:assert/strict';
import test from 'node:test';
import {generateInvoiceEmailDraft} from '../src/lib/documents/email-drafts.ts';
import {load,harness,InvoiceDocument,text} from './customer-invoice-fixture.mjs';
import {expandPrintTree} from './customer-document-print-fixture.mjs';

const id='11111111-1111-4111-8111-111111111111';
const delivery={id,label:'Home',street:'1 Synthetic Ln',city:'Fredericksburg',state:'VA',postal_code:'22407'};
const jobLocation={...delivery,street:'2 Older Job Rd'};
const base={id,job_id:null,customer_id:id,organization_id:null,invoice_number:'SYNTHETIC',status:'draft',created_at:'2026-10-24T12:00:00Z',subtotal_cents:45000,tax_cents:0,total_cents:45000,balance_due_cents:45000,invoice_line_items:[],notes:[],jobs:null};
for(const [name,changes,expected,absent] of [
  ['standalone delivery',{service_locations:delivery},'1 Synthetic Ln','No service location attached yet.'],
  ['invoice delivery takes precedence',{service_locations:delivery,jobs:{service_locations:jobLocation}},'1 Synthetic Ln','2 Older Job Rd'],
  ['legacy job fallback',{service_locations:null,jobs:{service_locations:jobLocation}},'2 Older Job Rd','No service location attached yet.'],
]) test(name+' is consistent in invoice, print, customer summary and email draft',async()=>{
  const invoice={...base,...changes},before=structuredClone(invoice);
  const document=text(expandPrintTree(InvoiceDocument({invoice})));
  assert.ok(document.includes(expected));assert.ok(!document.includes(absent));
  const portal=text(expandPrintTree(await harness({record:invoice,receipt:{error:null,totalCents:0}}).render()));
  assert.ok(portal.includes(expected));assert.ok(!portal.includes(absent));
  const email=generateInvoiceEmailDraft(invoice);
  assert.ok(email.propertyLabel.includes(expected));assert.ok(!email.propertyLabel.includes(absent));
  assert.deepEqual(invoice,before);
});
test('missing location retains existing customer recovery help',async()=>{
  const invoice={...base,service_locations:null};
  assert.match(text(expandPrintTree(InvoiceDocument({invoice}))),/No service location attached yet/);
  assert.equal(generateInvoiceEmailDraft(invoice).propertyLabel,'the service property');
});
function queryDB(token){const calls=[];return{calls,from(table){const c={table,filters:[]};calls.push(c);const q={select(columns){c.columns=columns;return q;},eq(...args){c.filters.push(args);return q;},single:async()=>({data:{...base,service_locations:delivery},error:null}),maybeSingle:async()=>({data:token,error:null})};return q;}};}
test('staff invoice detail reads the direct address through the existing caller client',async()=>{
  const db=queryDB();const mod=load('../src/lib/data/invoices.ts',{'@/lib/supabase/server':{createClient:async()=>db},'@/lib/data/admin-search':{},'@/lib/security/errors':{safeStaffMessage:x=>x}});
  const result=await mod.getInvoiceDetail(id);assert.equal(result.error,null);assert.deepEqual(result.data.service_locations,delivery);
  assert.equal(db.calls.length,1);assert.deepEqual(db.calls[0].filters,[['id',id]]);
  assert.match(db.calls[0].columns,/service_locations:service_locations!invoices_service_location_id_fkey\(id, label, street, city, state, postal_code\)/);
});
function portalReader(token){const db=queryDB(token);const mod=load('../src/lib/data/portal-invoice.ts',{'server-only':{},'@/lib/email/delivery-commands':{},'@/lib/supabase/server':{},'@/lib/supabase/admin':{getServiceRoleClient:()=>db},'@/lib/portal/invoice-token-errors':{},'@/lib/portal/tokens':{hashPortalToken:()=> 'synthetic-hash'},'@/lib/portal/urls':{}});return{db,run:()=>mod.getInvoiceByPortalToken('synthetic-capability')};}
const validToken={invoice_id:id,customer_id:id,organization_id:null,expires_at:null,revoked_at:null};
test('validated customer capability includes public address fields, without internal property notes',async()=>{
  const r=portalReader(validToken),result=await r.run();assert.equal(result.status,'ready');assert.deepEqual(result.invoice.service_locations,delivery);
  assert.deepEqual(r.db.calls[1].filters,[['id',id]]);assert.match(r.db.calls[1].columns,/service_locations:service_locations!invoices_service_location_id_fkey\(id, label, street, city, state, postal_code\)/);
  assert.doesNotMatch(r.db.calls[1].columns,/access_notes|service_notes/);
});
for(const [name,token] of [['absent',null],['revoked',{...validToken,revoked_at:'2026-01-01T00:00:00Z'}],['expired',{...validToken,expires_at:'2026-01-01T00:00:00Z'}]])test(name+' capability never reads an invoice address',async()=>{const r=portalReader(token),result=await r.run();assert.notEqual(result.status,'ready');assert.equal(result.invoice,null);assert.equal(r.db.calls.length,1);});
test('capability party mismatch never exposes address',async()=>{const r=portalReader({...validToken,customer_id:'other'}),result=await r.run();assert.equal(result.status,'invalid');assert.equal(result.invoice,null);});
