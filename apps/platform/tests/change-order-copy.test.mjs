import assert from'node:assert/strict';import test from'node:test';import{randomUUID}from'node:crypto';import{load}from'./pr10-test-helpers.mjs';
import{prepareCopyAttempt,forgetCopyAttempt}from'../src/lib/change-orders/copy-attempt.ts';
const uid=randomUUID(),id=randomUUID(),target=randomUUID(),job=randomUUID(),request=randomUUID();
const store=()=>{const values=new Map();return{values,getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};};
test('uncertain copy reuses its original request and source revision after reload or source edit',()=>{
 const s=store(),a=prepareCopyAttempt(id,4,s),b=prepareCopyAttempt(id,9,s);assert.deepEqual(a.attempt,b.attempt);assert.equal(b.attempt.revision,4);assert.deepEqual(Object.keys(JSON.parse([...s.values.values()][0])).sort(),['requestId','revision','sourceId']);
 const other=prepareCopyAttempt(randomUUID(),4,s);assert.notEqual(other.attempt.requestId,a.attempt.requestId);forgetCopyAttempt(a.key,s);assert.equal(prepareCopyAttempt(id,9,s).attempt.revision,9);
});
test('copy recovery tolerates unavailable or malformed storage without replacing an in-memory attempt',()=>{
 const blocked={getItem(){throw Error()},setItem(){throw Error()},removeItem(){throw Error()}};const a=prepareCopyAttempt(id,4,blocked);assert.deepEqual(prepareCopyAttempt(id,8,blocked,a.attempt).attempt,a.attempt);
 const malformed={...blocked,getItem:()=>JSON.stringify({requestId:request,sourceId:id,revision:-1})};assert.equal(prepareCopyAttempt(id,8,malformed).attempt.revision,8);
});
function fixture(result){
 const calls=[],paths=[],db={auth:{getUser:async()=>({data:{user:{id:uid}}})},from:()=>assert.fail('Copy must not read/write tables outside its transaction')};
 const receipt={request_id:request,source_id:id,source_revision:4,id:target,job_id:job,organization_id:null,edit_revision:2,current_revision:2,current_status:'draft',line_count:2,replayed:false};
 const actions=load('../src/lib/actions/change-orders.ts',{'@/lib/email/delivery-commands':{callDeliveryCommand:async(client,name,args)=>{calls.push({client,name,args});return result??{data:receipt,error:null};}},'next/cache':{revalidatePath:p=>paths.push(p)},'@/lib/activity-log':{recordActivity:()=>assert.fail('Audit belongs to transaction')},'@/lib/auth/roles':{getUserRoles:async()=>['estimator'],hasAllowedRole:(r,a)=>r.some(x=>a.includes(x)),platformRoleGroups:{internalStaff:['owner','admin','payroll_admin','estimator']}},'@/lib/data/change-orders':{getChangeOrderDetail:()=>assert.fail('Source snapshot belongs to transaction')},'@/lib/notifications/source-events':{},'@/lib/portal/tokens':{},'@/lib/email/send':{sendTransactionalEmail:()=>assert.fail('Copy must never send')},'@/lib/portal/change-order-links':{},'@/lib/portal/urls':{},'@/lib/supabase/server':{createClient:async()=>db},'@/lib/supabase/admin':{},'@/lib/security/portal-rate-limit':{},'@/lib/security/errors':{safeStaffMessage:v=>v}});
 return{calls,paths,receipt,run:(overrides={})=>{const f=new FormData();for(const[k,v]of Object.entries({request_id:request,change_order_id:id,expected_revision:'4',...overrides}))f.set(k,v);return actions.duplicateChangeOrder({},f);}};
}
test('copy dispatches one authenticated command and navigates only from a matching positive receipt',async()=>{
 const f=fixture(),r=await f.run();assert.equal(r.status,'success');assert.equal(r.saveDestination,'/admin/change-orders/'+target+'/edit');assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0].args,{p_request_id:request,p_source_id:id,p_expected_revision:4});assert.equal(f.calls[0].name,'copy_change_order_draft');assert.ok(f.paths.includes('/admin/jobs/'+job));
});
test('recovery opens the existing current record even after it has been edited or closed',async()=>{
 const r=fixture().receipt;for(const current_status of ['draft','approved','cancelled']){const f=fixture({data:{...r,replayed:true,current_revision:10,current_status},error:null});assert.equal((await f.run()).saveDestination,'/admin/change-orders/'+target);}
});
test('unknown outcomes retain identity; conflicts require source review; neither can claim a new draft',async()=>{
 const unknown=await fixture({data:null,error:{code:'DELIVERY_UNCONFIRMED',message:'private diagnostics'}}).run();assert.equal(unknown.saveRejected,false);assert.equal(unknown.saveDestination,undefined);assert.match(unknown.message,/Retry/);assert.doesNotMatch(unknown.message,/private diagnostics/);
 for(const code of ['PT409','23514','42501','22023']){const r=await fixture({data:null,error:{code,message:'Review source'}}).run();assert.equal(r.saveRejected,true);assert.equal(r.reviewRequired,true);assert.equal(r.saveDestination,undefined);}
});
test('malformed receipts and invalid source/revision/request never navigate or start an untracked copy',async()=>{
 const r=fixture().receipt;for(const data of [null,{}, {...r,source_id:randomUUID()},{...r,source_revision:5},{...r,request_id:randomUUID()},{...r,id},{...r,current_revision:1},{...r,line_count:-1},{...r,replayed:null}]){const f=fixture({data,error:null});assert.equal((await f.run()).status,'error');assert.equal(f.paths.length,0);}
 for(const values of [{request_id:''},{change_order_id:'bad'},{expected_revision:''},{expected_revision:'-1'},{expected_revision:'1.2'},{expected_revision:'9007199254740992'}]){const f=fixture();assert.equal((await f.run(values)).status,'error');assert.equal(f.calls.length,0);}
});
