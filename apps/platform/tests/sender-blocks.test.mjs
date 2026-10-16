import assert from 'node:assert/strict';
import test from 'node:test';
import * as crypto from 'node:crypto';
import {load} from './pr10-test-helpers.mjs';

const submission={submissionId:'local-blocked-request'};
const intake=data=>load('../src/lib/leads/intake.ts',{'server-only':{},'node:crypto':crypto,'@/lib/supabase/admin':{getServiceRoleClient:()=>({rpc:async()=>({data,error:null})})}});
test('only a full blocked acknowledgement can suppress work without authorizing a notice',async()=>{
 const ack={blocked:true,created:false,job_id:null,duplicate_mode:null,submission_id:submission.submissionId};
 const r=await intake(ack).createWebsiteLead(submission);assert.equal(r.blocked,true);assert.equal(r.error,null);assert.equal(r.jobId,null);assert.equal(r.created,false);
 for(const invalid of [{...ack,created:true,job_id:crypto.randomUUID()},{...ack,submission_id:'wrong'},{...ack,duplicate_mode:'replayed'},{blocked:true},{...ack,job_id:crypto.randomUUID()}]){
  const r=await intake(invalid).createWebsiteLead(submission);assert.ok(r.error);assert.equal(r.blocked,undefined);assert.equal(r.jobId,null);
 }
});

test('block reads fail visibly on missing or malformed acknowledgement instead of reporting no blocks',async()=>{
 const empty={count:0,activeCount:0,rows:[]};
 for(const register of [null,{}, {...empty,count:null},{...empty,rows:[{id:'broken'}]}]){
  const mod=load('../src/lib/leads/sender-blocks.ts',{'server-only':{},'@/lib/supabase/server':{createClient:async()=>({rpc:async name=>({data:name==='get_website_sender_controls'?[]:register,error:null})})}});
  assert.ok((await mod.getSenderBlockData([],1)).error);
 }
 const mod=load('../src/lib/leads/sender-blocks.ts',{'server-only':{},'@/lib/supabase/server':{createClient:async()=>({rpc:async name=>({data:name==='get_website_sender_controls'?[]:empty,error:null})})}});
 assert.equal((await mod.getSenderBlockData([],1)).error,null);
});

test('server action rechecks live roles, validates changes and retains a request ID on uncertain acknowledgement',async()=>{
 const job=crypto.randomUUID(),request=crypto.randomUUID(),calls=[];
 let roles=['owner'],response={data:{unblocked:false,blockIds:[crypto.randomUUID()]},error:null};
 const db={auth:{getUser:async()=>({data:{user:{id:crypto.randomUUID()}}})},rpc:async(name,args)=>{calls.push({name,args});return response;}};
 const mod=load('../src/app/admin/communications/lead-actions.ts',{
  'next/cache':{revalidatePath:()=>{}},'@/lib/actions/record-lifecycle':{updateRecordLifecycle:()=>assert.fail()},'@/lib/activity-log':{recordActivity:()=>assert.fail()},
  '@/lib/auth/roles':{getCurrentUserRolesFromClient:async()=>roles,hasAllowedRole:(a,b)=>a.some(r=>b.includes(r)),platformRoleGroups:{accessApproval:['owner','admin']}},
  '@/lib/communications/queue':{cancelPendingCommunications:()=>assert.fail()},'@/lib/leads/archive':{archiveWebsiteLead:()=>assert.fail()},'@/lib/security/errors':{safeStaffMessage:x=>x},'@/lib/supabase/server':{createClient:async()=>db},
 });
 const form=new FormData();for(const [k,v] of Object.entries({intent:'block',job_id:job,request_id:request,email:'sender@example.invalid',phone:'+15405550123',block_email:'on',reason:'Repeated spam'}))form.set(k,v);
 roles=['estimator'];assert.equal((await mod.changeWebsiteSenderBlock({},form)).status,'error');assert.equal(calls.length,0);
 roles=['owner'];assert.equal((await mod.changeWebsiteSenderBlock({},form)).status,'success');assert.equal(calls[0].args.p_request,request);assert.equal(calls[0].args.p_phone,false);
 response={data:null,error:{code:'40001',message:'private database details'}};const failed=await mod.changeWebsiteSenderBlock({},form);assert.match(failed.message,/Contact details changed/);assert.doesNotMatch(failed.message,/private/);
 response={data:null,error:null};assert.equal((await mod.changeWebsiteSenderBlock({},form)).status,'error');assert.equal(calls.at(-1).args.p_request,request);
});
