import assert from 'node:assert/strict';
import test from 'node:test';
import {harness,elements,text,InvoiceDocument,Chooser} from './customer-invoice-fixture.mjs';

// Evaluate these pure document components under the unit runner's react-server
// condition. Actual React DOM rendering is covered by the SQL-backed suite.
function expand(node){
 if(Array.isArray(node))return node.map(expand);
 if(node&&typeof node==='object'&&'props'in node){if(typeof node.type==='function')return expand(node.type(node.props));return{...node,props:{...node.props,children:expand(node.props.children)}};}
 return node;
}

test('invoice balance and chooser use the complete checkout principal receipt rather than an embedded payment list',async()=>{
 const h=harness(),view=await h.render();
 assert.deepEqual(h.calls,['rate','token','client','principal']);
 const chooser=elements(view).find(e=>e.type===Chooser);
 assert.ok(chooser);assert.equal(chooser.props.amountDueCents,30000);
 assert.match(text(view),/\$300\.00/);assert.doesNotMatch(text(view),/\$100\.00/);
 const rendered=elements(view).find(e=>e.type===InvoiceDocument).props.invoice;
 assert.equal(rendered.balance_due_cents,30000);assert.equal(rendered.id,h.record.id);assert.equal(h.record.balance_due_cents,0);assert.notEqual(rendered,h.record);
});
test('rate limits and invalid capabilities stop before privileged balance reads',async()=>{
 for(const [options,expected]of [[{rate:{available:false,allowed:false}},['rate']],[{rate:{available:true,allowed:false}},['rate']],[{invoice:false},['rate','token']]]){
  const h=harness(options),view=await h.render();assert.deepEqual(h.calls,expected);
  assert.equal(view.type.name,'PortalUnavailable');assert.ok(!elements(view).some(e=>e.type===Chooser||e.type===InvoiceDocument));
 }
});
test('a missing client or failed principal receipt shows recovery help without a guessed balance or payment chooser',async()=>{
 for(const options of [{client:false},{receipt:{error:'Synthetic read unavailable',totalCents:0}}]){
  const h=harness(options),view=await h.render();assert.equal(view.type.name,'PortalUnavailable');
  assert.match(view.props.message,/balance could not be confirmed/);assert.doesNotMatch(view.props.message,/Synthetic read unavailable/);
  assert.ok(!elements(view).some(e=>e.type===Chooser||e.type===InvoiceDocument));
 }
});
test('a complete settled receipt and pending payments both prevent a second payment even with a return hint',async()=>{
 const paid=harness({receipt:{error:null,totalCents:100000}});paid.record.status='paid';
 const settled=await paid.render('success');assert.match(text(settled),/Payment received/);assert.ok(!elements(settled).some(e=>e.type===Chooser));
 const pending=harness();pending.record.payments=[{status:'pending',provider:'stripe',payment_method:'ach'}];
 const processing=await pending.render('cancelled');assert.match(text(processing),/Your bank payment is processing/);assert.ok(!elements(processing).some(e=>e.type===Chooser));
});

test('the full printable document and payment review agree despite a stale stored balance',async()=>{
 for(const c of [
  {name:'unpaid',principal:0,due:100000,stored:0},
  {name:'partial',principal:40000,due:60000,stored:100000},
  {name:'refunded principal',principal:20000,due:80000,stored:60000},
  {name:'lost dispute',principal:30000,due:70000,stored:60000},
  {name:'settled',principal:100000,due:0,stored:100000,status:'paid'},
  {name:'overpayment stays clamped',principal:120000,due:0,stored:100000},
  {name:'pending is not received money',principal:0,due:100000,stored:0,payments:[{status:'pending',provider:'stripe',payment_method:'ach'}]},
 ]){
  const h=harness({receipt:{error:null,totalCents:c.principal},record:{balance_due_cents:c.stored,status:c.status??'sent',payments:c.payments??[]}});
  const view=await h.render(),money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n/100);
  const document=expand(elements(view).find(e=>e.type===InvoiceDocument)),nodes=elements(document);
  const totals=nodes.find(e=>e.type==='dl'&&e.props.className?.includes('invoice-document-totals'));
  assert.ok(totals,c.name);assert.ok(text(totals).includes('Balance due '+money(c.due)),c.name);
  assert.ok(nodes.some(e=>e.type==='strong'&&text(e).replace(/\s+/g,' ')==='Balance due: '+money(c.due)),c.name);
  const applied=Math.min(c.principal,100000);assert.equal(elements(totals).some(e=>e.type==='dt'&&text(e)==='Paid'),applied>0,c.name);
  if(applied)assert.ok(text(totals).includes('Paid - '+money(applied)),c.name);
  const chooser=elements(view).find(e=>e.type===Chooser);if(chooser)assert.equal(chooser.props.amountDueCents,c.due,c.name);
  assert.equal(h.record.balance_due_cents,c.stored,'Rendering must not reconcile or mutate the invoice');
 }
});
