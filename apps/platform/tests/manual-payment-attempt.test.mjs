import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
const uuid='00000000-0000-4000-8000-000000000001',payment='00000000-0000-4000-8000-000000000002';
function fixture({role='owner',user=true,configured=true,rpcError=null,rpcData={payment_id:payment,payment_status:'succeeded',replayed:false}}={}){
 const calls=[],paths=[];let followups=0;
 const client={auth:{getUser:async()=>({data:{user:user?{id:uuid}:null}})},rpc:async(name,args)=>{calls.push({name,args});return {data:rpcData,error:rpcError};}};
 const deps={
  'next/cache':{revalidatePath:path=>paths.push(path)},
  '@/lib/auth/roles':{getUserRoles:async()=>[role],hasAllowedRole:(roles,allowed)=>roles.some(r=>allowed.includes(r)),platformRoleGroups:{accessApproval:['owner','admin']}},
  '@/lib/supabase/server':{createClient:async()=>configured?client:null},
  '@/lib/security/errors':{safeStaffMessage:(_message,fallback)=>fallback??'Request could not finish.'},
  '@/lib/payments/reconciliation':{syncReconciledPaymentCommunications:async()=>{followups++;return false;},reconcileInvoiceBalance:async()=>{throw Error('A second financial transaction must not gate record success');}},
 };
 const source=readFileSync(new URL('../src/lib/actions/payments.ts',import.meta.url),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};new Function('require','module','exports',js)(name=>{assert.ok(name in deps,name);return deps[name];},module,module.exports);
 return {action:module.exports,calls,paths,followups:()=>followups};
}
function form(changes={}){const data=new FormData();for(const [key,value]of Object.entries({request_id:uuid,invoice_id:uuid,amount:'100.00',payment_date:'2026-10-15',payment_method:'cash',reference:' Check 42 ',notes:' note ',...changes}))data.set(key,value);return data;}
const initial={status:'idle',message:''};
for(const config of [{configured:false},{user:false},{role:'crew'},{role:'estimator'},{role:'payroll_admin'}])test(`manual action denies before RPC: ${JSON.stringify(config)}`,async()=>{const f=fixture(config);assert.equal((await f.action.recordManualPayment(initial,form())).status,'error');assert.equal(f.calls.length,0);assert.equal(f.followups(),0);});
for(const amount of ['1garbage','1.001','NaN','21474836.48'])test(`manual input rejects invalid or overflowing cents: ${amount}`,async()=>{const f=fixture();assert.equal((await f.action.recordManualPayment(initial,form({amount}))).status,'error');assert.equal(f.calls.length,0);});
test('record uses the supplied request identity and returns the committed payment despite follow-up failure',async()=>{
 const f=fixture();const result=await f.action.recordManualPayment(initial,form());assert.equal(result.status,'success');assert.equal(result.paymentId,payment);assert.equal(f.calls.length,1);assert.equal(f.calls[0].name,'record_manual_invoice_payment_request');
 assert.deepEqual(f.calls[0].args,{p_request_id:uuid,p_invoice_id:uuid,p_amount_cents:10000,p_paid_at:'2026-10-15T12:00:00.000Z',p_method:'cash',p_reference:'Check 42',p_notes:'note'});assert.equal(f.followups(),1);
});
test('an unconfirmed RPC never claims a payment was not recorded or releases its identity',async()=>{
 const f=fixture({rpcError:{code:'FETCH_ERROR',message:'Lost response'},rpcData:null});const result=await f.action.recordManualPayment(initial,form());assert.equal(result.status,'error');assert.equal(result.paymentId,undefined);assert.notEqual(result.released,true);assert.match(result.message,/could not be confirmed/);assert.equal(f.followups(),0);
});
test('replay reports the original payment and does not resurrect a later correction',async()=>{
 const f=fixture({rpcData:{payment_id:payment,payment_status:'cancelled',replayed:true}});const result=await f.action.recordManualPayment(initial,form());assert.equal(result.paymentId,payment);assert.match(result.message,/later corrected/);
});
test('resolve releases edited details only after the database closes an unrecorded identity',async()=>{
 const f=fixture({rpcData:{state:'abandoned',payment_id:null}});const result=await f.action.resolveManualPaymentAttempt(initial,form());assert.equal(result.released,true);assert.equal(result.paymentId,undefined);assert.equal(f.calls[0].name,'resolve_manual_invoice_payment_request');
});
test('resolve discovers recorded money instead of clearing the original attempt',async()=>{
 const f=fixture({rpcData:{state:'recorded',payment_id:payment,payment_status:'succeeded'}});const result=await f.action.resolveManualPaymentAttempt(initial,form());assert.equal(result.paymentId,payment);assert.notEqual(result.released,true);
});
test('failed resolution retains the original attempt and live owner/admin gate',async()=>{
 const f=fixture({rpcError:{code:'FETCH_ERROR'},rpcData:null});assert.notEqual((await f.action.resolveManualPaymentAttempt(initial,form())).released,true);
 const denied=fixture({role:'crew'});assert.equal((await denied.action.resolveManualPaymentAttempt(initial,form())).status,'error');assert.equal(denied.calls.length,0);
});
for(const data of [{state:'unexpected'},{state:'recorded',payment_id:null}])test(`invalid resolution retains the frozen attempt: ${JSON.stringify(data)}`,async()=>{const f=fixture({rpcData:data});const result=await f.action.resolveManualPaymentAttempt(initial,form());assert.equal(result.status,'error');assert.notEqual(result.released,true);});
