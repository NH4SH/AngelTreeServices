import assert from 'node:assert/strict';import test from 'node:test';
import {PrintButton,Link,renderPrintCase,expandPrintTree,elements,text} from './customer-document-print-fixture.mjs';
test('print controls are deliberate button actions with linked privacy help, never form submissions',()=>{
 const previous=globalThis.window;let calls=0;globalThis.window={print(){calls++;}};
 try{for(const label of ['Print or save proposal','Print or save invoice','Print or save change order']){
  const control=PrintButton({label,showPrivacyHint:true}),nodes=elements(control),button=nodes.find(x=>x.type==='button'),hint=nodes.find(x=>x.props.id===button.props['aria-describedby']);
  assert.equal(calls,0);assert.equal(button.props.type,'button');assert.ok(text(button).includes(label));assert.ok(text(hint).includes('headers and footers'));
  button.props.onClick();assert.equal(calls,1);calls=0;
 }}finally{if(previous===undefined)delete globalThis.window;else globalThis.window=previous;}
});
test('existing staff print links and default labels keep their behavior without a new hint wrapper',()=>{
 const link=PrintButton({href:'/admin/quotes/synthetic/print'});assert.equal(link.type,Link);assert.equal(link.props.href,'/admin/quotes/synthetic/print');assert.equal(link.props.target,'_blank');assert.ok(text(link).includes('Print preview'));assert.equal(link.props['aria-describedby'],undefined);
});
for(const kind of ['quote','invoice','change_order'])test(kind+' prints one authorized document with its current facts and no raw capability',async()=>{
 const record={id:'00000000-0000-4000-8000-000000000001',status:'sent',quote_number:'PRINT-TEST',invoice_number:'PRINT-TEST',change_order_number:'PRINT-TEST',created_at:'2026-10-22T12:00:00Z',total_cents:10000,subtotal_cents:10000,balance_due_cents:10000,tax_cents:0,original_approved_amount_cents:50000,customers:{display_name:'Synthetic customer'},quote_line_items:[],invoice_line_items:[],change_order_line_items:[],payments:[]};
 const rawToken='SYNTHETIC_PRIVATE_CAPABILITY_NEVER_PRINT_THIS',c={kind,record,rawToken,principal:{paid_principal_cents:2000}},before=structuredClone(record),view=await renderPrintCase(c);
 const controls=elements(view).filter(x=>x.props.label?.startsWith('Print or save'));assert.equal(controls.length,1);assert.equal(controls[0].props.showPrivacyHint,true);
 const papers=elements(expandPrintTree(view)).filter(x=>x.props.className?.split(' ').includes('document-print-region'));assert.equal(papers.length,1);
 assert.ok(!text(papers[0]).includes(rawToken));assert.ok(!text(papers[0]).includes('headers and footers'));
 if(kind==='invoice')assert.ok(text(papers[0]).includes('$80.00'));
 if(kind==='quote')assert.ok(text(papers[0]).includes('Awaiting your response'));
 if(kind==='change_order')assert.ok(text(papers[0]).includes('$600.00'));
 assert.deepEqual(record,before);
});
test('unavailable or throttled capabilities never expose a document or print action',async()=>{
 for(const kind of ['quote','invoice','change_order'])for(const options of [{allowed:false},{available:false},{lookup:false}]){
  const view=await renderPrintCase({kind,record:{}},options),nodes=elements(expandPrintTree(view));assert.ok(!nodes.some(x=>x.props.className?.split(' ').includes('document-print-region')));assert.ok(!nodes.some(x=>x.props.label?.startsWith('Print or save')));
 }
});
