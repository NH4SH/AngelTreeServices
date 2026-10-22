import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync}from'node:fs';
import {renderToStaticMarkup}from'react-dom/server';
import {loadInstalledRecoveryCase,PortalContact,CustomerDocumentEntry}from'./customer-entry-recovery-fixture.mjs';
import {renderPrintCase}from'./customer-document-print-fixture.mjs';
const enabled=process.env.CUSTOMER_ENTRY_SYNTHETIC==='1'&&Boolean(process.env.CUSTOMER_ENTRY_INPUT_FILE);
test('installed local/staging link states retain capability privacy while offering recovery',{skip:!enabled},async t=>{
 const data=JSON.parse(readFileSync(process.env.CUSTOMER_ENTRY_INPUT_FILE,'utf8'));
 assert.ok(['local-disposable-116','staging-gbyhdsuiqeslgjdnbqng-116'].includes(data.target));assert.equal(data.rolledBack,true);assert.equal(data.anonymousRowsDenied,true);assert.equal(data.cases.length,18);
 for(const c of data.cases)await t.test(c.kind+'/'+c.scenario,async()=>{
  const before=structuredClone(c),{result,telemetry}=await loadInstalledRecoveryCase(c),record=result.quote??result.invoice??result.changeOrder;
  assert.equal(Boolean(record),c.expectedAvailable);assert.equal(telemetry,c.kind==='change_order'&&c.expectedAvailable?1:0);
  const view=await renderPrintCase({...c,record:record??{},principal:c.principal},{lookup:Boolean(record),contact:PortalContact}),html=renderToStaticMarkup(view);
  if(c.expectedAvailable){assert.match(html,/document-print-region/);assert.match(html,/ENTRY_SCOPE_CANARY/);}
  else{assert.match(html,/link unavailable/);assert.match(html,/<summary>Can’t find or open your link\?/);assert.match(html,/tel:\+15403888715/);assert.doesNotMatch(html,/ENTRY_CUSTOMER_CANARY|ENTRY_OTHER_CUSTOMER_CANARY|ENTRY_SCOPE_CANARY|document-print-region|<form|<input/);assert.ok(!html.includes(c.rawToken));assert.ok(!c.token?.token_hash||!html.includes(c.token.token_hash));}
  assert.deepEqual(c,before);
 });
 await t.test('entry guides cannot infer or enumerate documents from fixture records',()=>{
  for(const organization of [false,true]){
   const html=renderToStaticMarkup(CustomerDocumentEntry({organization}));assert.match(html,/secure links we email/);assert.match(html,/tel:\+15403888715/);assert.doesNotMatch(html,/ENTRY_CUSTOMER_CANARY|ENTRY_SCOPE_CANARY|\/api\/|<form|<input/);
   for(const c of data.cases)assert.ok(!html.includes(c.rawToken));
  }
 });
});
