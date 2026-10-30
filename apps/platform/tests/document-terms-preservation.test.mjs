import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import * as legacy from '../src/lib/documents/terms/legacy-2026-10-22.ts';
import {load,text} from './customer-invoice-fixture.mjs';
import {renderPrintCase,expandPrintTree} from './customer-document-print-fixture.mjs';
const baseline=JSON.parse(readFileSync(new URL('./document-terms-legacy-20261022.json',import.meta.url)));
const terms=load('../src/lib/documents/terms.ts',{'./terms/firewood-candidate-test-2026-10-28.ts':load('../src/lib/documents/terms/firewood-candidate-test-2026-10-28.ts'),'./terms/firewood-checkout-test-2026-10-25.ts':load('../src/lib/documents/terms/firewood-checkout-test-2026-10-25.ts'),'./terms/firewood-2026-10-24.ts':load('../src/lib/documents/terms/firewood-2026-10-24.ts'),'./terms/legacy-2026-10-22.ts':legacy,'@/lib/business-time':load('../src/lib/business-time.ts')});
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
test('legacy quote and invoice clauses match the independently captured pre-change wording',()=>{
 for(const [family,list]of [['quote',legacy.legacyQuoteTerms],['invoice',legacy.legacyInvoiceTerms]]){assert.equal(list.length,baseline[family].count);assert.equal(hash(list),baseline[family].sha256);}
 assert.equal(legacy.DOCUMENT_TERMS_LEGACY_VERSION,baseline.version);
});
test('legacy arrays, individual clauses and computed validity cannot be mutated across documents',()=>{
 for(const list of [terms.quoteTerms,terms.invoiceTerms,terms.getQuoteTerms('2026-11-12T17:00:00Z')]){
  assert.ok(Object.isFrozen(list));assert.ok(list.every(Object.isFrozen));assert.throws(()=>list.push({label:'Changed',text:'Changed'}));assert.throws(()=>list[0].text='Changed');
 }
 assert.equal(hash(terms.quoteTerms),baseline.quote.sha256);
});
test('pre-migration records and explicit legacy bindings have the same wording and date semantics',()=>{
 for(const version of [undefined,null,baseline.version]){assert.deepEqual(terms.getInvoiceTerms(version),terms.invoiceTerms);assert.deepEqual(terms.getQuoteTerms(null,version),terms.quoteTerms);assert.match(terms.getQuoteTerms('2026-11-12T17:00:00Z',version)[0].text,/November 12, 2026/);}
 assert.equal(terms.getQuoteTerms(null)[0].text,'This estimate is valid for 30 days.');
});
test('unknown, blank and malformed version identifiers cannot silently borrow current terms',()=>{
 for(const version of ['future-version','', ' legacy-2026-10-22','__proto__','constructor']){assert.throws(()=>terms.getQuoteTerms(null,version),/terms version is unavailable/);assert.throws(()=>terms.getInvoiceTerms(version),/terms version is unavailable/);}
});
const record={id:'00000000-0000-4000-8000-000000000118',quote_number:'Q-118',invoice_number:'INV-118',status:'sent',created_at:'2026-10-22T12:00:00Z',expires_at:'2026-11-12T17:00:00Z',due_at:'2026-11-22T17:00:00Z',subtotal_cents:10000,total_cents:10000,tax_cents:0,balance_due_cents:10000,edit_revision:1,customers:{display_name:'Synthetic terms customer',email:'terms@example.invalid'},jobs:null,service_locations:null,quote_line_items:[],invoice_line_items:[],customer_message:'Synthetic retained scope',payment_terms:'50% deposit; saved wording unchanged',debris_handling_notes:'Leave chipped material on site'};
test('actual proposal and invoice documents render identical legacy-bound content across their existing outcomes',async()=>{
 for(const kind of ['quote','invoice'])for(const status of kind==='quote'?['draft','sent','approved','declined','cancelled','expired']:['draft','sent','partially_paid','paid','void','overdue']){
  const unbound={...record,status},bound={...unbound,document_terms_version:baseline.version},before=structuredClone(bound);
  const oldView=text(expandPrintTree(await renderPrintCase({kind,record:unbound}))),newView=text(expandPrintTree(await renderPrintCase({kind,record:bound})));
  assert.equal(newView,oldView,kind+' '+status);assert.deepEqual(bound,before);assert.match(newView,/Terms & Conditions/);assert.doesNotMatch(newView,/legacy-2026|document_terms_version/);
 }
});
test('actual document components honor the saved version instead of ignoring an unsupported binding',async()=>{
 for(const kind of ['quote','invoice']){
  const view=await renderPrintCase({kind,record:{...record,document_terms_version:'unsupported-future'}});
  assert.throws(()=>expandPrintTree(view),/terms version is unavailable/);
 }
});
