import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {load} from './pr10-test-helpers.mjs';
const {runFirewoodOfficeCommand}=load('../src/lib/firewood/office-command.ts',{'server-only':{},'../business-time.ts':{},'./handoff/office-accounting.mjs':{}});
const order=randomUUID(),user=randomUUID();
function input(){const f=new FormData();for(const[k,v]of Object.entries({intent:'retry_preparation',order_id:order,request_id:randomUUID(),expected_revision:'1',reason:'Reviewed customer details.'}))f.set(k,v);return f;}
function harness(change={}){
 const calls=[],record={order:{order_id:order,invoice_id:null},preparation:{status:'review',can_retry:true,tries:1},...change};
 const client={rpc(name,args){calls.push({name,args});return{async abortSignal(){return{data:name==='inspect_firewood_live_office'?record:{order_id:order,revision:2,status:'pending'},error:null};}};}};
 return{calls,deps:{client,userId:user,roles:['owner'],admitted:true}};
}
test('retry sends only saved identity, expected tries, reason and stable request ID',async()=>{
 const h=harness(),form=input();assert.equal((await runFirewoodOfficeCommand(form,h.deps)).status,'success');
 assert.deepEqual(h.calls[1],{name:'retry_firewood_live_preparation',args:{p_order:order,p_expected_revision:1,p_reason:'Reviewed customer details.',p_request_id:form.get('request_id')}});
});
test('pending, issued, stale, disabled and non-admin states cannot retry; injected financial fields are rejected',async()=>{
 for(const change of [{preparation:{status:'pending',can_retry:false,tries:1}},{order:{order_id:order,invoice_id:randomUUID()}},{preparation:{status:'review',can_retry:true,tries:2}}]){
  const h=harness(change);assert.equal((await runFirewoodOfficeCommand(input(),h.deps)).status,'error');assert.equal(h.calls.length,1);
 }
 for(const deps of [{roles:['crew']},{admitted:false},{userId:null}]){const h=harness();assert.equal((await runFirewoodOfficeCommand(input(),{...h.deps,...deps})).status,'error');assert.equal(h.calls.length,0);}
 const h=harness(),form=input();form.set('send_email','true');assert.equal((await runFirewoodOfficeCommand(form,h.deps)).status,'error');assert.equal(h.calls.length,0);
});
