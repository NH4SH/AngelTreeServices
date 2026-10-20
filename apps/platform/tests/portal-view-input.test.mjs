import assert from 'node:assert/strict';
import test from 'node:test';
import {load} from './pr10-test-helpers.mjs';

function fixture({rate={allowed:true,available:true},record={data:{recorded:true},error:null}}={}){
  let rateChecks=0,records=0;
  const mod=load('../src/app/api/portal/views/route.ts',{
    'next/server':{NextResponse:Response},'@/lib/portal/tokens':{hashPortalToken:token=>typeof token==='string'&&token.length===43?'synthetic-hash':null},
    '@/lib/supabase/admin':{getServiceRoleClient:()=>({rpc:(name)=>{assert.equal(name,'record_portal_view');records++;return{single:async()=>record};}})},
    '@/lib/security/rate-limit':{enforceSharedRateLimit:async()=>{rateChecks++;return rate;}},
    '@/lib/security/app-base-url':{getCanonicalAppBaseUrl:()=> 'http://127.0.0.1:3102'},
  });
  const request=(body,headers={})=>new Request('http://127.0.0.1:3102/api/portal/views',{method:'POST',body,duplex:'half',headers:{origin:'http://127.0.0.1:3102','content-type':'application/json',...headers}});
  return{post:mod.POST,request,counts:()=>({rateChecks,records})};
}
const valid={documentType:'quote',token:'t'.repeat(43),sessionId:'synthetic-session-id'};
test('null, arrays and primitive JSON cannot throw or invoke a view mutation; parsed invalid bodies retain rate checks',async()=>{
  for(const input of [null,[],1,true,'text',{}, {documentType:'quote',token:valid.token,sessionId:'short'}]){
    const f=fixture(),r=await f.post(f.request(JSON.stringify(input)));assert.equal(r.status,400);
    assert.deepEqual(await r.json(),{ok:false});assert.deepEqual(f.counts(),{rateChecks:1,records:0});
  }
});
test('actual streamed UTF-8 bytes are bounded even without Content-Length or with a misleading small header',async()=>{
  for(const headers of [{},{'content-length':'1'}]){
    let cancelled=false;const f=fixture();
    const stream=new ReadableStream({start(c){c.enqueue(Buffer.from('"'+'é'.repeat(2100)+'"'));},cancel(){cancelled=true;}});
    const r=await f.post(f.request(stream,headers));assert.equal(r.status,413);assert.equal(cancelled,true);
    assert.deepEqual(f.counts(),{rateChecks:0,records:0});
  }
});
test('malformed JSON, oversized declarations, foreign origins and unsupported media fail before mutation',async()=>{
  for(const [body,headers,status]of [['{',{},400],['{}',{'content-length':'4097'},413],['{}',{origin:'https://foreign.invalid'},403],['{}',{'content-type':'text/plain'},415]]){
    const f=fixture(),r=await f.post(f.request(body,headers));assert.equal(r.status,status);assert.match(r.headers.get('cache-control'),/no-store/);assert.equal(f.counts().records,0);
  }
});
test('valid requests retain the checked RPC result and rate-limit/unavailable refusals',async()=>{
  for(const rate of [{allowed:false,available:true,retryAfterSeconds:9},{allowed:false,available:false}]){
    const f=fixture({rate}),r=await f.post(f.request(JSON.stringify(valid)));assert.equal(r.status,rate.available?429:503);assert.equal(f.counts().records,0);
  }
  const f=fixture(),r=await f.post(f.request(JSON.stringify(valid)));assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true,recorded:true});assert.equal(f.counts().records,1);
});
