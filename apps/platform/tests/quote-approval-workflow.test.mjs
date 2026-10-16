import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {safeStaffMessage} from '../src/lib/security/errors.ts';
const require=createRequire(import.meta.url),ts=require('typescript');
const quote='00000000-0000-4000-8000-000000000001',job='00000000-0000-4000-8000-000000000002';
function fixture(response={data:{job_id:job,created_job:true,replayed:false,edit_revision:8,approved_at:'2026-10-16T12:00:00Z'},error:null}) {
 const calls=[],client={rpc:async(name,args)=>{calls.push({name,args});return response;},from:()=>{throw Error('Approval must not make separate table mutations');}};
 const deps={'server-only':{},'@/lib/security/errors':{safeStaffMessage}},module={exports:{}};
 const source=readFileSync(new URL('../src/lib/quotes/workflow.ts',import.meta.url),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports',js)(name=>{assert.ok(name in deps,name);return deps[name];},module,module.exports);
 return {client,calls,actions:module.exports};
}
for(const revision of [undefined,null,0,1.5])test(`approval requires the loaded revision: ${revision}`,async()=>{const f=fixture();assert.equal((await f.actions.approveQuoteAndEnsureWorkOrder(f.client,quote,revision)).ok,false);assert.equal(f.calls.length,0);});
test('staff workflow sends the page version to one command with no table writes',async()=>{const f=fixture(),r=await f.actions.approveQuoteAndEnsureWorkOrder(f.client,quote,7);assert.equal(r.ok,true);assert.equal(r.jobId,job);assert.deepEqual(f.calls,[{name:'approve_quote',args:{p_quote_id:quote,p_expected_revision:7}}]);});
test('portal workflow sends only token hash and displayed revision to its separate command',async()=>{const f=fixture();assert.equal((await f.actions.approveQuoteWithPortalToken(f.client,'a'.repeat(64),7)).ok,true);assert.deepEqual(f.calls,[{name:'approve_quote_by_portal',args:{p_token_hash:'a'.repeat(64),p_expected_revision:7}}]);});
test('a stale database response gives review guidance without an automatic fresh-version retry',async()=>{const f=fixture({data:null,error:{code:'40001',message:'This proposal changed. Refresh and review the saved proposal before approving.'}}),r=await f.actions.approveQuoteAndEnsureWorkOrder(f.client,quote,7);assert.equal(r.ok,false);assert.match(r.message,/Refresh and review/);assert.equal(f.calls.length,1);});
test('an ambiguous acknowledgment never claims approval failed or creates replacement work',async()=>{const f=fixture({data:{job_id:job},error:null}),r=await f.actions.approveQuoteAndEnsureWorkOrder(f.client,quote,7);assert.equal(r.ok,false);assert.match(r.message,/could not be confirmed/);assert.equal(f.calls.length,1);});
test('replay reports the existing job without performing any post-commit planning mutations',async()=>{const f=fixture({data:{job_id:job,created_job:false,replayed:true,edit_revision:8,approved_at:'2026-10-16T12:00:00Z'},error:null}),r=await f.actions.approveQuoteAndEnsureWorkOrder(f.client,quote,7);assert.deepEqual(r,{ok:true,jobId:job,createdJob:false,replayed:true});assert.equal(f.calls.length,1);});
