import * as branding from '../src/lib/company-brand.ts';
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
const shell=load('../src/components/documents/document-shell.tsx',{'../../lib/company-brand.ts':branding,'react/jsx-runtime':jsx,'lucide-react':{Leaf:()=>null}});
const terms=load('../src/lib/documents/terms.ts',{'@/lib/business-time':{formatBusinessDate:()=> 'Synthetic date'}});
const documentTerms=load('../src/components/documents/document-terms.tsx',{'react/jsx-runtime':jsx});
const InvoiceDocument=load('../src/components/documents/invoice-document.tsx',{'react/jsx-runtime':jsx,'@/components/documents/document-shell':shell,'@/components/documents/document-terms':documentTerms,'@/lib/documents/terms':terms,'@/lib/email/config':{getEmailSetupState:()=>({replyTo:'office@example.invalid'})},'@/lib/business-time':{formatBusinessDateTime:()=> 'Synthetic date'},'@/lib/invoices/status':{formatInvoiceStatus:status=>status,getInvoiceDisplayNumber:n=>n}}).InvoiceDocument;
const Chooser=()=>null,Contact=()=>null;
function harness({rate={available:true,allowed:true},invoice=true,client=true,receipt={error:null,totalCents:70000},record:changes={},paymentRead=async()=>receipt,contact=Contact}={}) {
 const calls=[],db={synthetic:true};
 const record={id:'00000000-0000-4000-8000-000000000001',invoice_number:'SYNTHETIC',status:'sent',total_cents:100000,payments:[{status:'succeeded',provider:'stripe',payment_method:'card',amount_cents:90000}],invoice_line_items:[],jobs:null,subtotal_cents:100000,tax_cents:0,balance_due_cents:0,created_at:'2026-10-22T12:00:00Z',customers:{display_name:'Synthetic customer'},...changes};
 const page=load('../src/app/portal/invoice/[token]/page.tsx',{
  'react/jsx-runtime':jsx,
  'lucide-react':Object.fromEntries(['CalendarDays','CircleDollarSign','MapPin','ReceiptText','ShieldCheck'].map(k=>[k,()=>null])),
  '@/components/documents/invoice-document':{InvoiceDocument},
  '@/components/documents/print-button':{PrintButton:()=>null},
  '@/components/invoice-portal-payment-button':{InvoicePortalPaymentChooser:Chooser},
  '@/components/portal-contact':{PortalContact:contact},
  '@/components/portal-view-tracker':{PortalViewTracker:()=>null},
  '@/lib/portal/customer-states':states,
  '../../customer-clarity.css':{},'../../customer-print.css':{},
  '@/lib/security/portal-rate-limit':{checkPortalPageRateLimit:async()=>{calls.push('rate');return rate;}},
  '@/lib/data/portal-invoice':{getInvoiceByPortalToken:async()=>{calls.push('token');return{invoice:invoice?record:null,message:'Synthetic invalid capability'};}},
  '@/lib/supabase/admin':{getServiceRoleClient:()=>{calls.push('client');return client?db:null;}},
  '@/lib/payments/reconciliation':{getSuccessfulPaymentTotal:async(actual,id)=>{assert.equal(actual,db);assert.equal(id,record.id);calls.push('principal');return paymentRead(actual,id);}},
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


export {load,harness,elements,text,InvoiceDocument,Chooser};
