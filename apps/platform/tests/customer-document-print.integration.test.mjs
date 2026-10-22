import assert from 'node:assert/strict';import test from 'node:test';import {readFileSync}from'node:fs';import {renderToStaticMarkup}from'react-dom/server';
import {renderPrintCase,expandPrintTree,elements}from'./customer-document-print-fixture.mjs';
const enabled=process.env.CUSTOMER_PRINT_SYNTHETIC==='1'&&Boolean(process.env.CUSTOMER_PRINT_INPUT_FILE);
test('installed local/staging synthetic document inputs preserve printable content',{skip:!enabled},async t=>{
 const data=JSON.parse(readFileSync(process.env.CUSTOMER_PRINT_INPUT_FILE,'utf8'));assert.ok(['local-disposable-116','staging-gbyhdsuiqeslgjdnbqng-116'].includes(data.target));assert.equal(data.rolledBack,true);assert.equal(data.cases.length,6);
 for(const c of data.cases)await t.test(c.kind+'/'+c.variant,async()=>{
  assert.ok(c.record);const before=structuredClone(c.record),view=await renderPrintCase(c),papers=elements(expandPrintTree(view)).filter(x=>x.props.className?.split(' ').includes('document-print-region'));
  assert.equal(papers.length,1);const html=renderToStaticMarkup(papers[0]),count=c.variant==='long'?8:1;
  for(let n=1;n<=count;n++)assert.ok(html.includes('SCOPE-LINE-'+n+'-END'));
  assert.ok(!html.includes(c.rawToken));assert.ok(!html.includes('Print or save'));assert.ok(!html.includes('headers and footers'));
  if(c.kind==='invoice'){assert.ok(html.includes('$80.00'));assert.ok(html.includes('-$20.00'));}else assert.ok(html.includes('$100.00'));
  if(c.kind==='change_order')assert.ok(html.includes('$600.00'));
  assert.deepEqual(c.record,before);
 });
});
