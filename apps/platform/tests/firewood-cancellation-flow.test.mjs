import test from'node:test';import assert from'node:assert/strict';import{randomUUID}from'node:crypto';
import{load}from'./pr10-test-helpers.mjs';import*as accounting from'../src/lib/firewood/handoff/office-accounting.mjs';
const{runFirewoodOfficeCommand}=load('../src/lib/firewood/office-command.ts',{'server-only':{},'../business-time.ts':{},'./handoff/office-accounting.mjs':accounting});
const user=randomUUID(),order=randomUUID(),invoice=randomUUID();
function form(intent='cancel_order'){const f=new FormData();for(const[k,v]of Object.entries({intent,order_id:order,invoice_id:invoice,request_id:randomUUID(),expected_revision:'0',ledger_hash:'a'.repeat(64),reason:'Customer requested cancellation before scheduling.',confirm_cancellation:'confirmed',...(intent==='cancel_order'?{cancellation_reason:'customer_request'}:{})}))f.set(k,v);return f;}
function harness({history=true,pending=false,retained=false,closeFails=false,loseCreditAck=false,loseConfirmAck=false}={}){
 let state='active',revision=0,credit=null,held=false,creditWrites=0,confirmWrites=0,reviewCalls=0,lost=false;const calls=[],receipts=new Map();
 const record=()=>({order:{order_id:order,invoice_id:invoice,principal_cents:84000},lifecycle:{state,revision},
  financial:{ledger_hash:'a'.repeat(64),verified:true,review_required:false,payment_pending:pending,refund_pending:false,no_money_history:!history,
   accounting:{issued_at:'2026-11-04T15:00:00Z',original_principal_cents:84000,raw_balance_due_cents:84000,credited_principal_cents:credit?84000:0,collectible_balance_cents:credit?0:84000,credit_id:credit}},
  can_credit:state==='cancellation_requested'&&history&&held&&!credit&&!pending&&!retained,can_confirm:state==='cancellation_requested'&&!pending&&!retained&&(!history||!!credit)});
 const client={rpc(name,args){calls.push({name,args});return{async abortSignal(){try{
  if(name==='inspect_firewood_live_office')return{data:record(),error:null};
  const key=args.p_request_id,body=JSON.stringify(args);if(receipts.has(key)){assert.equal(receipts.get(key).body,body);return{data:receipts.get(key).value,error:null};}
  if(name==='request_firewood_live_cancellation'){assert.equal(state,'active');assert.equal(args.p_revision,revision);state='cancellation_requested';revision++;}
  else if(name==='credit_firewood_live_cancellation'){assert(held,'Closure lease must remain active for credit');assert(record().can_credit);credit=randomUUID();creditWrites++;revision++;}
  else if(name==='confirm_firewood_live_cancellation'){assert(record().can_confirm);assert(!history||held||credit,'A committed cancellation credit remains valid after its checkout lease is released');state='cancelled';revision++;confirmWrites++;}
  else throw Error('Unexpected operation '+name);
  const value={order_id:order,invoice_id:invoice,state,revision,accounting:record().financial.accounting};receipts.set(key,{body,value});
  if(!lost&&(name==='credit_firewood_live_cancellation'&&loseCreditAck||name==='confirm_firewood_live_cancellation'&&loseConfirmAck)){lost=true;throw Error('Lost acknowledgement after committed synthetic command');}
  return{data:value,error:null};
 }catch(error){return{data:null,error};}}};}};
 const reviewCheckouts=async(id,finish)=>{assert.equal(id,invoice);reviewCalls++;if(closeFails)return{ok:false,message:'A payment is processing. Review it before proceeding.'};held=true;try{return await finish(async()=>assert(held));}finally{held=false;}};
 return{calls,deps:{client,userId:user,roles:['owner'],admitted:true,reviewCheckouts},snapshot:()=>({state,revision,creditWrites,confirmWrites,reviewCalls,held})};
}
test('unpaid checkout history is reviewed, credited and cancelled while one closure lease remains active',async()=>{
 const h=harness(),input=form(),result=await runFirewoodOfficeCommand(input,h.deps);assert.equal(result.status,'success');assert.match(result.message,/order cancelled/i);
 assert.deepEqual(h.snapshot(),{state:'cancelled',revision:3,creditWrites:1,confirmWrites:1,reviewCalls:1,held:false});
 const writes=h.calls.filter(x=>x.name!=='inspect_firewood_live_office');assert.deepEqual(writes.map(x=>x.name),['request_firewood_live_cancellation','credit_firewood_live_cancellation','confirm_firewood_live_cancellation']);
 assert.equal(new Set(writes.map(x=>x.args.p_request_id)).size,3);assert(writes.every(x=>!('amount' in x.args)&&!('send_email'in x.args)));
 assert.equal((await runFirewoodOfficeCommand(input,h.deps)).status,'success');assert.equal(h.snapshot().creditWrites,1);assert.equal(h.snapshot().confirmWrites,1);assert.equal(h.snapshot().reviewCalls,1);
});
test('clean unpaid cancellation uses the existing atomic clean-void path without a competing review lease',async()=>{
 const h=harness({history:false});assert.equal((await runFirewoodOfficeCommand(form(),h.deps)).status,'success');assert.equal(h.snapshot().reviewCalls,0);assert.equal(h.snapshot().creditWrites,0);assert.equal(h.snapshot().confirmWrites,1);
});
for(const options of[{pending:true},{retained:true},{closeFails:true}])test('uncertain or retained money keeps cancellation held: '+JSON.stringify(options),async()=>{
 const h=harness(options),r=await runFirewoodOfficeCommand(form(),h.deps);assert.equal(r.status,'error');assert.match(r.message,/hold/);assert.equal(h.snapshot().state,'cancellation_requested');assert.equal(h.snapshot().creditWrites,0);assert.equal(h.snapshot().confirmWrites,0);
});
for(const options of[{loseCreditAck:true},{loseConfirmAck:true}])test('lost acknowledgement recovers without another balance release: '+JSON.stringify(options),async()=>{
 const h=harness(options),input=form();assert.equal((await runFirewoodOfficeCommand(input,h.deps)).status,'error');assert.equal((await runFirewoodOfficeCommand(input,h.deps)).status,'success');assert.equal(h.snapshot().creditWrites,1);assert.equal(h.snapshot().confirmWrites,1);
});
test('authorization, confirmations and bound invoice are checked before checkout work',async()=>{
 for(const extra of[{roles:['crew']},{admitted:false},{userId:null}]){const h=harness();assert.equal((await runFirewoodOfficeCommand(form(),{...h.deps,...extra})).status,'error');assert.equal(h.calls.length,0);}
 for(const mutate of[f=>f.delete('confirm_cancellation'),f=>f.set('send_email','true'),f=>f.set('invoice_id',randomUUID()),f=>f.set('cancellation_reason','forgive_everything')]){const h=harness(),f=form();mutate(f);assert.equal((await runFirewoodOfficeCommand(f,h.deps)).status,'error');assert.equal(h.snapshot().reviewCalls,0);assert.equal(h.snapshot().state,'active');}
});
test('unavailable payment review preserves the hold and original invoice obligation',async()=>{
 const h=harness();assert.equal((await runFirewoodOfficeCommand(form(),{...h.deps,reviewCheckouts:undefined})).status,'error');assert.equal(h.snapshot().state,'cancellation_requested');assert.equal(h.snapshot().creditWrites,0);
});
