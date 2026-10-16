import assert from 'node:assert/strict';
import test from 'node:test';
import * as crypto from 'node:crypto';
import {load} from './pr10-test-helpers.mjs';
const bytes=Buffer.from('synthetic file');
function moduleWith({scanner=null,scan=async()=>({status:'clean',sha256:crypto.createHash('sha256').update(bytes).digest('hex')})}={}) {
 return load('../src/lib/security/attachment-scan-service.ts',{'server-only':{},'node:crypto':crypto,'./document-scan-service':{getDocumentScanClient:()=>scanner},'./document-scanner':{scanDocumentBytes:scan}});
}
const upload={bytes,contentType:'application/pdf'};
test('unknown/failed scan configuration cannot silently upload',async()=>{
 for(const response of [{data:null,error:{message:'unavailable'}},{data:null,error:null}]){
  const c={rpc:async()=>response,storage:{from(){assert.fail('must not upload')}}};assert.ok((await moduleWith().uploadCheckedAttachment(c,'equipment-files','path',upload,'actor')).error);
 }
});
test('disabled rollout preserves upload options without claiming a scan',async()=>{
 let captured;const c={rpc:async()=>({data:false,error:null}),storage:{from:bucket=>({upload:async(path,body,options)=>{captured={bucket,path,body,options};return{error:null}}})}};
 const result=await moduleWith().uploadCheckedAttachment(c,'job-photos','path',upload,'actor',{cacheControl:'3600'});assert.equal(result.scanStatus,'unscanned');assert.deepEqual(captured.options,{contentType:'application/pdf',upsert:false,cacheControl:'3600'});assert.equal(captured.body,bytes);
});
test('missing scanner retains uploaded bytes for metadata and explicit retry',async()=>{
 let uploads=0;const c={rpc:async()=>({data:true,error:null}),storage:{from:()=>({upload:async()=>{uploads++;return{error:null}}})}};
 const result=await moduleWith().uploadCheckedAttachment(c,'equipment-files','path',upload,'actor');assert.equal(uploads,1);assert.equal(result.error,null);assert.equal(result.scanStatus,'unavailable');
});
test('storage errors stop the scan and preserve the original failure',async()=>{
 const error={message:'storage failed'};const c={rpc:async()=>({data:true,error:null}),storage:{from:()=>({upload:async()=>({error})})}};assert.equal((await moduleWith().uploadCheckedAttachment(c,'equipment-files','path',upload,'actor')).error,error);
});
test('a changed claim path can never make the service fetch another object',async()=>{
 const c={rpc:async()=>({data:{token:'token',path:'other'},error:null}),storage:{from(){assert.fail('must not fetch')}}};assert.equal(await moduleWith().checkStoredAttachment(c,'equipment-files','path','actor'),'unavailable');
});
test('stored bytes must match the prepared digest and the finish acknowledgement',async()=>{
 let finish;const c={rpc:async(name,args)=>name==='claim_attachment_scan'?{data:{token:'token',path:'path',size:bytes.length},error:null}:(finish=args,{data:true,error:null}),storage:{from:()=>({download:async()=>({data:new Blob([bytes]),error:null})})}};
 assert.equal(await moduleWith({scanner:c}).checkStoredAttachment(c,'equipment-files','path','actor','0'.repeat(64)),'unavailable');assert.equal(finish.p_verdict,'unavailable');assert.equal(finish.p_sha256,null);
 const bad={...c,rpc:async(name,args)=>name==='finish_attachment_scan'?{data:false,error:null}:c.rpc(name,args)};
 assert.equal(await moduleWith({scanner:bad}).checkStoredAttachment(bad,'equipment-files','path','actor'),'unavailable');
});
