import assert from 'node:assert/strict';import test from 'node:test';import{readFileSync}from'node:fs';import{renderToStaticMarkup}from'react-dom/server';
import{renderPrintCase,expandPrintTree,elements}from'./customer-document-print-fixture.mjs';
import{generateQuoteEmailDraft,generateInvoiceEmailDraft}from'../src/lib/documents/email-drafts.ts';import{renderCustomerDocumentEmailHtml}from'../src/lib/email/customer-document-layout.ts';
import{buildMultiQuoteEmailDraft,renderMultiQuoteEmailHtml}from'../src/lib/quotes/multi-email.ts';
const enabled=process.env.CUSTOMER_BRANDING_SYNTHETIC==='1'&&Boolean(process.env.CUSTOMER_BRANDING_INPUT_FILE);
test('installed local/staging customer documents preserve financial facts with consistent branding',{skip:!enabled},async t=>{
 const data=JSON.parse(readFileSync(process.env.CUSTOMER_BRANDING_INPUT_FILE));assert.ok(['local-disposable-116','staging-gbyhdsuiqeslgjdnbqng-116'].includes(data.target));assert.equal(data.rolledBack,true);assert.equal(data.cases.length,6);
 for(const c of data.cases)await t.test(c.kind+'/'+c.variant,async()=>{
  assert.ok(c.record);const before=structuredClone(c.record),view=await renderPrintCase(c),paper=elements(expandPrintTree(view)).filter(x=>x.props.className?.split(' ').includes('document-print-region'));
  assert.equal(paper.length,1);const html=renderToStaticMarkup(paper[0]);
  for(const contact of ['Angel Tree Services','(540) 388-8715','office@example.invalid','angeltreeservices.org'])assert.ok(html.includes(contact));
  if(c.kind!=='change_order'){assert.match(html,/Tree service and landscaping/);assert.doesNotMatch(html,/Tree service, landscaping, and lawn care/);}
  for(let n=1;n<=(c.variant==='long'?8:1);n++)assert.ok(html.includes('SCOPE-LINE-'+n+'-END'));
  assert.ok(!html.includes(c.rawToken));assert.ok(!html.includes('Print or save'));assert.ok(!html.includes('headers and footers'));
  if(c.kind==='invoice'){assert.ok(html.includes('$80.00'));assert.ok(html.includes('-$20.00'));}else assert.ok(html.includes('$100.00'));
  if(c.kind==='change_order')assert.ok(html.includes('$600.00'));
  if(c.kind!=='change_order'){
   const make=c.kind==='quote'?generateQuoteEmailDraft:generateInvoiceEmailDraft;
   const record=c.kind==='invoice'?{...c.record,balance_due_cents:8000}:c.record,draft=make(record,{contactEmail:'office@example.invalid'}),mail=renderCustomerDocumentEmailHtml(draft);
   assert.match(draft.body,/office@example.invalid/);assert.match(mail,/mailto:office@example.invalid/);
   assert.ok(draft.summaryValue.includes(c.kind==='invoice'?'80':'100'));
   if(c.kind==='quote'){
    const sibling={...record,id:'00000000-0000-4000-8000-000000000002',quote_number:'SYNTHETIC-SIBLING'};
    const multi=buildMultiQuoteEmailDraft([{quote:record},{quote:sibling}],undefined,{contactEmail:'office@example.invalid'});
    assert.match(renderMultiQuoteEmailHtml(multi),/mailto:office@example.invalid/);assert.match(multi.body,/office@example.invalid/);
   }
  }
  assert.deepEqual(c.record,before);
 });
});
