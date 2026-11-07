import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {orderInput,policyHash} from './policy.mjs';
import {SANDBOX_ACCOUNT,LIVE_ACCOUNT} from './config.mjs';
import {purpose} from './provider.mjs';
import {CRM_CANDIDATE_CONTRACT,CRM_CANDIDATE_PATH,canonicalCandidate,candidateDigest,createCandidateBinding,parseCandidateRequest,candidateMetadata,candidateCrmTestConfig,candidateCrmClient,validateCandidateReceipt} from './crm-contract.mjs';

const scope={origin:'http://127.0.0.1:48987',sourceId:'website_firewood_candidate_v1',keyId:'synthetic_only',signingSecret:'t'.repeat(64),mode:'sandbox',accountId:SANDBOX_ACCOUNT};
const input={quantity:'two',stacking:true,name:'Synthetic Firewood Customer',email:'crm-candidate@example.invalid',phone:'2025550142',address:'123 Synthetic Lane',address2:'',city:'Fredericksburg',state:'VA',postal:'22401',notes:'Synthetic test only; no dispatch.',termsAccepted:true,householdUseConfirmed:true};
const id='a7c01c0a-3dc8-4ca0-85f8-898393a57340',accepted=1793210400000;
function row(changes={}){return {id,number:'FW-A7C01C0A',created_at:accepted,...orderInput({...input,...changes},{sandbox:true})};}
function request(changes={}){return {...createCandidateBinding(row(changes),scope),session_id:'cs_test_synthetic_candidate_session'};}
function receipt(req,extra={}){return {...Object.fromEntries(Object.entries(req).filter(([k])=>k!=='order')),import_status:'recorded',
  payment_intent_id:'pi_syntheticcandidate',invoice_id:'12345678-1234-4234-8234-123456789012',invoice_number:'TEST-FW-'+req.order_id,payment_id:'22345678-1234-4234-8234-123456789012',
  total_cents:req.order.total_cents,currency:'usd',invoice_status:'paid',balance_due_cents:0,replayed:false,
  original_receipt:{paid:true,balance_due_cents:0},notification_authority:'website',crm_customer_email_sent:false,delivery_completed:false,
  payment_retry_required:false,refund_cents:0,refund_pending:false,refund_review_required:false,dispute_status:null,review_required:false,refresh_required:false,...extra};}

test('proposed normalized snapshot and metadata match the shared synthetic fixture exactly',()=>{
  const req=request();assert.equal(req.snapshot_hash,'65db00151eb1411aae18c5a2b9b6c2ad2df3e2ae30475def1b7df8f832baa220');
  assert.equal(req.contract,CRM_CANDIDATE_CONTRACT);assert.equal(req.order_id,req.attempt_id);assert.equal(req.order.terms.hash,policyHash);
  const meta=candidateMetadata(req);assert.equal(meta.purpose,purpose);assert.equal(meta.ats_snapshot_hash,req.snapshot_hash);assert.equal(meta.order,id);assert.equal(meta.environment,'sandbox');
  assert.ok(!JSON.stringify(meta).includes(input.email));assert.deepEqual(parseCandidateRequest(req),req);
});
test('all six server prices, free delivery and household acceptance are part of the frozen proposed snapshot',()=>{
  for(const [quantity,stacking,total] of [['half',false,30000],['half',true,45000],['full',false,45000],['full',true,60000],['two',false,84000],['two',true,99000]]){
    const req=request({quantity,stacking});assert.equal(req.order.total_cents,total);assert.equal(req.order.delivery_cents,0);assert.equal(req.order.terms.householdUseConfirmed,true);
    const changed=structuredClone(req);changed.order.total_cents++;assert.throws(()=>parseCandidateRequest(changed));
  }
});
test('normalization preserves display input and binds email/phone/state consistently',()=>{
  const value=row({email:' CRM-CANDIDATE@EXAMPLE.INVALID ',phone:'+1 (202) 555-0142',state:'va'}),original=structuredClone(value);
  const binding=createCandidateBinding(value,scope);assert.equal(binding.order.contact.email,input.email);assert.equal(binding.order.contact.phone,input.phone);assert.equal(binding.snapshot_hash,request().snapshot_hash);assert.deepEqual(value,original);
});
test('unknown fields, changed terms, account/mode and mixed attempt/session identities are refused',()=>{
  for(const mutate of [v=>v.extra=true,v=>v.order.extra=true,v=>v.order.contact.extra=true,v=>v.order.terms.householdUseConfirmed=false,
    v=>v.order.terms.version='old',v=>v.order.contact.notes=null,v=>v.mode='live',v=>v.account_id=LIVE_ACCOUNT,v=>v.attempt_id=randomUUID(),v=>v.session_id='cs_live_synthetic_session',v=>v.reference='FW-WRONG',v=>v.snapshot_hash='0'.repeat(64)]){
    const v=request();mutate(v);assert.throws(()=>parseCandidateRequest(v));
  }
  for(const bad of [undefined,NaN,Infinity])assert.throws(()=>canonicalCandidate(bad));
});
test('office amounts require a frozen pre-purchase approval and are never relabeled from old quotes',()=>{
  const value=row({quantity:'full',stacking:true});value.quote={...value.quote,officeApproved:true,woodCents:42750,stackingCents:14250,totalCents:57000};
  assert.throws(()=>createCandidateBinding(value,scope));
  value.quote.officeApproval={approval_id:randomUUID(),approved_at_ms:accepted-1000,residential:true,single_discount_confirmed:true};
  const binding=createCandidateBinding(value,scope);assert.equal(binding.order.total_cents,57000);assert.equal(binding.order.office_approval.approval_id,value.quote.officeApproval.approval_id);
  const future=structuredClone(value);future.quote.officeApproval.approved_at_ms=accepted+1;assert.throws(()=>createCandidateBinding(future,scope));
  const mixed=structuredClone(value);mixed.quote.officeApproval.single_discount_confirmed=false;assert.throws(()=>createCandidateBinding(mixed,scope));
});
test('candidate client configuration is explicit, loopback-only, sandbox-only and has no generic credential fallback',()=>{
  const env={FIREWOOD_CRM_CANDIDATE_TEST_ENABLED:'1',FIREWOOD_CRM_CANDIDATE_TEST_ORIGIN:scope.origin,FIREWOOD_CRM_CANDIDATE_SOURCE_ID:scope.sourceId,
    FIREWOOD_CRM_CANDIDATE_KEY_ID:scope.keyId,FIREWOOD_CRM_CANDIDATE_SHARED_SECRET:scope.signingSecret,FIREWOOD_CANDIDATE_MODE:'sandbox',FIREWOOD_CANDIDATE_ACCOUNT:SANDBOX_ACCOUNT};
  assert.deepEqual(candidateCrmTestConfig(env),scope);assert.equal(candidateCrmTestConfig({STRIPE_SECRET_KEY:'unused',SUPABASE_URL:'unused'}),null);
  for(const origin of ['https://admin.angeltreeservices.org','http://localhost:48987','http://127.0.0.1','http://127.0.0.1:48987/path','http://127.0.0.1:48987?x=1','http://user:password@127.0.0.1:48987'])assert.throws(()=>candidateCrmClient({...scope,origin}));
  assert.throws(()=>candidateCrmClient({...scope,mode:'live',accountId:LIVE_ACCOUNT}));assert.throws(()=>candidateCrmClient({...scope,signingSecret:''}));
  assert.throws(()=>candidateCrmTestConfig({...env,FIREWOOD_CRM_CANDIDATE_TEST_ENABLED:'yes'}));
});
test('client signs exact canonical bytes/path and refuses redirects without exposing the signing secret',async()=>{
  const req=request(),calls=[],now=accepted+10000;
  const client=candidateCrmClient(scope,async(url,options)=>{calls.push({url,options});return Response.json(receipt(req));},()=>now);
  await client.send(req,null,'pi_syntheticcandidate');const call=calls[0],timestamp=String(Math.floor(now/1000));
  assert.equal(call.url,scope.origin+CRM_CANDIDATE_PATH);assert.equal(call.options.redirect,'error');assert.equal(call.options.body,canonicalCandidate(req));
  assert.equal(call.options.headers['X-ATS-Signature'],'v1='+createHmac('sha256',scope.signingSecret).update(timestamp+'\nPOST\n'+CRM_CANDIDATE_PATH+'\n'+call.options.body).digest('hex'));
  assert.ok(!JSON.stringify(call).includes(scope.signingSecret));
});
test('sandbox transport refuses real customer email and changed source before any network call',async()=>{
  let calls=0;const client=candidateCrmClient(scope,async()=>{calls++;throw Error('must_not_call');});
  const real=request();real.order.contact.email='customer@example.com';real.snapshot_hash=candidateDigest(real.order);
  await assert.rejects(client.send(real,null,'pi_syntheticcandidate'),e=>e.code==='source_not_allowed');
  await assert.rejects(client.send({...request(),source_id:'another_source'},null,'pi_syntheticcandidate'));assert.equal(calls,0);
});
test('identity, money, source, household hash and sole-notification evidence must all match the response',()=>{
  const req=request();for(const change of [{snapshot_hash:'0'.repeat(64)},{total_cents:1},{mode:'test'},{source_id:'wrong_source'},
    {notification_authority:'crm'},{crm_customer_email_sent:true},{payment_retry_required:true},{delivery_completed:true},{payment_intent_id:'pi_wrong'},
    {invoice_status:'sent'},{balance_due_cents:1},{original_receipt:{paid:false,balance_due_cents:0}}]){
    assert.throws(()=>validateCandidateReceipt(receipt(req,change),req,null,'pi_syntheticcandidate'));
  }
  assert.throws(()=>validateCandidateReceipt(receipt(req,{invoice_id:randomUUID()}),req,receipt(req),'pi_syntheticcandidate'),e=>e.code==='mapping_review_required');
});
test('pending and later-failed refunds keep the original paid receipt and explicit current financial review',()=>{
  const req=request(),initial=receipt(req),paidBack=receipt(req,{refund_cents:99000,review_required:true});
  assert.equal(validateCandidateReceipt(paidBack,req,initial,'pi_syntheticcandidate').refund_cents,99000);
  const laterFailure=receipt(req,{refund_cents:0,refund_review_required:true,review_required:true});
  const value=validateCandidateReceipt(laterFailure,req,paidBack,'pi_syntheticcandidate');assert.equal(value.refund_cents,0);assert.equal(value.original_receipt.paid,true);
  assert.throws(()=>validateCandidateReceipt(receipt(req,{refund_pending:true,review_required:true}),req,null,'pi_syntheticcandidate'));
  assert.equal(validateCandidateReceipt(receipt(req,{refund_pending:true,review_required:true,refresh_required:true}),req,null,'pi_syntheticcandidate').refresh_required,true);
});
test('unnegotiated financial flags and unavailable observations cannot be accepted as settled zero refunds',async()=>{
  const req=request(),previous=receipt(req,{refund_cents:99000,review_required:true}),copy=structuredClone(previous);
  assert.throws(()=>validateCandidateReceipt(receipt(req,{provider_observation:'unknown'}),req,previous,'pi_syntheticcandidate'));
  const unknown=candidateCrmClient(scope,async()=>Response.json(receipt(req),{status:503}));
  await assert.rejects(unknown.send(req,previous,'pi_syntheticcandidate'),e=>e.retryable===true);assert.deepEqual(previous,copy);
});
test('authentication and identity errors require review while outages and rate limits retain retry semantics',async()=>{
  const req=request();for(const status of [400,401,403,404,409,413,422]){
    const client=candidateCrmClient(scope,async()=>new Response('{}',{status}));await assert.rejects(client.send(req,null,'pi_syntheticcandidate'),e=>e.retryable===false);
  }
  const limited=candidateCrmClient(scope,async()=>new Response('{}',{status:429,headers:{'Retry-After':'120'}}));await assert.rejects(limited.send(req,null,'pi_syntheticcandidate'),e=>e.retryable&&e.delayMs===120000);
  const offline=candidateCrmClient(scope,async()=>{throw Error('private details must not escape');});await assert.rejects(offline.send(req,null,'pi_syntheticcandidate'),e=>e.message==='connection_unconfirmed'&&e.retryable);
});
test('malformed, oversized and interrupted success responses cannot be marked as a confirmed invoice',async()=>{
  const req=request();for(const response of [new Response('{'),new Response(' '.repeat(32769)),new Response(new ReadableStream({start(c){c.error(Error('private stream failure'));}}))]){
    const client=candidateCrmClient(scope,async()=>response);await assert.rejects(client.send(req,null,'pi_syntheticcandidate'),e=>e.code==='response_unconfirmed'&&e.retryable);
  }
});
test('real loopback HTTP verifies the signed proposal and replays one synthetic invoice/payment mapping',async t=>{
  const req=request(),records=new Map();let count=0;
  const server=createServer(async(incoming,out)=>{
    const parts=[];for await(const part of incoming)parts.push(part);const raw=Buffer.concat(parts).toString('utf8'),timestamp=incoming.headers['x-ats-timestamp'];
    const expected='v1='+createHmac('sha256',scope.signingSecret).update(timestamp+'\nPOST\n'+CRM_CANDIDATE_PATH+'\n'+raw).digest('hex');
    if(incoming.url!==CRM_CANDIDATE_PATH||incoming.method!=='POST'||incoming.headers['x-ats-signature']!==expected){out.writeHead(401);out.end('{}');return;}
    const body=parseCandidateRequest(JSON.parse(raw)),replayed=records.has(body.order_id);count++;
    if(!replayed)records.set(body.order_id,receipt(body));out.writeHead(replayed?200:201,{'Content-Type':'application/json','Cache-Control':'no-store'});out.end(JSON.stringify({...records.get(body.order_id),replayed}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const client=candidateCrmClient({...scope,origin:'http://127.0.0.1:'+server.address().port});
  const first=await client.send(req,null,'pi_syntheticcandidate'),second=await client.send(req,first,'pi_syntheticcandidate');assert.equal(count,2);assert.equal(records.size,1);assert.equal(second.invoice_id,first.invoice_id);assert.equal(second.payment_id,first.payment_id);assert.equal(second.replayed,true);
});
