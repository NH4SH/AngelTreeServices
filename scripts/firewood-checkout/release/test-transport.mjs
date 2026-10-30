import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {canonicalLiveHandoff,liveHandoffDigest,LIVE_PORTAL_ORIGIN,LIVE_STATUS_PATH} from '../live/live-contract.mjs';
import {officeBinding,OFFICE_PRICE_REQUEST_PATH,verifyOfficeSignature} from '../office-v2/office-contract.mjs';
import {createProductionTransport,assertProductionTransport} from './transport.mjs';
const secret='d'.repeat(64),keyId='website-office-live-test-key';
const draft={quantity:'full',stacking:true,contact:{name:'Synthetic Review',email:'review@angeltreeservice.org',phone:'2025550194',address:'1 Synthetic Lane',address2:'',city:'Fredericksburg',state:'VA',postal:'22407',notes:'Mock transport only.'}};
const input=()=>({...officeBinding(randomUUID()),draft,draft_hash:liveHandoffDigest(draft)});
const req=(value=input(),path=OFFICE_PRICE_REQUEST_PATH)=>new Request(LIVE_PORTAL_ORIGIN+path,{method:'POST',body:canonicalLiveHandoff(value)});
test('production transport is branded, signed, fixed-origin and gated before any network request',async()=>{
  let call;const channel=createProductionTransport({kind:'office',keyId,secret,admitted:async()=>true,fetcher:async(...args)=>{call=args;return Response.json({confirmed:true});}});
  assert.equal(assertProductionTransport(channel,'office').keyId,keyId);assert.throws(()=>assertProductionTransport({...channel},'office'));
  const response=await channel.handle(req());assert.equal(response.status,200);assert.equal(call[0],LIVE_PORTAL_ORIGIN+OFFICE_PRICE_REQUEST_PATH);
  assert.equal(call[1].redirect,'error');assert.equal(verifyOfficeSignature({raw:call[1].body,timestamp:call[1].headers['X-ATS-Timestamp'],secret,path:OFFICE_PRICE_REQUEST_PATH,signature:call[1].headers['X-ATS-Signature']}),true);
  const held=createProductionTransport({kind:'office',keyId,secret,admitted:async()=>false,fetcher:()=>assert.fail('No request without admission')});
  await assert.rejects(held.handle(req()),/crm_admission_pending/);
});
test('old, foreign, sandbox, synthetic-contact and money-only status requests cannot use production authority',async()=>{
  const channel=createProductionTransport({kind:'office',keyId,secret,admitted:async()=>true,fetcher:()=>assert.fail('No provider request permitted')});
  for(const request of [req(input(),LIVE_STATUS_PATH),req({...input(),contract:'firewood-office-live-v1'}),req({...input(),mode:'sandbox'}),
    req({...input(),draft:{...draft,contact:{...draft.contact,email:'customer@checkout.invalid'}}}),
    new Request('https://foreign.invalid'+OFFICE_PRICE_REQUEST_PATH,{method:'POST',body:'{}'}),req(input(),OFFICE_PRICE_REQUEST_PATH+'?redirect=bad')])
    await assert.rejects(channel.handle(request));
});
test('slow, oversized and invalid responses are bounded and provider errors are redacted',async()=>{
  for(const fetcher of [()=>new Promise(()=>{}),async()=>new Response(new ReadableStream({start(){}})),async()=>new Response('x'.repeat(65537)),async()=>new Response('{invalid')]){
    const channel=createProductionTransport({kind:'office',keyId,secret,admitted:async()=>true,fetcher,timeoutMs:15});
    await assert.rejects(channel.handle(req()),/crm_exchange_unconfirmed/);
  }
  const channel=createProductionTransport({kind:'office',keyId,secret,admitted:async()=>true,fetcher:async()=>Response.json({secret,internal:'private'},{status:401})});
  const response=await channel.handle(req());assert.equal(response.status,401);assert.deepEqual(await response.json(),{code:'crm_exchange_unconfirmed'});
});
