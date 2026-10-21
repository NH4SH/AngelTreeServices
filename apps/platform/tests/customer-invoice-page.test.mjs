import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url),ts=require('typescript');
const jsx=require('react/jsx-runtime');
function load(file,deps={}) {
 const source=readFileSync(new URL(file,import.meta.url),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const module={exports:{}};
 new Function('require','module','exports',js)(name=>{assert.ok(name in deps,`Unexpected import ${name}`);return deps[name];},module,module.exports);
 return module.exports;
}
const states=load('../src/lib/portal/customer-states.ts');
const InvoiceDocument=()=>null,Chooser=()=>null,Contact=()=>null;
function harness({rate={available:true,allowed:true},invoice=true,client=true,receipt={error:null,totalCents:70000}}={}) {
 const calls=[],db={synthetic:true};
 const record={id:'00000000-0000-4000-8000-000000000001',invoice_number:'SYNTHETIC',status:'sent',total_cents:100000,payments:[{status:'succeeded',provider:'stripe',payment_method:'card',amount_cents:90000}],invoice_line_items:[],jobs:null};
 const page=load('../src/app/portal/invoice/[token]/page.tsx',{
  'react/jsx-runtime':jsx,
  'lucide-react':Object.fromEntries(['CalendarDays','CircleDollarSign','MapPin','ReceiptText','ShieldCheck'].map(k=>[k,()=>null])),
  '@/components/documents/invoice-document':{InvoiceDocument},
  '@/components/documents/print-button':{PrintButton:()=>null},
  '@/components/invoice-portal-payment-button':{InvoicePortalPaymentChooser:Chooser},
  '@/components/portal-contact':{PortalContact:Contact},
  '@/components/portal-view-tracker':{PortalViewTracker:()=>null},
  '@/lib/portal/customer-states':states,
  '../../customer-clarity.css':{},
  '@/lib/security/portal-rate-limit':{checkPortalPageRateLimit:async()=>{calls.push('rate');return rate;}},
  '@/lib/data/portal-invoice':{getInvoiceByPortalToken:async()=>{calls.push('token');return{invoice:invoice?record:null,message:'Synthetic invalid capability'};}},
  '@/lib/supabase/admin':{getServiceRoleClient:()=>{calls.push('client');return client?db:null;}},
  '@/lib/payments/reconciliation':{getSuccessfulPaymentTotal:async(actual,id)=>{assert.equal(actual,db);assert.equal(id,record.id);calls.push('principal');return receipt;}},
  '@/lib/business-time':{formatBusinessDateTime:()=> 'Synthetic date'},
  '@/lib/invoices/status':{getInvoiceDisplayNumber:n=>n},
  '@/lib/stripe/server':{getStripeServerConfig:()=>({configured:false})},
  '@/lib/payments/payment-options':{getInvoicePaymentConfiguration:()=>({cardEnabled:false,businessCheckMailingAddress:null,stripePublishableKey:null,surchargeBps:300,surchargeEnabled:false})},
 }).default;
 return {calls,record,render:payment=>page({params:Promise.resolve({token:'synthetic-capability'}),searchParams:Promise.resolve({payment})})};
}
function elements(node) {
 if(Array.isArray(node))return node.flatMap(elements);
 return node&&typeof node==='object'&&'props'in node?[node,...elements(node.props.children)]:[];
}
function text(node) {
 if(Array.isArray(node))return node.map(text).join(' ');
 if(node&&typeof node==='object'&&'props'in node)return text(node.props.children);
 return typeof node==='string'||typeof node==='number'?String(node):'';
}

test('invoice balance and chooser use the complete checkout principal receipt rather than an embedded payment list',async()=>{
 const h=harness(),view=await h.render();
 assert.deepEqual(h.calls,['rate','token','client','principal']);
 const chooser=elements(view).find(e=>e.type===Chooser);
 assert.ok(chooser);assert.equal(chooser.props.amountDueCents,30000);
 assert.match(text(view),/\$300\.00/);assert.doesNotMatch(text(view),/\$100\.00/);
 assert.equal(elements(view).find(e=>e.type===InvoiceDocument).props.invoice,h.record);
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
