import * as branding from '../src/lib/company-brand.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {load} from './pr10-test-helpers.mjs';
import {prepareChangeOrderApprovalAttempt,forgetChangeOrderResponseAttempt} from '../src/lib/portal/change-order-response-attempt.ts';
import {customerChangeOrderState} from '../src/lib/portal/customer-states.ts';
const before='2035-01-01T12:00:00Z',after='2035-02-01T12:00:00Z',hash='a'.repeat(64),newHash='b'.repeat(64);
function storage(){const values=new Map();return{values,getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};}
test('approval response loss retains identity and exact reviewed content across page reloads',async()=>{
 const s=storage(),one=await prepareChangeOrderApprovalAttempt('private-capability','Synthetic Name',before,hash,s);
 const reloaded=await prepareChangeOrderApprovalAttempt('private-capability','Synthetic Name',after,newHash,s);
 assert.deepEqual(reloaded.attempt,one.attempt);assert.doesNotMatch(JSON.stringify([...s.values]),/private-capability|Synthetic Name/);
 const edited=await prepareChangeOrderApprovalAttempt('private-capability','Different Name',after,newHash,s);assert.equal(edited.attempt.reviewedAt,before);assert.equal(edited.attempt.reviewHash,hash);
 forgetChangeOrderResponseAttempt(edited.key,s);const fresh=await prepareChangeOrderApprovalAttempt('private-capability','Different Name',after,newHash,s);assert.equal(fresh.attempt.reviewHash,newHash);assert.equal(fresh.attempt.reviewedAt,after);
});
test('approval storage failure retains the page-local attempt and rejects malformed cached identities',async()=>{
 const blocked={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')},removeItem(){throw Error('blocked')}};
 const one=await prepareChangeOrderApprovalAttempt('cap','Name',before,hash,blocked);assert.deepEqual((await prepareChangeOrderApprovalAttempt('cap','Name',after,newHash,blocked,one.attempt)).attempt,one.attempt);
 const malformed={...blocked,getItem:()=>JSON.stringify({requestId:'bad',reviewHash:hash,reviewedAt:'bad',payloadHash:hash}),setItem(){}};
 assert.equal((await prepareChangeOrderApprovalAttempt('cap','Name',before,hash,malformed)).attempt.reviewedAt,before);
});
test('only sent, unexpired additions present decision controls; closed/waiting copy is accurate',()=>{
 assert.equal(customerChangeOrderState('sent').canRespond,true);
 for(const status of ['draft','pending_internal_review','ready_to_send','approved','declined','cancelled','expired','change_requested','unknown'])assert.equal(customerChangeOrderState(status).canRespond,false,status);
 assert.equal(customerChangeOrderState('sent','2020-01-01').canRespond,false);assert.match(customerChangeOrderState('change_requested').title,/under review/);assert.doesNotMatch(customerChangeOrderState('cancelled').message,/response.*on file/i);
 assert.equal(customerChangeOrderState('approved','2020-01-01').title,'Additional work approved');
});
const receipt={change_order_id:randomUUID(),job_id:randomUUID(),source_event_id:randomUUID(),replayed:false,newly_approved:true};
function actionFixture(options={}){
 const calls=[],notifications=[],form=new FormData();Object.entries({token:'synthetic-token',request_id:randomUUID(),expected_updated_at:before,review_hash:hash,approver_name:'Synthetic Name',change_order_id:'forged-client-id',...options.form}).forEach(([k,v])=>form.set(k,v));
 const action=load('../src/lib/actions/change-orders.ts',{'../company-brand.ts':branding,
  '@/lib/email/delivery-commands':{callDeliveryCommand:async(db,name,args)=>{calls.push({name,args});return options.result??{data:receipt,error:null};}},'next/cache':{revalidatePath(){}},'next/navigation':{},'@/lib/activity-log':{},'@/lib/auth/roles':{},'@/lib/data/change-orders':{getChangeOrderByPortalToken:()=>assert.fail('A separate lookup cannot authorize approval')},'@/lib/notifications/source-events':{deliverCustomerSourceEvent:async v=>notifications.push(v)},'@/lib/portal/tokens':{hashPortalToken:()=>options.invalidToken?null:hash},'@/lib/email/send':{},'@/lib/email/config':{},'@/lib/email/delivery':{},'@/lib/email/delivery-followups':{},'@/lib/portal/change-order-links':{},'@/lib/portal/urls':{},'@/lib/supabase/server':{},'@/lib/supabase/admin':{getServiceRoleClient:()=>({})},'@/lib/security/portal-rate-limit':{checkPortalActionRateLimit:async()=>options.rate??{allowed:true,available:true}},'@/lib/security/errors':{safeStaffMessage:message=>message},
 });return{calls,notifications,run:()=>action.approveChangeOrderByPortal({},form)};
}
test('approval uses the capability/version/digest command and only confirmed source-event receipts trigger handoff',async()=>{
 const f=actionFixture();assert.equal((await f.run()).status,'success');assert.equal(f.calls[0].name,'approve_change_order_by_portal');assert.equal(f.calls[0].args.p_review_hash,hash);assert.equal(f.calls[0].args.p_token_hash,hash);assert.ok(!('p_change_order_id'in f.calls[0].args));assert.deepEqual(f.notifications,[{id:receipt.source_event_id}]);
 for(const data of [null,{}, {...receipt,source_event_id:'bad'},{...receipt,replayed:null}]){const g=actionFixture({result:{data,error:null}});assert.equal((await g.run()).status,'error');assert.equal(g.notifications.length,0);}
});
test('unknown outcomes retain retry identity; explicit rejections offer reviewed recovery and never notify',async()=>{
 const unknown=actionFixture({result:{data:null,error:{code:'DELIVERY_UNCONFIRMED',message:'sensitive diagnostic'}}});const r=await unknown.run();assert.equal(r.responseRejected,false);assert.match(r.message,/could not be confirmed/);assert.doesNotMatch(r.message,/sensitive/);assert.equal(unknown.notifications.length,0);
 for(const code of ['PT409','40001','42501','23514','22023']){const f=actionFixture({result:{data:null,error:{code,message:'private diagnostic'}}});assert.equal((await f.run()).responseRejected,true);assert.equal(f.notifications.length,0);}
});
test('invalid input, unavailable rate limit and throttling stop before approval RPC',async()=>{
 for(const options of [{invalidToken:true},{form:{review_hash:'bad'}},{form:{request_id:'bad'}},{form:{expected_updated_at:'bad'}},{rate:{available:false,allowed:false}},{rate:{available:true,allowed:false}}]){const f=actionFixture(options);assert.equal((await f.run()).status,'error');assert.equal(f.calls.length,0);assert.equal(f.notifications.length,0);}
});
