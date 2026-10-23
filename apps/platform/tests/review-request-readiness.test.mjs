import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync}from'node:fs';
import * as jsx from 'react/jsx-runtime';
import * as drafts from '../src/lib/documents/marketing-drafts.ts';
import {load,elements,text}from'./customer-invoice-fixture.mjs';
const baseline=JSON.parse(readFileSync(new URL('./review-request-legacy.json',import.meta.url)));
test('a configured review request retains the independently captured original email and text wording',()=>{
 const job=structuredClone(baseline.job);assert.deepEqual(drafts.generateCompletedJobReviewRequest(job,baseline.reviewUrl),baseline.draft);assert.deepEqual(job,baseline.job);
});
test('missing and malformed review links cannot create a placeholder or unfinished customer body',()=>{
 for(const value of [null,'','  ','[Add Google review link]','not a url','https://','https:google.com/review','http://g.page/r/example/review','javascript:alert(1)','data:text/plain,review','//g.page/r/example/review','https://user:secret@g.page/review','https://g.page/r/line\nbreak/review','https://g.page/r/space in path','https://g.page/'+ 'x'.repeat(2048)]){
  const result=drafts.generateCompletedJobReviewRequest(baseline.job,value);assert.equal(result.reviewUrl,null);assert.equal(result.email.body,'');assert.equal(result.textMessageBody,'');assert.doesNotMatch(JSON.stringify(result),/Add Google review link|user:secret/);
 }
});
test('valid configured Google URLs and existing company redirects remain supported without network checks',()=>{
 for(const value of [baseline.reviewUrl,'https://search.google.com/local/writereview?placeid=SYNTHETIC','https://maps.app.goo.gl/SYNTHETIC','https://angeltreeservices.org/review?source=completed-job']){
  assert.equal(drafts.normalizeReviewUrl('  '+value+'  '),value);const result=drafts.generateCompletedJobReviewRequest(baseline.job,value);assert.equal(result.reviewUrl,value);assert.ok(result.email.body.includes(value));assert.ok(result.textMessageBody.includes(value));
 }
 for(const value of [undefined,123,{},[]])assert.equal(drafts.normalizeReviewUrl(value),null);
});
test('environment reads return only validated public destinations and never echo credential-bearing input',()=>{
 const old=process.env.NEXT_PUBLIC_GOOGLE_REVIEW_URL;
 try{for(const value of ['', 'javascript:synthetic','https://user:secret@g.page/review']){process.env.NEXT_PUBLIC_GOOGLE_REVIEW_URL=value;assert.equal(drafts.getGoogleReviewUrl(),null);}process.env.NEXT_PUBLIC_GOOGLE_REVIEW_URL=' '+baseline.reviewUrl+' ';assert.equal(drafts.getGoogleReviewUrl(),baseline.reviewUrl);}
 finally{if(old===undefined)delete process.env.NEXT_PUBLIC_GOOGLE_REVIEW_URL;else process.env.NEXT_PUBLIC_GOOGLE_REVIEW_URL=old;}
});
function workspace(job,googleReviewUrl){
 const component=load('../src/components/completed-job-marketing-workspace.tsx',{
  'react/jsx-runtime':jsx,
  react:{useMemo:f=>f(),useState:x=>[x,()=>{}]},'lucide-react':{Camera:()=>null,CheckCircle2:()=>null,Megaphone:()=>null,ShieldCheck:()=>null},
  '@/components/copy-draft-card':{CopyDraftCard:()=>null},'@/components/email-draft-card':{EmailDraftCard:()=>null},'@/lib/documents/marketing-drafts':drafts,
 }).CompletedJobMarketingWorkspace;
 return component({job,googleReviewUrl,photos:[]});
}
test('the actual workspace withholds review copy controls while retaining unrelated post drafts and photo planning',()=>{
 for(const value of [null,'javascript:synthetic','[Add Google review link]']){
  const view=workspace(baseline.job,value),regions=elements(view).filter(x=>x.props?.['aria-label']==='Customer review request');assert.equal(regions.length,1);const region=regions[0];
  assert.match(text(region),/Review link needed/);assert.equal(elements(region).filter(x=>x.props?.label).length,0);assert.doesNotMatch(text(view),/NEXT_PUBLIC_GOOGLE_REVIEW_URL|Add Google review link/);
  assert.equal(elements(view).filter(x=>x.props?.label&&/post draft|gallery caption draft/i.test(x.props.label)).length,3);assert.equal(elements(view).filter(x=>x.type==='textarea').length,1);
 }
});
test('the actual configured workspace preserves both request drafts and resets copy feedback across link or customer changes',()=>{
 const get=view=>elements(view).filter(x=>x.props?.label&&/Review request/.test(x.props.label));
 const a=get(workspace(baseline.job,baseline.reviewUrl));assert.equal(a.length,2);assert.deepEqual(a[0].props.draft,baseline.draft.email);assert.equal(a[1].props.body,baseline.draft.textMessageBody);
 assert.notEqual(a[0].key,a[1].key);
 const b=get(workspace({...baseline.job,id:'00000000-0000-4000-8000-000000000120'},baseline.reviewUrl));const c=get(workspace(baseline.job,baseline.reviewUrl+'?source=test'));
 for(let i=0;i<2;i++){assert.notEqual(a[i].key,b[i].key);assert.notEqual(a[i].key,c[i].key);}
});
test('organization recipients and arbitrary Unicode names remain intact without mutating the source record',()=>{
 const job={...baseline.job,organizations:{name:'Synthetic Árbol 🌳 業務 <script>text</script>'}},before=structuredClone(job),draft=drafts.generateCompletedJobReviewRequest(job,baseline.reviewUrl);assert.ok(draft.email.body.startsWith('Hi '+job.organizations.name+','));assert.deepEqual(job,before);
});
