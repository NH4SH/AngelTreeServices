import assert from'node:assert/strict';import test from'node:test';
import{elements,text}from'./customer-invoice-fixture.mjs';import{expandPrintTree}from'./customer-document-print-fixture.mjs';
import{proposalHarness,proposalAction,idle,proposalResponseOutcome}from'./proposal-response-outcomes-fixture.mjs';
const oldError={ok:false,status:'error',message:'OLD_APPROVAL_ERROR',requestRejected:true};
for(const status of ['approved','declined','cancelled','expired','unknown'])test('fresh '+status+' status wins over an older action and hides decisions',()=>{
 const h=proposalHarness({status,states:[{ok:true,status:'success',message:'OLD_SAVED_APPROVAL'},idle]}),v=expandPrintTree(h.render());assert.equal(elements(v).filter(x=>x.type==='form').length,0);assert.doesNotMatch(text(v),/OLD_SAVED_APPROVAL/);assert.ok(proposalResponseOutcome(status,idle,idle));
});
test('only confirmed results select an outcome and a request never claims email delivery',()=>{
 assert.equal(proposalResponseOutcome('sent',oldError,{ok:false,status:'success',message:'unconfirmed'}),null);
 assert.equal(proposalResponseOutcome('sent',oldError,idle),null);
 const result=proposalResponseOutcome('sent',oldError,{ok:true,status:'success',message:'SAVED_REQUEST'});assert.equal(result.title,'Change request saved');assert.equal(result.message,'SAVED_REQUEST');assert.doesNotMatch(JSON.stringify(result),/OLD_APPROVAL_ERROR|sent/);
});
for(const status of ['draft','sent','change_requested'])test(status+' retains both authorized decision options and summary',()=>{
 const h=proposalHarness({status}),v=expandPrintTree(h.render()),nodes=elements(v);assert.equal(nodes.filter(x=>x.type==='form').length,2);assert.ok(nodes.filter(x=>x.type==='form').every(x=>typeof x.props.action==='function')); assert.match(text(v),/Synthetic scope/);assert.ok(nodes.some(x=>x.type==='a'&&x.props.href==='#proposal-scope'));
 const details=nodes.find(x=>x.type==='details');assert.equal(details.props.open,status!=='change_requested');
});
test('nameable request field retains wording, constraints and associated error/help',()=>{
 const h=proposalHarness(),n=elements(h.render()),field=n.find(x=>x.type==='textarea');field.props.onChange({target:{value:'Please preserve this wording 🌳'}});h.values[0]='changes';h.states[1]=oldError;
 const view=h.render(),nodes=elements(view),area=nodes.find(x=>x.type==='textarea');assert.equal(area.props.value,'Please preserve this wording 🌳');assert.equal(area.props.required,true);assert.equal(area.props.minLength,3);assert.equal(area.props.maxLength,1000);assert.ok(nodes.some(x=>x.type==='label'&&x.props.htmlFor===area.props.id));assert.match(area.props['aria-describedby'],/help.*feedback/);assert.match(text(view),/Refresh and review this proposal/);assert.equal(nodes.find(x=>x.type==='details').props.open,true);
});
test('saving disables both actions and announces a specific operation',()=>{
 const h=proposalHarness({pending:[false,true]});h.values[0]='changes';const v=h.render(),n=elements(v);assert.ok(n.filter(x=>x.type==='button').every(x=>x.props.disabled));assert.ok(n.some(x=>x.type==='form'&&x.props['aria-busy']));assert.match(text(v),/Saving request/);assert.ok(n.some(x=>x.props.role==='status'));
});
test('outcomes and errors receive focus after interaction; fresh arrival does not steal it',()=>{
 for(const states of [[oldError,idle],[idle,{ok:true,status:'success',message:'Saved'}]]){
  const h=proposalHarness({states});h.render();let focused=0;h.refs[3].current={focus:()=>focused++};h.effects.at(-1)();assert.equal(focused,0);h.refs[2].current=true;h.effects.at(-1)();assert.equal(focused,1);
 }
});
test('shared immediate guard prevents approval and change request racing before pending renders',async()=>{
 let release;const result=new Promise(r=>release=r),h=proposalHarness({results:[result,{ok:true,status:'success'}]});h.render();const form=new FormData();form.set('message','Synthetic message');const a=h.actions[0](idle,form);assert.deepEqual(await h.actions[1](idle,form),idle);release({ok:true,status:'success',message:'Saved approval'});await a;assert.equal(h.calls.length,1);
});
test('transport failure retains change-request identity and retires stale rejection feedback',async()=>{
 const h=proposalHarness({states:[idle,oldError],results:[null,async()=>{throw Error('PRIVATE_TRANSPORT_DIAGNOSTIC')} ]});h.render();const form=new FormData();form.set('message','Keep my synthetic request');const first=await h.actions[1](oldError,form);assert.equal(first.requestRejected,false);assert.equal(first.ok,false);assert.doesNotMatch(first.message,/PRIVATE/);assert.ok(h.refs[0].current.requestId);assert.equal(h.values[1],'Keep my synthetic request');const id=form.get('request_id');await h.actions[1](first,form);assert.equal(form.get('request_id'),id);
});
for(const kind of ['approval','changes'])test(kind+' requires a valid command receipt before success and handoff',async()=>{
 const f=proposalAction({kind}),r=await f.run();assert.equal(r.ok,true);assert.equal(f.calls.length,1);assert.equal(f.handoffs.length,1);if(kind==='changes'){assert.match(r.message,/saved/);assert.doesNotMatch(r.message,/has been sent/);}
 for(const options of [{receipt:{}},{error:{code:'XX000',message:'PRIVATE_BACKEND_DIAGNOSTIC'}},{error:{code:'PT409',message:'Refresh and review the saved proposal.'}},{rate:{available:false,allowed:false}},{rate:{available:true,allowed:false}}]){
  const g=proposalAction({kind,...options}),failed=await g.run();assert.equal(failed.ok,false);assert.equal(g.handoffs.length,0);assert.doesNotMatch(failed.message,/PRIVATE_BACKEND_DIAGNOSTIC/);
 }
});
test('approval rejections distinguish a stale review from an uncertain outcome',async()=>{
 const known=await proposalAction({kind:'approval',error:{code:'PT409',message:'Refresh and review'}}).run();assert.equal(known.requestRejected,true);
 const unknown=await proposalAction({kind:'approval',error:{code:'UNKNOWN',message:'PRIVATE'}}).run();assert.equal(unknown.requestRejected,false);assert.match(unknown.message,/could not be confirmed/);
});
