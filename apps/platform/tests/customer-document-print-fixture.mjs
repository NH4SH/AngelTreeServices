import * as branding from '../src/lib/company-brand.ts';
import * as jsx from 'react/jsx-runtime';
import {load,harness as invoiceHarness,elements,text} from './customer-invoice-fixture.mjs';
const icon=()=>null,Link=()=>null;
const PrintButton=load('../src/components/documents/print-button.tsx',{'react/jsx-runtime':jsx,'next/link':Link,'lucide-react':{Printer:icon},react:{useId:()=> 'synthetic-print-help'}}).PrintButton;
const business=load('../src/lib/business-time.ts'),numbers=load('../src/lib/quotes/proposal-number.ts');
const drafts=load('../src/lib/documents/email-drafts.ts',{'./terms/firewood-2026-10-24.ts':load('../src/lib/documents/terms/firewood-2026-10-24.ts'),'../company-brand.ts':branding,'../quotes/proposal-number.ts':numbers});
const shell=load('../src/components/documents/document-shell.tsx',{'../../lib/company-brand.ts':branding,'react/jsx-runtime':jsx,'lucide-react':{Leaf:icon}});
const terms=load('../src/lib/documents/terms.ts',{'./terms/firewood-checkout-test-2026-10-25.ts':load('../src/lib/documents/terms/firewood-checkout-test-2026-10-25.ts'),'./terms/firewood-2026-10-24.ts':load('../src/lib/documents/terms/firewood-2026-10-24.ts'),'./terms/legacy-2026-10-22.ts':load('../src/lib/documents/terms/legacy-2026-10-22.ts'),'@/lib/business-time':business});
const documentTerms=load('../src/components/documents/document-terms.tsx',{'react/jsx-runtime':jsx});
const QuoteDocument=load('../src/components/documents/quote-document.tsx',{'react/jsx-runtime':jsx,'@/components/documents/document-shell':shell,'@/components/documents/document-terms':documentTerms,'@/lib/documents/terms':terms,'@/lib/documents/email-drafts':drafts,'@/lib/email/config':{getEmailSetupState:()=>({replyTo:'office@example.invalid'})},'@/lib/business-time':business,'../../lib/quotes/proposal-number.ts':numbers}).QuoteDocument;
const states=load('../src/lib/portal/customer-states.ts'),presentation=load('../src/lib/portal/quote-presentation.ts');
export async function renderPrintCase(c,{allowed=true,available=true,lookup=true,contact=()=>null}={}){
 if(c.kind==='invoice')return invoiceHarness({record:c.record,rate:{available,allowed},invoice:lookup,receipt:{error:null,totalCents:c.principal?.paid_principal_cents??0},contact}).render();
 const shared={'react/jsx-runtime':jsx,'lucide-react':Object.fromEntries(['FileSignature','Leaf','ShieldCheck','FilePlus2','MapPin'].map(k=>[k,icon])),
  '@/components/documents/document-shell':shell,'@/lib/email/config':{getEmailSetupState:()=>({replyTo:'office@example.invalid'})},'@/components/documents/print-button':{PrintButton},'@/components/portal-contact':{PortalContact:contact},'@/lib/portal/customer-states':states,
  '../../customer-clarity.css':{},'../../customer-print.css':{},'@/lib/security/portal-rate-limit':{checkPortalPageRateLimit:async()=>({allowed,available})}};
 let page;
 if(c.kind==='quote')page=load('../src/app/portal/quote/[token]/page.tsx',{...shared,'@/components/documents/quote-document':{QuoteDocument},'@/components/portal-quote-actions':{PortalQuoteActions:()=>null},'@/components/portal-view-tracker':{PortalViewTracker:()=>null},'@/lib/data/portal-quote':{getQuoteByPortalToken:async()=>({quote:lookup?c.record:null,message:'Synthetic unavailable link'})},'@/lib/business-time':business,'@/lib/documents/email-drafts':drafts,'@/lib/portal/quote-presentation':presentation}).default;
 else page=load('../src/app/portal/change-order/[token]/page.tsx',{...shared,'@/components/portal-change-order-actions':{PortalChangeOrderActions:()=>null},'@/lib/data/change-orders':{getChangeOrderByPortalToken:async()=>({changeOrder:lookup?c.record:null,message:'Synthetic unavailable link'})}}).default;
 return page({params:Promise.resolve({token:c.rawToken??'synthetic-private-capability-not-a-real-link'})});
}
export function expandPrintTree(node){
 if(Array.isArray(node))return node.map(expandPrintTree);
 if(node&&typeof node==='object'&&'props'in node){if(typeof node.type==='function')return expandPrintTree(node.type(node.props));return{...node,props:{...node.props,children:expandPrintTree(node.props.children)}};}
 return node;
}
export {PrintButton,Link,elements,text};
