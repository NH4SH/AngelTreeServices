import assert from 'node:assert/strict';
import test from 'node:test';
import {load} from './pr10-test-helpers.mjs';
import {formatBusinessDate} from '../src/lib/business-time.ts';
import {renderCustomerReminderEmailHtml} from '../src/lib/email/customer-reminder-layout.ts';
import {renderCustomerDocumentAction} from '../src/lib/email/customer-document-action.ts';

const templates=load('../src/lib/communications/templates.ts',{'@/lib/email/config':{getEmailSetupState:()=>({replyTo:'office@example.invalid'})},'server-only':{},'@/lib/business-time':{formatBusinessDate},'../email/customer-reminder-layout.ts':{renderCustomerReminderEmailHtml}});
const invoice=(patch={})=>templates.invoiceReminderTemplate({balanceDueCents:175099,customerName:'Jamie Sample',dueAt:'2026-11-05',invoiceNumber:'261021-200',isOverdue:false,portalUrl:'https://stage.example.invalid/portal/invoice/synthetic-review',serviceLocation:'123 Sample Lane, Fredericksburg, VA 22401',...patch});
const quote=(patch={})=>templates.quoteFollowUpTemplate({customerName:'Jamie Sample',lineItems:[{name:'Oak removal',description:'Remove the marked tree and clean up.'}],portalUrl:'https://stage.example.invalid/portal/quote/synthetic-review',proposalNumber:'261021-100',...patch});
const anchors=html=>[...html.matchAll(/<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map(m=>({href:m[1],label:m[2]}));

test('invoice reminders provide a named document action, copyable matching backup, accurate facts and recovery in both formats',()=>{
 const r=invoice(),links=anchors(r.html),url='https://stage.example.invalid/portal/invoice/synthetic-review';
 assert.equal(links.filter(a=>a.href===url).length,2);assert.equal(links.find(a=>a.href===url).label,'View invoice');
 for(const text of ['$1,750.99','November 5, 2026','123 Sample Lane','261021-200']){assert.ok(r.text.includes(text));assert.ok(r.html.includes(text));}
 assert.ok(r.text.includes(url));assert.match(r.html,/copy and paste this secure link/);assert.match(r.html,/href="tel:\+15403888715"/);
 for(const body of [r.html,r.text]){assert.match(body,/already paid or started a payment/);assert.match(body,/latest balance and payment status/);assert.match(body,/Need help or a new link/);assert.match(body,/540\) 388-8715/);}
 assert.doesNotMatch(r.subject,/received|receipt/i);assert.doesNotMatch(r.html,/<form|<script|<img|lawn care/i);
});
test('overdue notices remain balance reminders rather than receipts or new payment terms',()=>{
 const r=invoice({isOverdue:true});assert.match(r.html,/<h1[^>]*>Invoice balance reminder<\/h1>/);assert.match(r.text,/Our records show a remaining balance/);
 assert.match(r.html,/>View invoice<\/a>/);assert.doesNotMatch(r.text,/late fee|15 days|3%|payment received|pay immediately/i);
});
test('proposal follow-up action leads to the document before optional scope and keeps the existing bounded scope',()=>{
 const lines=Array.from({length:6},(_,i)=>({name:'Service '+i,description:'x'.repeat(240)}));const r=quote({lineItems:lines});
 assert.match(r.html,/>Review proposal<\/a>/);assert.ok(r.html.indexOf('>Review proposal</a>')<r.html.indexOf('>Proposed work</h2>'));
 assert.ok(r.text.indexOf('Review proposal:')<r.text.indexOf('Proposed work:'));
 for(let i=0;i<4;i++){assert.ok(r.html.includes('Service '+i));assert.ok(r.text.includes('Service '+i));}
 assert.doesNotMatch(r.html,/Service 4|Service 5/);assert.doesNotMatch(r.text,/x{181}/);
 assert.match(r.text,/Proposal #261021-100/);assert.doesNotMatch(r.html,/href="[^\"]*(?:approve|checkout|pay-now)/i);
});
test('missing optional dates, locations, proposal numbers and scope use truthful concise fallbacks',()=>{
 for(const dueAt of [null,'not-a-date']){const r=invoice({dueAt,serviceLocation:''});assert.match(r.html,/See the invoice for payment terms/);assert.doesNotMatch(r.html,/Invalid date|Service location|15 days/);}
 const r=quote({lineItems:[],proposalNumber:null});assert.match(r.text,/your proposal/);assert.doesNotMatch(r.html,/Proposed work|Proposal #null|Proposal #undefined/);assert.match(r.html,/>Review proposal<\/a>/);
});
test('HTML escapes customer and source content, and keeps the intended secure URL intact',()=>{
 const r=invoice({customerName:'Álex <img src=x onerror=alert(1)> & 李',invoiceNumber:'A" <script>bad</script>',serviceLocation:'<b>Sample</b> & Co',portalUrl:'https://stage.example.invalid/portal/invoice/a&b"<review>'});
 assert.doesNotMatch(r.html,/<img|<script>|<b>Sample/);assert.match(r.html,/&lt;img/);assert.match(r.html,/&lt;script&gt;/);assert.match(r.html,/Álex/);assert.match(r.html,/李/);
 assert.equal(anchors(r.html).filter(a=>a.href==='https://stage.example.invalid/portal/invoice/a&amp;b&quot;&lt;review&gt;').length,2);
 assert.match(r.text,/<b>Sample<\/b> & Co/);
 const q=quote({lineItems:[{name:'<svg onload=bad>',description:'<img src=bad>'}]});assert.doesNotMatch(q.html,/<svg|<img/);assert.match(q.html,/&lt;svg/);
});
test('new clickable reminders reject unsafe schemes or credential-bearing links without exposing them',()=>{
 for(const portalUrl of ['javascript:alert(1)','data:text/html,test','//stage.example.invalid/portal/invoice/test','http://external.example.invalid/private-token','https://user:password@example.invalid/private-token','not a URL']){
  assert.throws(()=>invoice({portalUrl}),error=>error.message==='A secure reminder document link is required.');
 }
 for(const portalUrl of ['http://127.0.0.1:3102/portal/invoice/synthetic','http://localhost:3102/portal/invoice/synthetic','https://stage.example.invalid/portal/invoice/synthetic'])assert.match(invoice({portalUrl}).html,/>View invoice<\/a>/);
});
test('shared document action retains optional-link behavior, escaping and responsive email-safe structure',()=>{
 assert.equal(renderCustomerDocumentAction(null,'View'), '');
 const html=renderCustomerDocumentAction('https://example.invalid/a?x=1&y=`2`','Review <proposal>');
 assert.match(html,/role="presentation"/);assert.match(html,/font-size:12px/);assert.match(html,/Review &lt;proposal&gt;/);assert.match(html,/x=1&amp;y=&#096;2&#096;/);
 assert.match(invoice().html,/font-size:14px/);assert.match(invoice().html,/name="viewport"/);assert.match(invoice().html,/<html lang="en">/);assert.match(invoice().html,/word-break:break-word/);
});
