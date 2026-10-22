import assert from 'node:assert/strict';
import test from 'node:test';
import * as jsx from 'react/jsx-runtime';
import {changeOrderResponseOutcome} from '../src/lib/portal/change-order-response-outcome.ts';
import {initialChangeOrderActionState as idle} from '../src/lib/action-states/change-orders.ts';
import {load,elements,text} from './customer-invoice-fixture.mjs';
const error={status:'error',message:'OLD_APPROVAL_ERROR'};
for(const responseOutcome of ['approved','change_requested','declined'])test('confirmed '+responseOutcome+' has an accurate outcome and next step',()=>{
 const saved={status:'success',message:'CONFIRMED_RESPONSE',responseOutcome};
 const result=changeOrderResponseOutcome(responseOutcome==='approved'?saved:error,responseOutcome==='approved'?idle:saved);
 assert.equal(result.kind,responseOutcome);assert.equal(result.message,'CONFIRMED_RESPONSE');assert.doesNotMatch(JSON.stringify(result),/OLD_APPROVAL_ERROR/);assert.ok(result.nextStep.length>20);
});
test('submitted intent, old errors and idle states never imply a saved outcome',()=>{
 assert.equal(changeOrderResponseOutcome(error,{...error,responseOutcome:'declined'}),null);
 assert.equal(changeOrderResponseOutcome(idle,idle),null);
 assert.equal(changeOrderResponseOutcome(idle,{status:'success',message:'Saved'}).title,'Response saved');
});
function harness({states=[idle,idle],pending=[false,false],results=[]}={}){
 const values=[],refs=[],calls=[],effects=[],actions=[];let vi=0,ri=0,ai=0;
 const stateModule={initialChangeOrderActionState:idle};
 const attempts=load('../src/lib/portal/change-order-response-attempt.ts');
 const Component=load('../src/components/portal-change-order-actions.tsx',{
  'react/jsx-runtime':jsx,react:{useId:()=> 'test-response',useRef:v=>refs[ri++]??(refs[ri-1]={current:v}),useState:v=>{const i=vi++;values[i]??=v;return[values[i],v=>values[i]=v];},useEffect:fn=>effects.push(fn)},
  'lucide-react':{CheckCircle2:()=>null,MessageSquareText:()=>null,XCircle:()=>null},
  '@/lib/portal/change-order-response-attempt':attempts,'@/lib/portal/change-order-response-outcome':{changeOrderResponseOutcome},
  '@/hooks/use-reliable-action-state':{useReliableActionState:fn=>{const i=ai++;actions[i]=fn;return[states[i],fn,pending[i]];}},
  '@/lib/actions/change-orders':{approveChangeOrderByPortal:async(previous,form)=>{calls.push({kind:'approve',form});return await (typeof results[0]==='function'?results[0]():results[0]);},respondToChangeOrderByPortal:async(previous,form)=>{calls.push({kind:'respond',form});return await results[1];}},
  '@/lib/action-states/change-orders':stateModule,'./portal-change-order-actions.css':{},
 }).PortalChangeOrderActions;
 const render=(props={})=>{vi=ri=ai=0;return Component({...props,token:'synthetic-private-capability',expectedUpdatedAt:'2035-01-01T00:00:00Z',reviewHash:'a'.repeat(64)});};
 return{render,values,refs,calls,actions,effects,states,pending};
}
test('forms retain typed input, labels and error associations; decline needs no reason',()=>{
 const h=harness();let n=elements(h.render());const input=n.find(x=>x.type==='input'&&x.props.name==='approver_name'),area=n.find(x=>x.type==='textarea');
 input.props.onChange({target:{value:'Synthetic name'}});area.props.onChange({target:{value:'Please update this scope'}});
 h.states[1]={status:'error',message:'Review the addition',responseRejected:true};h.values[0]='request_changes';n=elements(h.render());
 assert.equal(n.find(x=>x.type==='textarea').props.value,'Please update this scope');assert.equal(n.find(x=>x.props.name==='approver_name').props.value,'Synthetic name');
 assert.match(n.find(x=>x.type==='textarea').props['aria-describedby'],/message-help.*feedback/);
 assert.ok(!n.find(x=>x.type==='textarea').props.required);assert.ok(n.some(x=>x.type==='div'&&x.props.role==='alert'&&x.props.tabIndex===-1));assert.match(text(h.render()),/Refresh and review/);
 for(const field of n.filter(x=>['input','textarea'].includes(x.type)&&x.props.id))assert.ok(n.some(x=>x.type==='label'&&x.props.htmlFor===field.props.id));
});
test('both forms disable while saving and announce the specific pending response',()=>{
 const h=harness({pending:[false,true]});h.values[0]='decline';const n=elements(h.render());
 assert.ok(n.filter(x=>x.type==='button').every(x=>x.props.disabled));assert.ok(n.some(x=>x.type==='form'&&x.props['aria-busy']));assert.match(text(h.render()),/Saving response/);assert.ok(n.some(x=>x.props.role==='status'));
});
test('confirmation hides both forms and focuses the saved outcome rather than an old approval error',()=>{
 const h=harness({states:[error,{status:'success',message:'Saved changes',responseOutcome:'change_requested'}]});const v=h.render(),n=elements(v);
 assert.equal(n.filter(x=>x.type==='form').length,0);assert.equal(v.props.tabIndex,-1);assert.equal(v.props.role,'status');assert.doesNotMatch(text(v),/OLD_APPROVAL_ERROR/);assert.match(text(v),/Changes requested/);
 let focused=0;h.refs[3].current={focus:()=>focused++};h.refs[4].current=true;h.effects.at(-1)();assert.equal(focused,1);
});
test('shared immediate guard blocks approval and response racing before disabled controls render',async()=>{
 let release;const result=new Promise(r=>release=r),h=harness({results:[result,{status:'success',message:'should not execute'}]});h.render();const one=new FormData();one.set('approver_name','Synthetic name');const two=new FormData();two.set('response_intent','decline');
 const a=h.actions[0](idle,one),b=h.actions[1](idle,two);assert.deepEqual(await b,idle);release({status:'success',message:'Saved',responseOutcome:'approved'});await a;assert.equal(h.calls.length,1);assert.equal(h.calls[0].kind,'approve');assert.match(one.get('request_id'),/^[a-f0-9-]{36}$/);
});

import {outcomeAction}from'./change-order-response-outcomes-fixture.mjs';
for(const kind of ['approved','change_requested','declined'])test(kind+' server result adds presentation metadata only after a confirmed receipt',async()=>{
 const f=outcomeAction({kind}),r=await f.run();assert.equal(r.responseOutcome,kind);assert.equal(r.status,'success');assert.equal(f.handoffs.length,1);assert.equal(f.calls.length,1);assert.match(r.message,/saved/);assert.doesNotMatch(r.message,/were sent/);
});
test('malformed, rejected, unavailable and unconfirmed results never claim an outcome or hand off a source event',async()=>{
 for(const kind of ['approved','change_requested','declined'])for(const options of [{receipt:{}},{error:{code:'PT409',message:'Refresh and review'}},{error:{code:'DELIVERY_UNCONFIRMED',message:'Not confirmed'}},{rate:{available:false,allowed:false}},{rate:{available:true,allowed:false}}]){
  const f=outcomeAction({kind,...options}),r=await f.run();assert.equal(r.status,'error');assert.equal(r.responseOutcome,undefined);assert.equal(f.handoffs.length,0);
 }
});

test('transport failure after an earlier rejection resets stale error metadata and retains the retry identity',async()=>{
 const h=harness({states:[{...error,responseRejected:true},idle],results:[async()=>{throw Error('Synthetic response loss')}]});
 h.render();const form=new FormData();form.set('approver_name','Synthetic name');const r=await h.actions[0](h.states[0],form);assert.equal(r.responseRejected,false);assert.equal(r.status,'error');assert.match(r.message,/may already have been saved/);assert.ok(h.refs[0].current.requestId);
});

test('fresh server closure takes precedence over an old receipt and does not steal focus on arrival',()=>{
 const h=harness({states:[{status:'success',responseOutcome:'approved',message:'OLD_APPROVAL'},idle]});
 const tree=h.render({closedState:{title:'Additional work no longer active',message:'This addition has been cancelled.'}});assert.match(text(tree),/no longer active/);assert.doesNotMatch(text(tree),/OLD_APPROVAL/);assert.equal(elements(tree).filter(x=>x.type==='form').length,0);
 let focused=0;h.refs[3].current={focus:()=>focused++};h.effects.at(-1)();assert.equal(focused,0);
});
