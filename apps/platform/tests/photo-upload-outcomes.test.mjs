import assert from 'node:assert/strict';
import test from 'node:test';
import {load} from './pr10-test-helpers.mjs';
const job='00000000-0000-4000-8000-000000000001';
test('uncertain metadata acknowledgements preserve the private blob; definite SQL rollback cleans up only that new blob',async()=>{
 for(const failure of ['throw',{code:'',message:'Transport error'},{code:'23514',message:'Required audit failed'}]){
  const removed=[];let uploaded;
  const db={from:table=>table==='jobs'?{select(){return this},eq(){return this},single:async()=>({data:{id:job},error:null})}:{insert:async()=>{if(failure==='throw')throw Error('Transport');return{error:failure};}},storage:{from:()=>({upload:async path=>{uploaded=path;return{error:null}},remove:async paths=>{removed.push(...paths);return{error:null}}})}};
  const mod=load('../src/lib/storage/job-photo-upload.ts',{'server-only':{},'next/cache':{revalidatePath(){}},'@/lib/storage/job-photo-paths':{JOB_PHOTO_BUCKET:'job-photos',buildJobPhotoPath:()=>job+'/completion/new-local.png'},'@/lib/security/upload-validation':{prepareSafeUpload:async()=>({data:{bytes:new Uint8Array([1]),contentType:'image/png'}})}});
  const r=await mod.uploadJobPhotoForUser({caption:'Local',category:'completion',file:new File(['local'],'local.png',{type:'image/png'}),jobId:job,userId:'local',supabase:db});assert.equal(r.status,'error');if(failure?.code==='23514')assert.deepEqual(removed,[uploaded]);else{assert.deepEqual(removed,[]);assert.match(r.message,/before uploading again/);assert.equal(r.jobId,job);}
 }
});
