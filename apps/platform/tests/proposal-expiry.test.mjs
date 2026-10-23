import assert from 'node:assert/strict';
import test from 'node:test';
import {load,elements,text} from './customer-invoice-fixture.mjs';
import {proposalHarness,idle,proposalResponseOutcome} from './proposal-response-outcomes-fixture.mjs';
const {customerQuoteState,customerQuoteDisplayStatus}=load('../src/lib/portal/customer-states.ts');
const now=Date.parse('2026-10-22T17:00:00Z'),past='2026-10-22T16:59:59Z',future='2026-10-22T17:00:01Z';
test('only open proposals become visually expired at their stored deadline',()=>{
 for(const s of ['draft','sent','change_requested']){
  assert.equal(customerQuoteState(s,past,now).canRespond,false);assert.equal(customerQuoteDisplayStatus(s,new Date(now).toISOString(),now),'expired');
  assert.equal(customerQuoteState(s,future,now).canRespond,true);assert.equal(customerQuoteState(s,null,now).canRespond,true);
 }
 for(const s of ['approved','declined','cancelled'])assert.equal(customerQuoteDisplayStatus(s,past,now),s);
});
test('expired proposal response is read-only and offers office help without accepting or sending',()=>{
 const view=proposalHarness({props:{expiresAt:'2020-01-01T00:00:00Z'}}).render();
 assert.match(text(view),/Proposal expired/);assert.ok(!elements(view).some(n=>n.type==='form'));
 assert.ok(elements(view).some(n=>n.type==='a'&&n.props.children==='View current proposal'));
 const pending=proposalHarness({states:[{ok:false,status:'error',message:'Unconfirmed'},idle],props:{expiresAt:'2020-01-01T00:00:00Z'}}).render();
 assert.match(text(pending),/Proposal expired/);assert.ok(!elements(pending).some(n=>n.type==='form'));
});
test('confirmed responses saved before the deadline survive delayed acknowledgement, but explicit closed server states win',()=>{
 const approval={ok:true,status:'success',message:'Approval saved'},changes={ok:true,status:'success',message:'Changes saved'};
 assert.equal(proposalResponseOutcome('sent',approval,idle,past,now).kind,'approved');
 assert.equal(proposalResponseOutcome('sent',idle,changes,past,now).kind,'change_requested');
 assert.equal(proposalResponseOutcome('sent',idle,idle,past,now).kind,'expired');
 for(const s of ['expired','cancelled','declined'])assert.equal(proposalResponseOutcome(s,approval,idle,past,now).kind,s);
});
