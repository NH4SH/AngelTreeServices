import assert from 'node:assert/strict';import test from 'node:test';import * as jsx from 'react/jsx-runtime';
import * as branding from '../src/lib/company-brand.ts';import * as drafts from '../src/lib/documents/email-drafts.ts';
import {buildMultiQuoteEmailDraft,applyMultiQuoteEmailEdits,applyMultiQuotePortalUrls,renderMultiQuoteEmailHtml} from '../src/lib/quotes/multi-email.ts';
import {renderCustomerDocumentEmailHtml} from '../src/lib/email/customer-document-layout.ts';
import {load,elements,text} from './customer-invoice-fixture.mjs';import {expandPrintTree} from './customer-document-print-fixture.mjs';
const {companyBrand,customerContactEmail,customerContactHref}=branding;
const shell=load('../src/components/documents/document-shell.tsx',{'react/jsx-runtime':jsx,'lucide-react':{Leaf:()=>null},'../../lib/company-brand.ts':branding});
const quote={id:'00000000-0000-4000-8000-000000000001',customer_id:'synthetic',quote_number:'Q-123',status:'sent',total_cents:42500,customers:{display_name:'Synthetic customer',email:'customer@example.invalid'},jobs:{service_type:'lawn_care',requested_scope:'Historical lawn care scope'},quote_line_items:[],notes:[],expires_at:null,service_locations:{street:'1 Test Lane',city:'Fredericksburg',state:'VA'}};
const invoice={...quote,invoice_number:'INV-SYNTHETIC',balance_due_cents:22500,invoice_line_items:[],payment_terms:'Net 30',notes:[]},email='customer-care@example.invalid';
test('public defaults preserve established email and website spellings; malformed settings use a public fallback',()=>{
 assert.equal(customerContactEmail(),'info@angeltreeservice.org');assert.equal(companyBrand.website,'angeltreeservices.org');assert.equal(companyBrand.phoneHref,'tel:+15403888715');
 assert.equal(customerContactEmail('Office <office@example.invalid>'),'office@example.invalid');
 for(const bad of ['javascript:alert(1)','office@example.invalid\r\nBcc:x@example.invalid','a@example.invalid,b@example.invalid','<img src=x>','not an address'])assert.equal(customerContactEmail(bad),companyBrand.email);
});
test('mailto contact cannot turn valid local-part punctuation into URL parameters',()=>{
 assert.equal(customerContactHref('office?subject=test@example.invalid'),'mailto:office%3Fsubject%3Dtest@example.invalid');
});
test('proposal and invoice HTML/text use configured contact without changing financial or historical scope facts',()=>{
 for(const [make,input]of[[drafts.generateQuoteEmailDraft,quote],[drafts.generateInvoiceEmailDraft,invoice]]){
  const before=structuredClone(input),baseline=make(input),draft=make(input,{contactEmail:email,portalUrl:'https://crm.example.invalid/secure'});
  assert.equal(draft.contactEmail,email);assert.match(draft.body,/customer-care@example\.invalid/);const html=renderCustomerDocumentEmailHtml(draft);
  assert.match(html,/mailto:customer-care@example\.invalid/);assert.doesNotMatch(html,/info@angeltreeservice\.org/);
  for(const key of ['summaryLabel','summaryValue','timingValue','customerNotes','scopeText'])assert.equal(draft[key],baseline[key]);assert.deepEqual(input,before);
 }
 assert.match(drafts.generateQuoteEmailDraft(quote).intro,/lawn care work/);
});
test('customer edits and link recovery preserve the generated contact signature',()=>{
 const draft=drafts.generateQuoteEmailDraft(quote,{contactEmail:email}),edits=Object.fromEntries(['subject','greeting','intro','scopeText','customerNotes','closing'].map(k=>[k,draft[k]]));
 assert.equal(drafts.applyCustomerDocumentEmailEdits(draft,{...edits,contactEmail:'forged@example.invalid'}).contactEmail,email);
 const multi=buildMultiQuoteEmailDraft([{quote},{quote:{...quote,id:'00000000-0000-4000-8000-000000000002'}}],undefined,{contactEmail:email});
 const updated=applyMultiQuotePortalUrls(applyMultiQuoteEmailEdits(multi,{subject:multi.subject,greeting:multi.greeting,intro:multi.intro,closing:multi.closing,contactEmail:'forged@example.invalid'}),{[quote.id]:'https://crm.example.invalid/secure'});
 assert.equal(updated.contactEmail,email);assert.match(updated.body,/customer-care@example\.invalid/);assert.match(renderMultiQuoteEmailHtml(updated),/mailto:customer-care@example\.invalid/);assert.deepEqual(updated.items.map(x=>x.totalLabel),multi.items.map(x=>x.totalLabel));
});
test('server templates choose the same public Reply-To for HTML and text without sender/internal details',()=>{
 const templates=load('../src/lib/email/templates.ts',{'server-only':{},'@/lib/email/config':{getEmailSetupState:()=>({replyTo:email,from:'PRIVATE-SENDER',internalLeadNotificationEmail:'PRIVATE-INTERNAL'})},'@/lib/documents/email-drafts':drafts,'@/lib/email/customer-document-layout':{renderCustomerDocumentEmailHtml},'@/lib/security/app-base-url':{buildCanonicalAppUrl:path=>'https://crm.example.invalid'+path}});
 for(const template of [templates.quoteEmailTemplate(quote),templates.invoiceEmailTemplate(invoice)]){assert.match(template.text,/customer-care@example\.invalid/);assert.match(template.html,/customer-care@example\.invalid/);assert.doesNotMatch(template.text+template.html,/PRIVATE-SENDER|PRIVATE-INTERNAL/);}
});
test('shared document footer has complete public contact and confirmed service wording',()=>{
 const view=expandPrintTree(shell.DocumentShell({documentLabel:'Proposal',documentNumber:'Synthetic',contactEmail:email,children:'Synthetic scope'}));assert.match(text(view),/Tree service and landscaping/);assert.doesNotMatch(text(view),/lawn care/);
 const footer=elements(view).find(x=>x.type==='footer');for(const value of [companyBrand.name,companyBrand.phone,companyBrand.website,email,companyBrand.region])assert.ok(text(footer).includes(value));
});
