import assert from 'node:assert/strict';
import test from 'node:test';
import {completionFingerprint,getCompletionRequest,parseCompletionContext,completionInputs} from '../src/lib/jobs/completion-request.ts';
import {getJobOperationalState} from '../src/lib/jobs/operational-status.ts';
const id='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
test('completion identity is persisted before dispatch and reused only for the exact reviewed command',()=>{
 const m=new Map(),storage={getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)};
 assert.equal(getCompletionRequest(storage,'a',id,'complete','one',()=>id),id);
 assert.equal(getCompletionRequest(storage,'a',id,'complete','one',()=>assert.fail()),id);
 assert.equal(getCompletionRequest(storage,'a',id,'complete','two',()=>other),other);
 assert.throws(()=>getCompletionRequest({getItem:()=>'{bad}',setItem:()=>assert.fail()},'a',id,'complete','one',()=>id));
 assert.throws(()=>getCompletionRequest({getItem:()=>null,setItem:()=>{throw Error('full')}},'a',id,'complete','one',()=>id),/full/);
});
test('unknown or incomplete completion responses and missing displayed versions fail closed',()=>{
 for(const v of [null,{},'ok',{job_id:id,revision:1}])assert.equal(parseCompletionContext(v),null);
 assert.equal(completionInputs(new FormData()),null);
});
test('field work remains visible when billing has started or has already been paid',()=>{
 for(const status of ['draft','sent','partially_paid','overdue','paid']) {
  assert.equal(getJobOperationalState({jobStatus:'scheduled',invoices:[{status}],scheduleEvents:[{event_type:'job',status:'scheduled',starts_at:'2029-01-01T13:00:00Z',ends_at:null}],now:new Date('2026-01-01')}),'scheduled');
  assert.equal(getJobOperationalState({jobStatus:'in_progress',invoices:[{status}]}),'in_progress');
  assert.equal(getJobOperationalState({jobStatus:'accepted',invoices:[{status}]}),'to_be_scheduled');
 }
 assert.equal(getJobOperationalState({jobStatus:'completed',invoices:[{status:'paid'}]}),'paid');
 assert.equal(getJobOperationalState({jobStatus:'returned_for_correction',invoices:[{status:'paid'}]}),'needs_attention');
});

test('durable retry matching stores a digest without retaining another copy of private notes',async()=>{
 const note='Private crew and office completion note';
 const a=await completionFingerprint(note),b=await completionFingerprint(note+' changed');
 assert.match(a,/^[0-9a-f]{64}$/);assert.equal(await completionFingerprint(note),a);assert.notEqual(a,b);assert.equal(a.includes(note),false);
});
