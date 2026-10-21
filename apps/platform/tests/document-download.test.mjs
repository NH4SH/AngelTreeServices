import assert from 'node:assert/strict';
import test from 'node:test';
import * as crypto from 'node:crypto';
import {load} from './pr10-test-helpers.mjs';
const source='platform_document',id='00000000-0000-4000-8000-000000000018';
const headers={'cache-control':'private, no-store','vary':'Cookie, Authorization'};
const descriptor={bucket_id:'platform-documents',storage_path:'actor/synthetic.txt',label:'Synthetic',object_id:id,object_version:'version1',size_bytes:3,mime_type:'text/plain',etag:null};
function fixture({actor=true,rows=[descriptor],after=rows}={}){let reads=0;const mod=load('../src/lib/files/private-file-response.ts',{'server-only':{},'node:crypto':crypto,'./request-auth':{fileResponseHeaders:headers,getFileRequestContext:async()=>actor?{token:'synthetic-test-token',supabase:{rpc:async()=>({data:reads++?after:rows,error:null})}}:null},'@/lib/supabase/config':{getSupabasePublicConfig:()=>({url:'http://127.0.0.1:54321',anonKey:'test-public-key'})}});return{run:(request)=>mod.privateFileResponse(request,source,id)};}
const req=(query='',extra={})=>new Request('http://127.0.0.1/files/'+source+'/'+id+query,{headers:extra});
test('manifest has no Storage path, JWT or signed URL; plain links stay inside CRM',async()=>{const f=fixture();const r=await f.run(req('?info=1'));assert.equal(r.status,200);const info=await r.json();assert.equal(info.name,'synthetic.txt');assert.equal(info.size,3);assert.doesNotMatch(JSON.stringify(info),/actor\/|token|signedUrl/);const open=await f.run(req());assert.equal(open.status,303);assert.equal(open.headers.get('location'),'/files/open/'+source+'/'+id);assert.match(open.headers.get('cache-control'),/no-store/);});
test('unauthenticated and inaccessible descriptors return no location',async()=>{for(const options of [{actor:false},{rows:[]}]){const response=await fixture(options).run(req());assert.equal(response.status,404);assert.equal(response.headers.get('location'),null);}});
test('chunk reads require exact object version and bounded explicit ranges',async()=>{for(const range of ['bytes=0-1048576','bytes=0-9','bytes=-1-2','bytes=0-','bytes=0-1,2-3'])assert.equal((await fixture().run(req('',{range}))).status,416);assert.equal((await fixture().run(req('',{range:'bytes=0-2','if-match':'wrong'}))).status,412);});
test('fresh authenticated bounded bytes are no-store and version checked after reading',async()=>{const original=globalThis.fetch;try{let calls=0;globalThis.fetch=async(url,init)=>{calls++;assert.match(String(url),/object\/authenticated/);assert.match(String(url),/cacheNonce=/);assert.equal(init.headers.Authorization,'Bearer synthetic-test-token');assert.equal(init.cache,'no-store');assert.equal(init.headers.Range,'bytes=0-2');return new Response('abc',{status:206,headers:{'content-range':'bytes 0-2/3'}});};const f=fixture(),info=await(await f.run(req('?info=1'))).json();const r=await f.run(req('',{range:'bytes=0-2','if-match':info.version}));assert.equal(r.status,206);assert.equal(await r.text(),'abc');assert.match(r.headers.get('cache-control'),/no-store/);assert.equal(calls,1);
 const changed=fixture({after:[{...descriptor,object_version:'replaced'}]});assert.equal((await changed.run(req('',{range:'bytes=0-2','if-match':info.version}))).status,404);
 const revoked=fixture({after:[]});assert.equal((await revoked.run(req('',{range:'bytes=0-2','if-match':info.version}))).status,404);
}finally{globalThis.fetch=original;}});
test('ignored ranges and oversized or truncated upstream chunks fail closed',async()=>{const original=globalThis.fetch;try{const info=await(await fixture().run(req('?info=1'))).json();for(const [status,body] of [[200,'abc'],[206,'abcd'],[206,'ab']]){globalThis.fetch=async()=>new Response(body,{status,headers:{'content-range':'bytes 0-2/3'}});assert.equal((await fixture().run(req('',{range:'bytes=0-2','if-match':info.version}))).status,404);}}finally{globalThis.fetch=original;}});
test('application version preconditions survive intermediaries without dropping object or access rechecks',async()=>{
 const original=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=async()=>{calls++;return new Response('abc',{status:206,headers:{'content-range':'bytes 0-2/3'}});};
  const info=await(await fixture().run(req('?info=1'))).json();
  const request=()=>req('',{range:'bytes=0-2','x-ats-file-version':info.version});
  const r=await fixture().run(request());assert.equal(r.status,206);assert.equal(r.headers.get('x-ats-file-version'),info.version);assert.equal(await r.text(),'abc');
  for(const extra of [{},{'x-ats-file-version':'stale'},{'x-ats-file-version':info.version,'if-match':'different'}])assert.equal((await fixture().run(req('',{range:'bytes=0-2',...extra}))).status,412);
  const before=calls;assert.equal((await fixture({actor:false}).run(request())).status,404);assert.equal((await fixture({rows:[]}).run(request())).status,404);assert.equal(calls,before);
  assert.equal((await fixture({after:[]}).run(request())).status,404);
  assert.equal((await fixture({after:[{...descriptor,object_version:'replacement'}]}).run(request())).status,404);
 }finally{globalThis.fetch=original;}
});
test('browser chunks use the application version and reject missing or changed response versions even if ETag matches',async()=>{
 const original=globalThis.fetch,mod=load('../src/lib/files/private-file-client.ts');
 try{
  let version='"version-one"',calls=0;
  globalThis.fetch=async(url,init)=>{
   if(String(url).endsWith('?info=1'))return Response.json({name:'test.txt',label:'Test',size:3,mimeType:'text/plain',version:'"version-one"',chunkBytes:1048576});
   calls++;assert.equal(init.headers['x-ats-file-version'],'"version-one"');assert.equal(init.headers['if-match'],undefined);assert.equal(init.cache,'no-store');
   return new Response('abc',{status:206,headers:{'content-range':'bytes 0-2/3',...(version?{'x-ats-file-version':version}:{}),etag:'"version-one"'}});
  };
  assert.equal(await(await mod.loadPrivateFile('/files/'+source+'/'+id,new AbortController().signal)).blob.text(),'abc');
  for(const changed of ['', '"changed"']){version=changed;await assert.rejects(mod.loadPrivateFile('/files/'+source+'/'+id,new AbortController().signal),/file changed or access/);}
  assert.equal(calls,3);
 }finally{globalThis.fetch=original;}
});
