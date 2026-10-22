import assert from'node:assert/strict';import test from'node:test';import{randomUUID}from'node:crypto';import{load}from'./pr10-test-helpers.mjs';
import{prepareDraftAttempt}from'../src/lib/change-orders/draft-attempt.ts';
const uid=randomUUID(),id=randomUUID(),job=randomUUID(),request=randomUUID();
function form(overrides={}){const f=new FormData();for(const[k,v]of Object.entries({request_id:request,change_order_id:id,expected_revision:'4',approver_name:'Synthetic approver',approval_method:'phone',approval_notes:'Synthetic documented permission\nScope and price confirmed.',...overrides}))f.set(k,v);return f;}
function fixture(result){
 const calls=[],paths=[],db={auth:{getUser:async()=>({data:{user:{id:uid}}})},from:()=>assert.fail('Manual approval must use its guarded transaction'),rpc:()=>assert.fail('Unversioned approval is not allowed')};
 const receipt={request_id:request,id,job_id:job,organization_id:null,reviewed_revision:4,edit_revision:6,current_revision:6,current_status:'approved',newly_approved:true,applied_scope_count:1,replayed:false};
 const actions=load('../src/lib/actions/change-orders.ts',{'@/lib/email/delivery-commands':{callDeliveryCommand:async(client,name,args)=>{calls.push({client,name,args});return result??{data:receipt,error:null};}},'next/cache':{revalidatePath:p=>paths.push(p)},'@/lib/activity-log':{recordActivity:()=>assert.fail('History belongs to approval transaction')},'@/lib/auth/roles':{getUserRoles:async()=>['estimator'],hasAllowedRole:(r,a)=>r.some(x=>a.includes(x)),platformRoleGroups:{internalStaff:['owner','admin','payroll_admin','estimator']}},'@/lib/data/change-orders':{},'@/lib/notifications/source-events':{},'@/lib/portal/tokens':{},'@/lib/email/send':{sendTransactionalEmail:()=>assert.fail('Manual approval must not send customer email')},'@/lib/portal/change-order-links':{},'@/lib/portal/urls':{},'@/lib/supabase/server':{createClient:async()=>db},'@/lib/supabase/admin':{},'@/lib/security/portal-rate-limit':{},'@/lib/security/errors':{safeStaffMessage:v=>v}});
 return{calls,paths,receipt,run:overrides=>actions.manuallyApproveChangeOrder({},form(overrides))};
}
test('manual approval uses one version-bound authenticated command and derives the recording actor on the server',async()=>{
 const f=fixture(),r=await f.run();assert.equal(r.status,'success');assert.equal(r.saveDestination,'/admin/change-orders/'+id+'?approval_recorded=1');assert.equal(f.calls.length,1);const c=f.calls[0];assert.equal(c.name,'record_change_order_manual_approval');assert.equal(c.args.p_expected_revision,4);assert.equal(c.args.p_request_id,request);assert.equal(c.args.p_approval.method,'phone');assert.match(c.args.p_approval.notes,/\n/);assert.ok(!('p_recorded_by_user_id'in c.args));assert.ok(f.paths.includes('/admin/jobs/'+job));
});
test('manual replay acknowledges the original approval rather than applying new scope',async()=>{
 const r=fixture().receipt;const f=fixture({data:{...r,replayed:true,current_revision:8},error:null});assert.match((await f.run()).message,/earlier approval/);assert.equal(f.calls.length,1);
});
test('stale review requires current-record review and uncertain outcomes cannot claim approval',async()=>{
 for(const code of ['PT409','23514','42501']){const r=await fixture({data:null,error:{code,message:'Review current record'}}).run();assert.equal(r.reviewRequired,true);assert.equal(r.saveRejected,true);assert.equal(r.saveDestination,undefined);}
 const r=await fixture({data:null,error:{code:'DELIVERY_UNCONFIRMED',message:'Private diagnostic'}}).run();assert.equal(r.saveRejected,false);assert.equal(r.saveDestination,undefined);assert.doesNotMatch(r.message,/Private diagnostic/);
});
test('invalid approval details or malformed acknowledgement never navigate or report approval',async()=>{
 const r=fixture().receipt;for(const data of [null,{}, {...r,request_id:randomUUID()},{...r,id:randomUUID()},{...r,reviewed_revision:5},{...r,current_status:'sent'},{...r,applied_scope_count:-1},{...r,newly_approved:false},{...r,replayed:null}]){const f=fixture({data,error:null});assert.equal((await f.run()).status,'error');assert.equal(f.paths.length,0);}
 for(const v of [{request_id:'bad'},{change_order_id:''},{expected_revision:''},{expected_revision:'-1'},{approver_name:''},{approval_method:'portal'},{approval_notes:' '},{approved_by_contact_id:'bad'}]){const f=fixture();assert.equal((await f.run(v)).status,'error');assert.equal(f.calls.length,0);}
});
test('pending manual approval survives reload without storing customer authorization details',async()=>{
 const values=new Map(),s={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 const a=await prepareDraftAttempt('manual-approval:'+id,form(),4,s),b=await prepareDraftAttempt('manual-approval:'+id,form(),9,s);assert.deepEqual(a.attempt,b.attempt);assert.doesNotMatch(JSON.stringify([...values]),/Synthetic approver|documented permission/);assert.equal((await prepareDraftAttempt('manual-approval:'+id,form({approval_notes:'Different authorization'}),9,s)).blocked,true);
});
