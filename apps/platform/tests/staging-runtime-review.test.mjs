import assert from 'node:assert/strict';import test from 'node:test';
import {reviewEnvironmentSources,reviewAuthConfiguration} from '../scripts/release/review-staging-runtime.mjs';
import {stagingFixture} from './staging-fixture.mjs';
function fixture(){const f=stagingFixture();return {...f,vars:Object.entries(f.env).filter(([k])=>k!=='SITE_ID').map(([key,value])=>({key,scopes:['builds','functions','runtime'],values:[{context:'all',value}]}))};}
test('complete synthetic scope projection is never promoted to observed runtime or hosting readiness',()=>{
 const f=fixture(),r=reviewEnvironmentSources(f.manifest,f.vars,[]);assert.equal(r.configurationComplete,true);assert.equal(r.cases.length,12);assert.equal(r.readyForHosting,false);assert.equal(r.runtimeObserved,false);assert.equal(r.networkRequests,0);
});
test('a build-only safe URL does not shadow a shared production URL in Functions',()=>{
 const f=fixture();f.vars.find(x=>x.key==='NEXT_PUBLIC_SUPABASE_URL').scopes=['builds'];
 const r=reviewEnvironmentSources(f.manifest,f.vars,[{key:'NEXT_PUBLIC_SUPABASE_URL',scopes:['functions'],values:[{context:'all',value:'https://ddvlnixdugcbnrewktes.supabase.co'}]}]);
 assert.equal(r.cases.find(x=>x.scope==='builds').configurationPasses,true);assert.equal(r.cases.find(x=>x.scope==='functions').configurationPasses,false);
});
test('inherited mail credentials fail separately in Functions and never appear in output',()=>{
 const f=fixture(),canary='synthetic-secret-never-in-report',r=reviewEnvironmentSources(f.manifest,f.vars,[{key:'RESEND_API_KEY',scopes:['functions'],values:[{context:'all',value:canary}]}]);
 assert.equal(r.cases.find(x=>x.scope==='builds').configurationPasses,true);assert.equal(r.cases.find(x=>x.scope==='functions').configurationPasses,false);assert.ok(!JSON.stringify(r).includes(canary));
});
test('context overrides, scoped site precedence and masked values are resolved conservatively',()=>{
 const f=fixture();const v=f.vars.find(x=>x.key==='APP_ENV');v.values.push({context:'deploy-preview',value:'production'});
 let r=reviewEnvironmentSources(f.manifest,f.vars,[]);assert.equal(r.cases.find(x=>x.context==='production').configurationPasses,true);assert.equal(r.cases.find(x=>x.context==='deploy-preview').configurationPasses,false);
 v.values=v.values.slice(0,1);f.vars.find(x=>x.key==='SUPABASE_SERVICE_ROLE_KEY').values=[{context:'all'}];r=reviewEnvironmentSources(f.manifest,f.vars,[]);assert.ok(r.cases.every(x=>x.unknownKeys.includes('SUPABASE_SERVICE_ROLE_KEY')&&!x.configurationPasses));
});
test('named branch overrides, unknown scopes and incomplete/ambiguous metadata cannot establish completeness',()=>{
 for(const mutate of [v=>v[0].values.push({context:'branch',context_parameter:'future',value:'x'}),v=>v[0].scopes.push('unknown')]){const f=fixture();mutate(f.vars);const r=reviewEnvironmentSources(f.manifest,f.vars,[]);assert.equal(r.configurationComplete,false);assert.ok(r.findings.length);}
 assert.throws(()=>reviewEnvironmentSources({},[],null));const f=fixture();f.vars[0].values.push(f.vars[0].values[0]);assert.throws(()=>reviewEnvironmentSources(f.manifest,f.vars,[]));
});
const auth=()=>({data:{attributes:{auth:{site_url:'https://stage.example.invalid',uri_allow_list:'https://stage.example.invalid/update-password',disable_signup:true,external_email_enabled:true,external_anonymous_users_enabled:false,hook_send_email_enabled:false,smtp_host:null,...Object.fromEntries(['confirmation','email_change','invite','magic_link','reauthentication','recovery'].map(t=>['mailer_templates_'+t+'_content','{{ .ConfirmationURL }}']))}}}});
test('correct redirects and default templates do not prove email isolation when built-in mail remains',()=>{
 const r=reviewAuthConfiguration(auth(),'https://stage.example.invalid','abcdefghijklmnopqrst');assert.equal(r.redirectAllowlistMatches,true);assert.equal(r.templateSetComplete,true);assert.equal(r.smtpConfigured,false);assert.equal(r.emailHookEnabled,false);assert.equal(r.authMailIsolationVerified,false);
});
test('production links and configured mail routes are reported without emitting templates or secret values',()=>{
 const f=auth();f.data.attributes.auth.mailer_templates_recovery_content='<a href="https://admin.angeltreeservices.org/reset?token=synthetic-private-token">reset</a>';f.data.attributes.auth.smtp_pass='synthetic-password';
 const r=reviewAuthConfiguration(f,'https://stage.example.invalid','abcdefghijklmnopqrst');assert.equal(r.templates.find(t=>t.name==='recovery').productionTarget,true);assert.equal(r.smtpConfigured,true);assert.equal(r.authMailIsolationVerified,false);assert.ok(!JSON.stringify(r).includes('synthetic-private-token'));assert.ok(!JSON.stringify(r).includes('synthetic-password'));
});
test('omitted effective configuration or missing email templates remains unverified',()=>{
 assert.throws(()=>reviewAuthConfiguration({},'https://stage.example.invalid','abcdefghijklmnopqrst'));const f=auth();delete f.data.attributes.auth.mailer_templates_recovery_content;assert.equal(reviewAuthConfiguration(f,'https://stage.example.invalid','abcdefghijklmnopqrst').templateSetComplete,false);
});
