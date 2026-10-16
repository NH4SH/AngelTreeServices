import assert from 'node:assert/strict';import test from 'node:test';import {randomUUID} from 'node:crypto';
import * as records from '../src/lib/record-search.ts';
import {createRecordSearchSession,parseRecordSearchResults} from '../src/lib/record-search-session.ts';
import * as views from '../src/lib/handoff-views.ts';
import {withDeadline} from '../src/lib/runtime/deadline.ts';
import {nextActionHref} from '../src/lib/next-actions.ts';
import {load} from './pr10-test-helpers.mjs';
const tick=()=>new Promise(resolve=>setTimeout(resolve,8));
const record=(extra={})=>({id:randomUUID(),recordType:'customer',title:'Local household',detail:'5550101000',href:'/do-not-trust',...extra});
test('phone punctuation is normalized while mixed names, streets and document numbers remain intact',()=>{
 for(const [input,expected] of [['(540) 555-0123','5405550123'],['+1 540.555.0123','15405550123'],['Q-2026-000123','q-2026-000123'],['123 Oak St 22401','123 oak st 22401'],['  Noel   Sierra ','noel sierra'],['name5405@example.invalid','name5405@example.invalid']])assert.equal(records.normalizeAdminSearchTerm(input),expected);
 assert.equal(records.commandSearchTerm('a'.repeat(100)).length,80);assert.equal(records.escapeSearchLike('50%_\\'), '50\\%\\_\\\\');
});
test('record result links derive only from valid IDs and supported types, never returned href text',()=>{
 const r=record();const parsed=parseRecordSearchResults([r]);assert.equal(parsed[0].href,`/admin/customers/${r.id}`);
 for(const value of [[record({id:'../settings'})],[record({recordType:'payroll'})],Array.from({length:21},()=>record()),[record({title:null})]])assert.throws(()=>parseRecordSearchResults(value));
});
test('rapid input changes debounce and clear previous private results immediately',async()=>{
 const states=[],calls=[];const session=createRecordSearchSession(s=>states.push(s),async q=>{calls.push(q);return[record()];},1);
 session.update('Old');session.update('New');await tick();assert.deepEqual(calls,['new']);assert.equal(states.at(-1).status,'ready');
 session.update('x');assert.deepEqual(states.at(-1),{query:'x',status:'idle',results:[]});session.close();
});
test('a late response cannot replace newer results even when transport ignores abort',async()=>{
 const states=[],pending=new Map();const session=createRecordSearchSession(s=>states.push(s),q=>new Promise(resolve=>pending.set(q,resolve)),1);
 session.update('first');await tick();session.update('second');await tick();const newest=record({title:'Second'});pending.get('second')([newest]);await tick();pending.get('first')([record({title:'First'})]);await tick();assert.equal(states.at(-1).results[0].title,'Second');session.close();
});
test('closing or disabling a palette cancels pending work and prevents stale results or errors',async()=>{
 const states=[];let finish;const session=createRecordSearchSession(s=>states.push(s),()=>new Promise(resolve=>finish=resolve),1);session.update('query');await tick();session.close();const before=states.length;finish([record()]);await tick();assert.equal(states.length,before);
 const next=createRecordSearchSession(s=>states.push(s),async()=>assert.fail('Disabled search made no request'),1);next.update('query',false);assert.equal(states.at(-1).status,'idle');await tick();next.close();
});
test('failed or malformed searches clear results and expose a recoverable error state',async()=>{for(const response of [()=>Promise.reject(Error('Private backend diagnostic')),async()=>({results:'bad'})]){const states=[],session=createRecordSearchSession(s=>states.push(s),response,1);session.update('query');await tick();assert.equal(states.at(-1).status,'error');assert.deepEqual(states.at(-1).results,[]);session.close();}});
test('saved follow-up views allow only known filters and never an external destination',()=>{
 const f=views.handoffFilters({assigned:'me',kind:'scheduling',due:'snoozed',page:Infinity});assert.equal(f.page,10000);assert.equal(views.handoffViewHref(f),'/admin/follow-ups?assigned=me&kind=scheduling&due=snoozed');
 for(const v of [null,'not json','{"version":2}','{"version":1,"filters":{"assigned":"https://bad.invalid","kind":"wrong"}}'])assert.ok(views.savedHandoffView(v)===null||views.savedHandoffView(v)==='/admin/follow-ups');
 assert.equal(views.savedHandoffView(JSON.stringify({version:1,filters:{assigned:'me'}})),'/admin/follow-ups?assigned=me');
});
test('scheduling handoffs open the actual job scheduling section while ordinary tasks retain their record link',()=>{const id=randomUUID();assert.equal(nextActionHref({task_type:'schedule_approved_work',job_id:id,quote_id:randomUUID()}),`/admin/jobs/${id}#job-schedule`);assert.match(nextActionHref({quote_id:id}),/^\/admin\/quotes\//);});
function routeFor(db,roles=['owner'],search=async()=>[]) {return load('../src/app/api/admin/record-search/route.ts',{'@/lib/supabase/server':{createClient:async()=>db},'@/lib/auth/roles':{getUserRoles:async()=>roles,hasAllowedRole:(r,allowed)=>r.some(x=>allowed.includes(x)),platformRoleGroups:{internalStaff:['owner','admin','estimator','payroll_admin']}},'@/lib/data/command-search':{searchCommandRecords:search}});}
test('record search HTTP responses are private and unauthorized requests never reach record data',async()=>{let reads=0;for(const [user,roles,status] of [[null,[],401],[{id:'crew'},['crew'],403],[{id:'retired'},[],403]]){const r=await routeFor({auth:{getUser:async()=>({data:{user}})}},roles,async()=>{reads++;}).GET(new Request('http://localhost/api/admin/record-search?q=person'));assert.equal(r.status,status);assert.match(r.headers.get('cache-control'),/private.*no-store/);assert.deepEqual((await r.json()).results,[]);}assert.equal(reads,0);});
test('record search bounds input and never returns transport diagnostics after failure',async()=>{const db={auth:{getUser:async()=>({data:{user:{id:'owner'}}})}};const route=routeFor(db,['owner'],async()=>{throw Error('private-query-and-secret');});assert.equal((await route.GET(new Request('http://localhost?q='+'a'.repeat(81)))).status,400);const r=await route.GET(new Request('http://localhost?q=person'));assert.equal(r.status,503);assert.equal((await r.text()).includes('private-query'),false);});
test('command search requests only safe display fields and fails closed rather than returning partial types',async()=>{
 const calls=[];const db={from(table){calls.push(table);const q={select(fields){assert.equal(/total_cents|balance_due|search_text/.test(fields),false);return q;},eq(){return q;},is(){return q;},ilike(){return q;},order(){return q;},limit(n){assert.equal(n,4);return q;},abortSignal(){return q;},then(resolve){return Promise.resolve({data:[],error:table==='admin_record_search'?{message:'private'}:null}).then(resolve);}};return q;}};
 const code=load('../src/lib/data/command-search.ts',{'server-only':{},'@/lib/record-search':records,'@/lib/runtime/deadline':{withDeadline}});await assert.rejects(code.searchCommandRecords(db,'test'));assert.equal(calls.length,5);
});
