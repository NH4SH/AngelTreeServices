import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './pr10-test-helpers.mjs';

function action({user={id:'actor'},visible={data:{can_retry:true,enabled:true},error:null},verdict='clean',scanner=true}={}) {
 const calls=[];const query={select(){return this;},eq(k,v){calls.push([k,v]);return this;},limit(){return this;},async maybeSingle(){return visible;}};
 const client={auth:{getUser:async()=>({data:{user}})},from(name){assert.equal(name,'attachment_file_checks');return query;}};
 const module=load('../src/app/files/actions.ts',{'next/cache':{revalidatePath:p=>calls.push(['revalidate',p])},'@/lib/supabase/server':{createClient:async()=>client},'@/lib/security/attachment-scan-service':{attachmentBuckets:['employee-files'],checkStoredAttachment:async(...args)=>{calls.push(['scan',...args.slice(1)]);return verdict;}},'@/lib/security/document-scan-service':{getDocumentScanClient:()=>scanner?{}:null}});
 const form=new FormData();form.set('bucket','employee-files');form.set('path','employee/synthetic.png');
 return{run:()=>module.retryAttachmentCheck({},form),calls,form};
}
test('file retry requires both authentication and visible metadata',async()=>{
 for(const options of [{user:null},{visible:{data:null,error:null}},{visible:{data:null,error:{message:'private diagnostics'}}}]){const a=action(options),r=await a.run();assert.equal(r.status,'error');assert.ok(!r.message.includes('private diagnostics'));assert.ok(!a.calls.some(c=>c[0]==='scan'));}
});
test('file retry cannot bypass rollout state or uploader/admin eligibility',async()=>{
 for(const data of [{can_retry:true,enabled:false},{can_retry:false,enabled:true}]){const a=action({visible:{data,error:null}});assert.equal((await a.run()).status,'error');assert.ok(!a.calls.some(c=>c[0]==='scan'));}
});
test('file retry rejects an arbitrary bucket and missing path before querying',async()=>{
 const a=action();a.form.set('bucket','unrelated');assert.equal((await a.run()).status,'error');assert.equal(a.calls.length,0);a.form.set('bucket','employee-files');a.form.set('path','');assert.equal((await a.run()).status,'error');assert.equal(a.calls.length,0);
});
test('file retry records success only after an acknowledged clean result',async()=>{
 const a=action();assert.equal((await a.run()).status,'success');assert.deepEqual(a.calls.find(c=>c[0]==='scan'),['scan','employee-files','employee/synthetic.png','actor']);assert.ok(a.calls.some(c=>c[0]==='revalidate'));
});
test('unavailable/quarantined results and missing scanner remain held with recovery guidance',async()=>{
 for(const options of [{verdict:'unavailable'},{verdict:'quarantined'},{scanner:false}]){const a=action(options),r=await a.run();assert.equal(r.status,'error');assert.match(r.message,/held|replacement/);}
});
