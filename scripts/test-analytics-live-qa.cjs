const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync(require('node:path').join(__dirname, 'qa-public-analytics-live.py'), 'utf8').match(/PROOF = r'''([\s\S]*?)\n'''/)[1];
test('live-QA observer recognizes Google collectors and never renders raw identifiers or contact values', async () => {
  const output={textContent:''}, listeners={};
  const doc={cookie:'_ga=SYNTHETIC; unrelated=DO_NOT_LOG',getElementById:id=>id==='qa-live-result'?output:{},
    addEventListener:(name,fn)=>listeners[name]=fn,createElement:()=>({style:{},setAttribute(){}}),body:{appendChild(){}}};
  const navigator={sendBeacon:()=>true};
  const window={fetch:()=>Promise.resolve({status:204})};
  vm.runInNewContext(source,{window,navigator,document:doc,URL,URLSearchParams,location:{href:'http://127.0.0.1:1234/'},setInterval(){}});
  listeners.DOMContentLoaded();
  const params=new URLSearchParams({tid:'G-8WMD200TXP',en:'page_view',dl:'https://angeltreeservices.org/services/landscaping/',dt:'/services/landscaping/',cid:'DO_NOT_LOG',_dbg:'1'});
  navigator.sendBeacon('https://www.google-analytics.com/g/collect?'+params,'');
  await window.fetch('https://region1.google-analytics.com/g/collect?'+params,{body:'en=phone_link_click&ep.location=hero&em=HASHED_DO_NOT_LOG'});
  const rows=JSON.parse(output.textContent).collectionAttempts;
  assert.equal(rows.length,2); assert.equal(rows[0].event,'page_view'); assert.equal(rows[0].titleMatchesPath,true);
  assert.equal(rows[0].debugMode,true); assert.equal(rows[1].event,'phone_link_click'); assert.equal(rows[1].contactDataParameterPresent,true);
  assert.equal(rows[1].status,204); assert.doesNotMatch(output.textContent,/DO_NOT_LOG|HASHED_DO_NOT_LOG/);
  params.set('dl','https://angeltreeservices.org/customer/DO_NOT_LOG?qa_private_marker=DO_NOT_SEND');
  params.set('dt','DO_NOT_LOG'); params.set('en','DO_NOT_LOG');
  navigator.sendBeacon('https://www.google-analytics.com/g/collect?'+params,'');
  const last=JSON.parse(output.textContent).collectionAttempts.at(-1);
  assert.equal(last.event,'[unexpected]'); assert.equal(last.path,'[unexpected]'); assert.equal(last.canaryLeaked,true);
  assert.equal(last.pageHasQuery,true); assert.doesNotMatch(output.textContent,/DO_NOT_LOG/);
});
