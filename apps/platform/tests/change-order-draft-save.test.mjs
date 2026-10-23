import * as branding from '../src/lib/company-brand.ts';
import assert from'node:assert/strict';import test from'node:test';import{randomUUID}from'node:crypto';import{load}from'./pr10-test-helpers.mjs';
import{prepareDraftAttempt,forgetDraftAttempt}from'../src/lib/change-orders/draft-attempt.ts';
const uid=randomUUID(),id=randomUUID(),job=randomUUID(),request=randomUUID(),line=randomUUID();
const store=()=>{const values=new Map();return{values,getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};};
function form(overrides={}){const f=new FormData();for(const[k,v]of Object.entries({request_id:request,change_order_id:id,expected_revision:'4',job_id:job,title:'Synthetic scope',line_id:line,line_title:'Synthetic line',line_quantity:'0.29',line_rate:'0.50',tax:'2.00',fees:'3.00',...overrides}))f.set(k,v);return f;}
test('uncertain draft save retains request/version across reloads and cannot become a changed request',async()=>{
 const s=store(),a=await prepareDraftAttempt('edit:'+id,form(),4,s),b=await prepareDraftAttempt('edit:'+id,form(),8,s);assert.deepEqual(a.attempt,b.attempt);
 const changed=await prepareDraftAttempt('edit:'+id,form({title:'Edited during uncertainty'}),8,s);assert.equal(changed.blocked,true);assert.deepEqual(changed.attempt,a.attempt);assert.doesNotMatch(JSON.stringify([...s.values]),/Synthetic scope|Synthetic line/);
 forgetDraftAttempt(a.key,s);const fresh=await prepareDraftAttempt('edit:'+id,form(),8,s);assert.equal(fresh.attempt.revision,8);assert.notEqual(fresh.attempt.requestId,a.attempt.requestId);
});
test('save-and-close shares an edit identity; save-for-review changes creation intent',async()=>{
 const s=store(),a=await prepareDraftAttempt('edit',form({submit_intent:'save'}),4,s);const b=await prepareDraftAttempt('edit',form({submit_intent:'save_close'}),4,s);assert.equal(a.attempt.requestId,b.attempt.requestId);
 await prepareDraftAttempt('new',form({submit_intent:'save'}),null,s);assert.equal((await prepareDraftAttempt('new',form({submit_intent:'review'}),null,s)).blocked,true);
});
test('blocked/malformed storage retains in-memory recovery without storing draft contents',async()=>{
 const blocked={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')},removeItem(){throw Error('blocked')}};
 const a=await prepareDraftAttempt('new',form(),null,blocked);assert.deepEqual((await prepareDraftAttempt('new',form(),null,blocked,a.attempt)).attempt,a.attempt);
 const malformed={...blocked,getItem:()=>JSON.stringify({requestId:'bad',revision:-1,payloadHash:'bad'}),setItem(){}};assert.equal((await prepareDraftAttempt('new',form(),null,malformed)).blocked,false);
});
function fixture(options={}){
 const calls=[],paths=[],db={auth:{getUser:async()=>({data:{user:{id:uid}}})},from:()=>assert.fail('Draft saves cannot use a multi-request table writer')};
 const receipt={request_id:request,id,job_id:job,organization_id:null,edit_revision:7,current_revision:7,current_status:'draft',line_ids:[line],updated_at:'2035-01-01T00:00:00Z',replayed:false};
 const actions=load('../src/lib/actions/change-orders.ts',{'../company-brand.ts':branding,'@/lib/email/delivery-commands':{callDeliveryCommand:async(client,name,args)=>{calls.push({client,name,args});return options.result??{data:receipt,error:null};}},'next/cache':{revalidatePath:p=>paths.push(p)},'next/navigation':{redirect:()=>assert.fail('Positive receipts must reach the client before navigation')},'@/lib/activity-log':{recordActivity:()=>assert.fail('Audit belongs to transaction')},'@/lib/auth/roles':{getUserRoles:async()=>options.roles??['owner'],hasAllowedRole:(roles,allowed)=>roles.some(r=>allowed.includes(r)),platformRoleGroups:{internalStaff:['owner','admin','payroll_admin','estimator'],financialReporting:['owner','admin','payroll_admin']}},'@/lib/data/change-orders':{},'@/lib/notifications/source-events':{deliverCustomerSourceEvent:()=>assert.fail('Editing must not send a customer email')},'@/lib/portal/tokens':{},'@/lib/email/send':{},'@/lib/email/config':{},'@/lib/email/delivery':{},'@/lib/email/delivery-followups':{},'@/lib/portal/change-order-links':{},'@/lib/portal/urls':{},'@/lib/supabase/server':{createClient:async()=>db},'@/lib/supabase/admin':{},'@/lib/security/portal-rate-limit':{},'@/lib/security/errors':{safeStaffMessage:v=>v}});
 return{calls,paths,receipt,run:(f=form(options.form),create=false)=>actions[create?'createChangeOrder':'updateChangeOrder']({},f)};
}
test('editor uses one authenticated atomic command with exact request/version and canonical quantity rounding',async()=>{
 const f=fixture();const r=await f.run();assert.equal(r.status,'success');assert.equal(r.savedRevision,7);assert.deepEqual(r.savedLineIds,[line]);assert.equal(f.calls.length,1);const c=f.calls[0];assert.equal(c.name,'save_change_order_draft');assert.equal(c.args.p_request_id,request);assert.equal(c.args.p_expected_revision,4);assert.equal(c.args.p_lines[0].amount_cents,15);assert.equal(c.args.p_header.tax_cents,200);assert.equal(c.args.p_header.fee_cents,300);assert.ok(!('status'in c.args.p_header));assert.ok(f.paths.includes('/admin/change-orders/'+id));
});
test('nonfinancial editor omits hidden costs; successful creation/close returns an acknowledged destination',async()=>{
 const f=fixture({roles:['estimator'],form:{line_internal_cost:'999'}});assert.equal((await f.run()).status,'success');assert.ok(!('internal_cost_estimate_cents'in f.calls[0].args.p_lines[0]));
 const created=fixture();assert.equal((await created.run(form({submit_intent:'review'}),true)).saveDestination,'/admin/change-orders/'+id);assert.equal(created.calls[0].args.p_change_order_id,null);assert.equal(created.calls[0].args.p_header.submit_for_review,true);
 assert.equal((await fixture().run(form({submit_intent:'save_close'}))).saveDestination,'/admin/change-orders/'+id+'?updated=1');
});
test('conflicts retain entries and require current-record review; unknown outcomes never advance revision',async()=>{
 const conflict=await fixture({result:{data:null,error:{code:'PT409',message:'Source changed'}}}).run();assert.equal(conflict.saveRejected,true);assert.equal(conflict.reviewRequired,true);assert.equal(conflict.savedRevision,undefined);
 const lost=await fixture({result:{data:null,error:{code:'DELIVERY_UNCONFIRMED',message:'sensitive diagnostic'}}}).run();assert.equal(lost.savedRevision,undefined);assert.equal(lost.saveRejected,false);assert.doesNotMatch(lost.message,/sensitive/);
 const replay=fixture();const r=await fixture({result:{data:{...replay.receipt,replayed:true,current_revision:9},error:null}}).run();assert.equal(r.reviewRequired,true);assert.match(r.message,/earlier save/);
});
test('malformed acknowledgements and invalid input cannot report saved or navigate',async()=>{
 const r=fixture().receipt;for(const data of [null,{}, {...r,request_id:randomUUID()},{...r,id:randomUUID()},{...r,line_ids:[]},{...r,edit_revision:-1},{...r,replayed:null}]){const f=fixture({result:{data,error:null}});const result=await f.run();assert.equal(result.status,'error');assert.equal(result.saveDestination,undefined);assert.equal(f.paths.length,0);}
 for(const values of [{request_id:'bad'},{expected_revision:'-1'},{expected_revision:''},{line_quantity:'0'},{line_quantity:'1.001'},{line_title:''},{line_rate:'12abc'},{tax:'-1'},{fees:'9999999999'},{expires_on:'invalid'}]){const f=fixture();assert.equal((await f.run(form(values))).status,'error',JSON.stringify(values));assert.equal(f.calls.length,0);}
});
