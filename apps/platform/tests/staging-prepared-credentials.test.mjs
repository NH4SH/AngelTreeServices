import assert from 'node:assert/strict';
import test from 'node:test';
import {preparedCredentialTarget as target,reviewPreparedCredentialMetadata as review} from '../scripts/release/review-staging-runtime.mjs';
function fixture(){
  const all=['builds','functions','runtime','post_processing'];
  const values={APP_ENV:'staging',STAGING_MODE:'core-no-providers',APP_BASE_URL:target.origin,NEXT_PUBLIC_SUPABASE_URL:`https://${target.projectRef}.supabase.co`};
  return [...Object.entries(values).map(([key,value])=>({key,is_secret:false,scopes:[...all],values:[{context:'all',value}]})),
    {key:'NEXT_PUBLIC_SUPABASE_ANON_KEY',is_secret:false,scopes:[...all],values:[{context:'production',value:'sb_publishable_synthetic_not_a_real_key'}]},
    ...['SUPABASE_SERVICE_ROLE_KEY','PORTAL_TOKEN_ENCRYPTION_KEY','STAGING_GATE_KEY','STAGING_GATE_VERIFIER'].map(key=>({key,is_secret:true,scopes:['builds','functions','runtime'],values:[{context:'production',value:'masked-private-canary'}]}))];
}
test('masked installation metadata never proves runtime keys, protection or hosting readiness',()=>{
 const r=review(target,fixture(),[]);assert.equal(r.metadataInstalled,true);assert.equal(r.privateVariableCount,4);
 for(const key of ['secretValuesVerified','keyBindingVerified','runtimeObserved','visitorProtectionVerified','readyForHosting','changesApplied'])assert.equal(r[key],false);
 assert.ok(!JSON.stringify(r).includes('masked-private-canary'));
});
test('wrong site, origin or project fails despite otherwise valid installation metadata',()=>{
 for(const [key,value]of Object.entries({siteId:'6fe7a9ca-878e-4b7b-bb4a-966efdc4d1a0',projectRef:'ddvlnixdugcbnrewktes',origin:'https://admin.angeltreeservices.org'}))assert.equal(review({...target,[key]:value},fixture(),[]).metadataInstalled,false);
});
test('secret flags, scopes and every context must match; readable or dev secrets fail',()=>{
 for(const change of [v=>v.is_secret=false,v=>v.scopes.push('post_processing'),v=>v.scopes=['builds'],v=>v.values[0].context='all',v=>v.values.push({context:'dev',value:'private-dev-canary'}),v=>v.values[0].context_parameter='other']){
  const f=fixture();change(f.find(v=>v.key==='SUPABASE_SERVICE_ROLE_KEY'));const r=review(target,f,[]);assert.equal(r.metadataInstalled,false);assert.ok(!JSON.stringify(r).includes('private-dev-canary'));
 }
});
test('provider, duplicate, missing and inherited variables cannot pass this preparation profile',()=>{
 for(const change of [f=>f.push({key:'RESEND_API_KEY'}),f=>f.push(f[0]),f=>f.pop()]){const f=fixture();change(f);assert.equal(review(target,f,[]).metadataInstalled,false);}
 assert.equal(review(target,fixture(),[{key:'RESEND_API_KEY',values:[{value:'provider-private-canary'}]}]).metadataInstalled,false);
 assert.throws(()=>review(target,fixture(),null));assert.throws(()=>review(target,null,[]));
});
test('incorrect public binding, privileged browser keys and preview overrides are rejected',()=>{
 for(const change of [f=>f[0].values[0].value='production',f=>f.find(v=>v.key==='NEXT_PUBLIC_SUPABASE_URL').values[0].value='https://ddvlnixdugcbnrewktes.supabase.co',f=>f.find(v=>v.key==='NEXT_PUBLIC_SUPABASE_ANON_KEY').values[0].value='sb_secret_never_public',f=>f.find(v=>v.key==='NEXT_PUBLIC_SUPABASE_ANON_KEY').values.push({context:'deploy-preview',value:'sb_publishable_other'})]){
  const f=fixture();change(f);assert.equal(review(target,f,[]).metadataInstalled,false);
 }
});
