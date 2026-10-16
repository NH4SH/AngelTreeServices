import assert from 'node:assert/strict';
import test from 'node:test';
import {load} from './pr10-test-helpers.mjs';
const id='00000000-0000-4000-8000-000000000018';
async function route({configured=true,staff=true,row={storage_path:'actor/file.txt'},signError=null,queryError=null}={}){
 const calls=[];const q={eq(){return q},is(){return q},async maybeSingle(){return{data:row,error:queryError}}};
 const context = {
  configured, roles: staff ? ['owner'] : ['crew'],
  supabase: {
   from(table) { assert.equal(table, 'documents'); return { select: () => q }; },
   storage: { from(bucket) {
    assert.equal(bucket, 'platform-documents');
    return { async createSignedUrl(path, ttl) {
     calls.push({path, ttl});
     return {data:{signedUrl:'http://127.0.0.1/local-synthetic-download'}, error:signError};
    }};
   }},
  },
 };
 const mod=load('../src/app/admin/documents/[documentId]/download/route.ts',{'@/lib/auth/pageContext':{getAuthenticatedPlatformContext:async()=>context},'@/lib/auth/roles':{hasAllowedRole:()=>staff,platformRoleGroups:{internalStaff:[]}}});
 return{response:await mod.GET(new Request('http://127.0.0.1'),{params:Promise.resolve({documentId:id})}),calls};
}
test('document download freshly signs for 60 seconds without caching the redirect',async()=>{const{response,calls}=await route();assert.equal(response.status,303);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.deepEqual(calls,[{path:'actor/file.txt',ttl:60}]);});
test('unconfigured, non-staff and inaccessible document reads never sign',async()=>{for(const opts of [{configured:false},{staff:false},{row:null},{queryError:{message:'private diagnostic'}}]){const{response,calls}=await route(opts);assert.equal(response.status,404);assert.equal(calls.length,0);assert.doesNotMatch(await response.text(),/private diagnostic/);}});
test('Storage quarantine/permission denial never returns a download location',async()=>{const{response}=await route({signError:{message:'RLS denied'}});assert.equal(response.status,404);assert.equal(response.headers.get('location'),null);});
