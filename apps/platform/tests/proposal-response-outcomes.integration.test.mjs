import assert from'node:assert/strict';import test from'node:test';import{readFileSync}from'node:fs';import{renderToStaticMarkup}from'react-dom/server';
import{proposalAction,proposalHarness,idle}from'./proposal-response-outcomes-fixture.mjs';
const enabled=process.env.PROPOSAL_OUTCOME_SYNTHETIC==='1'&&Boolean(process.env.PROPOSAL_OUTCOME_INPUT_FILE);
test('installed proposal commands preserve outcomes, exact retries and private access',{skip:!enabled},async t=>{
 const data=JSON.parse(readFileSync(process.env.PROPOSAL_OUTCOME_INPUT_FILE));assert.ok(['local-disposable-116','staging-gbyhdsuiqeslgjdnbqng-116'].includes(data.target));assert.equal(data.rolledBack,true);assert.equal(data.serviceOnly,true);assert.equal(data.cases.length,14);
 for(const c of data.cases)await t.test(c.scenario,async()=>{
  const approved=c.scenario==='approval',historical=c.scenario==='changes_then_approval',saved=approved||historical||c.scenario==='changes';
  assert.equal(c.audits,saved?(historical?2:1):0);assert.equal(c.events,c.audits);assert.equal(c.jobs,approved||historical?1:0);assert.equal(c.notes,c.scenario==='changes'||historical?1:0);
  assert.equal(c.final_status,approved||historical?'approved':c.scenario==='changes'?'change_requested':c.scenario.startsWith('cancelled_')?'cancelled':'sent');
  const f=proposalAction({kind:approved||c.scenario.endsWith('_approval')&&!historical?'approval':'changes',record:c.review,receipt:c.receipt,error:c.error_code?{code:c.error_code,message:'Refresh and review this proposal.'}:null});const result=await f.run();assert.equal(result.ok,saved);assert.equal(f.handoffs.length,saved?1:0);
  const html=renderToStaticMarkup(proposalHarness({status:c.final_status,states:approved?[result,idle]:[idle,result]}).render());
  if(saved){assert.doesNotMatch(html,/<form/);assert.match(html,/role="status"/);assert.match(html,/View current proposal/);assert.match(html,/tabindex="-1"/);if(historical)assert.match(html,/Proposal approved/);}
  else assert.doesNotMatch(html,/Change request saved|Your quote has been approved/);
 });
});
