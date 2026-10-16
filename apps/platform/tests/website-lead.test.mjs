import assert from 'node:assert/strict';
import test from 'node:test';
import * as crypto from 'node:crypto';
import {load} from './pr10-test-helpers.mjs';

const jobId=crypto.randomUUID(),attemptId=crypto.randomUUID();
const body=(extra={})=>new URLSearchParams({name:'Local Request',phone:'5405550123',email:'test@example.invalid',address:'123 Local Street, Fredericksburg, VA 22401',message:'Please review this tree',service:'Tree Care',submission_id:'local-1',...extra});
function intake(client){return load('../src/lib/leads/intake.ts',{'server-only':{},'node:crypto':crypto,'@/lib/supabase/admin':{getServiceRoleClient:()=>client}});}
const request=extra=>new Request('http://localhost/api/leads',{method:'POST',body:body(extra)});
function notice({recipients=['one@example.invalid','two@example.invalid'],send=async()=>({outcome:'accepted',historyRecorded:true}),rpc=async name=>({data:name==='claim_website_lead_notification'?attemptId:true,error:null})}={}) {
 const calls=[];const mod=load('../src/lib/leads/notifications.ts',{'server-only':{},'@/lib/email/config':{getInternalLeadNotificationEmails:()=>recipients},'@/lib/email/send':{sendTransactionalEmail:async args=>{calls.push(args);return send(args);}},'@/lib/email/templates':{leadInternalNoticeTemplate:()=>({subject:'Local notice',text:'Local',html:'Local'})},'@/lib/leads/intake':{isUuid:intake(null).isUuid},'@/lib/supabase/admin':{getServiceRoleClient:()=>({rpc})}});return{...mod,calls};
}
function route({result={created:true,duplicateMode:null,error:null,jobId,submissionId:'local-1'},limit={allowed:true,available:true},canary=false,parse,send=async()=>{},save}={}) {
 const calls={saved:0,notices:0,parsed:0};const parser=intake(null).parsePublicLeadSubmission;
 const mod=load('../src/app/api/leads/route.ts',{'next/server':{NextResponse:class extends Response{static json(body,init){return Response.json(body,init);}}},'@/lib/leads/config':{PUBLIC_LEAD_SUCCESS_MESSAGE:'Request received.',getAllowedLeadIntakeOrigins:()=>['https://allowed.example']},'@/lib/leads/intake':{parsePublicLeadSubmission:async req=>{calls.parsed++;return parse?parse(req):parser(req);},createWebsiteLead:async s=>{calls.saved++;return save?save(s):result;}},'@/lib/leads/notifications':{attemptWebsiteLeadNotification:async(...args)=>{calls.notices++;return send(...args);}},'@/lib/security/monitoring-secret':{bearerToken:()=>null,isAuthenticatedMonitoringCanary:()=>canary},'@/lib/security/rate-limit':{enforceSharedRateLimit:async()=>limit,hashRateLimitKey:()=> 'local-hash',trustedClientIp:()=>null},'@/lib/supabase/admin':{getServiceRoleClient:()=>({from:()=>({select:()=>({limit:async()=>({error:null})})})})}});return{...mod,calls};
}
const req=(extra={},headers={})=>new Request('http://localhost/api/leads',{method:'POST',headers:{origin:'https://allowed.example',...headers},body:body(extra)});

test('public form normalization, attribution and opt-in survive the atomic adapter',async()=>{
 const parsed=await intake(null).parsePublicLeadSubmission(request({customer_type:'Commercial / Property Management',commercial_name:'Local company',hazard_present:'yes',updates_opt_in:'yes',preferred_contact_method:'text',utm_campaign:'test'}));assert.equal(parsed.error,null);const s=parsed.data;assert.equal(s.phone,'+15405550123');assert.equal(s.firstName,'Local');assert.equal(s.customerType,'commercial');assert.equal(s.hazardPresent,true);assert.equal(s.updatesOptIn,true);assert.equal(s.addressParts.city,'Fredericksburg');assert.match(s.requestFingerprint,/^[a-f0-9]{64}$/);
 let input;const api=intake({rpc:async(name,args)=>{assert.equal(name,'submit_website_lead');input=args.p_submission;return{data:{job_id:jobId,created:true,duplicate_mode:null,submission_id:s.submissionId},error:null};}});assert.equal((await api.createWebsiteLead(s)).jobId,jobId);assert.deepEqual(input,s);
});
test('only a full matching transaction acknowledgement can authorize an office notice',async()=>{
 const s=(await intake(null).parsePublicLeadSubmission(request())).data;
 for(const response of [null,{job_id:jobId},{job_id:jobId,created:true,duplicate_mode:'replayed',submission_id:s.submissionId},{job_id:jobId,created:false,duplicate_mode:null,submission_id:s.submissionId},{job_id:jobId,created:true,duplicate_mode:null,submission_id:'wrong'}])assert.equal((await intake({rpc:async()=>({data:response,error:null})}).createWebsiteLead(s)).jobId,null);
 for(const rpc of [async()=>{throw Error('secret diagnostic');},async()=>({error:{message:'secret diagnostic'}})]){const r=await intake({rpc}).createWebsiteLead(s);assert.equal(r.jobId,null);assert.doesNotMatch(r.error,/secret/);}
 assert.equal((await intake(null).createWebsiteLead(s)).jobId,null);
});
test('parser preserves spam suppression, required input validation and service aliases',async()=>{
 const api=intake(null);assert.equal((await api.parsePublicLeadSubmission(request({'bot-field':'bot'}))).spam,true);assert.equal((await api.parsePublicLeadSubmission(request({form_started_at:String(Date.now())}))).spam,true);
 for(const extra of [{name:''},{phone:'bad'},{email:'bad'},{address:''},{message:''},{service:'unsupported'},{customer_type:'wrong'},{property_scope:'wrong'}])assert.ok((await api.parsePublicLeadSubmission(request(extra))).error);
 assert.equal((await api.parsePublicLeadSubmission(request({service:'tree services'}))).data.serviceLabel,'Tree Care');
});
test('office notification waits for all recipients and preserves stable provider idempotency keys',async()=>{
 const n=notice();assert.equal(await n.notifyOfficeOfWebsiteLead(jobId,{}),'accepted');assert.deepEqual(n.calls.map(x=>x.idempotencyKey),[0,1].map(i=>`website-lead:${jobId}:recipient:${i}`));assert.ok(n.calls.every(x=>x.emailType==='lead_internal_notice'&&x.relatedJobId===jobId));
});
for(const [name,send,expected] of [
 ['provider timeout',async()=>({outcome:'unknown',historyRecorded:true}),'unknown'],
 ['accepted without local receipt',async()=>({outcome:'accepted',historyRecorded:false}),'unknown'],
 ['partly accepted recipients',async args=>({outcome:args.to.startsWith('one')?'accepted':'rejected',historyRecorded:true}),'unknown'],
 ['provider rejection',async()=>({outcome:'rejected',historyRecorded:true}),'rejected'],
 ['unconfigured provider',async()=>({outcome:'not_attempted',historyRecorded:true}),'not_attempted'],
 ['thrown provider call',async()=>{throw Error('private diagnostic');},'unknown'],
])test(`office notice classifies ${name} without unsafe retry`,async()=>{assert.equal(await notice({send}).notifyOfficeOfWebsiteLead(jobId,{}),expected);});
test('an empty recipient list never claims provider acceptance',async()=>assert.equal(await notice({recipients:[]}).notifyOfficeOfWebsiteLead(jobId,{}),'not_attempted'));
test('claim errors, lost acknowledgement and already-claimed attempts cannot send',async()=>{
 for(const rpc of [async()=>({data:null,error:{message:'private'}}),async()=>({data:null,error:null}),async()=>({data:'partial-ack',error:null}),async()=>{throw Error('lost response');}]){const n=notice({rpc});await n.attemptWebsiteLeadNotification(jobId,{});assert.equal(n.calls.length,0);}
});
test('finish is fenced to the claimed attempt, and finish failures never resend accepted mail',async()=>{
 const commands=[];const n=notice({rpc:async(name,args)=>{commands.push({name,args});return name==='claim_website_lead_notification'?{data:attemptId,error:null}:{data:false,error:{message:'lost finish response'}};}});await n.attemptWebsiteLeadNotification(jobId,{});assert.equal(n.calls.length,2);assert.deepEqual(commands[1],{name:'finish_website_lead_notification',args:{p_job_id:jobId,p_attempt_id:attemptId,p_outcome:'accepted'}});
});
test('public route preserves origin/content/rate gates before parser or transaction',async()=>{
 for(const [headers,limit,status] of [[{origin:'https://bad.example'},undefined,403],[{'content-type':'application/json'},undefined,415],[{'content-length':'32001'},undefined,413],[{}, {allowed:false,available:true,retryAfterSeconds:60},429],[{}, {allowed:false,available:false},503]]){const r=route({limit});const response=await r.POST(req({},headers));assert.equal(response.status,status);assert.equal(r.calls.saved,0);assert.equal(r.calls.parsed,0);assert.equal(r.calls.notices,0);}
});
test('spam, validation failures and authenticated monitoring canaries never persist or email',async()=>{
 for(const [extra,canary,status] of [[{'bot-field':'bot'},false,202],[{phone:'bad'},false,400],[{},true,200]]){const r=route({canary});const response=await r.POST(req(extra));assert.equal(response.status,status);assert.equal(r.calls.saved,0);assert.equal(r.calls.notices,0);}
});
test('created leads notify once; duplicate replays do not send or expose CRM identifiers',async()=>{
 for(const created of [true,false]){const r=route({result:{created,jobId,submissionId:'local-1',duplicateMode:created?null:'replayed',error:null}});const response=await r.POST(req());assert.equal(response.status,created?201:200);assert.equal(r.calls.notices,created?1:0);assert.deepEqual(await response.json(),{ok:true,message:'Request received.'});assert.equal(response.headers.get('Cache-Control'),'no-store');}
});
test('failed saves and uncertain notifications cannot leak provider or database diagnostics',async()=>{
 const r=route({result:{created:false,jobId:null,submissionId:'local-1',duplicateMode:null,error:'private diagnostic'}});const response=await r.POST(req());assert.equal(response.status,503);assert.equal(r.calls.notices,0);assert.doesNotMatch(await response.text(),/private|submission_id|job_id/);
});
test('notice labels distinguish provider acceptance, uncertain delivery and legacy records',()=>{
 const {websiteLeadNoticeLabel:label}=load('../src/lib/leads/notice-status.ts');assert.equal(label('accepted','sent'),'Accepted by email provider');assert.match(label('unknown','failed'),/review before retry/);assert.match(label('sending','pending'),/review before retry/);assert.equal(label(null,'sent'),'Sent');assert.match(label('not_attempted','skipped'),/check email setup/);
});
