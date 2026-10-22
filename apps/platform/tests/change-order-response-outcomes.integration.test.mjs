import assert from'node:assert/strict';import test from'node:test';import{readFileSync}from'node:fs';import{renderToStaticMarkup}from'react-dom/server';
import{outcomeAction,outcomeTree}from'./change-order-response-outcomes-fixture.mjs';import{initialChangeOrderActionState as idle}from'../src/lib/action-states/change-orders.ts';
const enabled=process.env.CHANGE_ORDER_OUTCOME_SYNTHETIC==='1'&&Boolean(process.env.CHANGE_ORDER_OUTCOME_INPUT_FILE);
test('installed local/staging commands retain safe outcomes, exact retries and service-only access',{skip:!enabled},async t=>{
 const data=JSON.parse(readFileSync(process.env.CHANGE_ORDER_OUTCOME_INPUT_FILE));assert.ok(['local-disposable-116','staging-gbyhdsuiqeslgjdnbqng-116'].includes(data.target));assert.equal(data.rolledBack,true);assert.equal(data.serviceOnly,true);assert.equal(data.cases.length,9);
 for(const c of data.cases)await t.test(c.scenario,async()=>{
  const confirmed=['approved','change_requested','declined'].includes(c.scenario);
  assert.equal(c.audits,confirmed?1:0);assert.equal(c.events,confirmed?1:0);assert.equal(c.scope_items,c.scenario==='approved'?1:0);assert.equal(c.notes,c.scenario==='change_requested'?1:0);
  assert.equal(c.final_status,confirmed?c.scenario:c.scenario==='cancelled'?'cancelled':'sent');
  const f=outcomeAction({kind:c.scenario==='approved'?'approved':c.scenario==='declined'?'declined':'change_requested',review:c.review,receipt:c.receipt,error:c.error_code?{code:c.error_code,message:'Review the current addition before responding.'}:null});const result=await f.run();
  assert.equal(result.status,confirmed?'success':'error');assert.equal(f.handoffs.length,confirmed?1:0);
  const html=renderToStaticMarkup(outcomeTree(c.scenario==='approved'?result:idle,c.scenario==='approved'?idle:result));
  if(confirmed){assert.equal(result.responseOutcome,c.scenario);assert.doesNotMatch(html,/<form/);assert.match(html,/role="status"/);assert.match(html,/tabindex="-1"/);assert.match(html,/View current change order/);}
  else{assert.equal(result.responseOutcome,undefined);assert.match(html,/<form/);assert.doesNotMatch(html,/Additional work approved<|Additional work declined<|Changes requested</);}
 });
});
