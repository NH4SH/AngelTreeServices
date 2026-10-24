import assert from 'node:assert/strict';
import test from 'node:test';
import {memoryDB} from './pr10-test-helpers.mjs';
import {settingsSaveActions} from './communication-settings-save-fixture.mjs';

export const recordId='a0b1c2d3-1111-4222-8333-444455556666',recordVersion='2026-10-23T12:00:00.000001+00:00';
export function automationForm(type='invoice',enabled=false,version=recordVersion,id=recordId){const f=new FormData();for(const[k,v]of Object.entries({record_type:type,record_id:id,enabled:enabled?'1':'0',expected_updated_at:version}))f.set(k,v);return f;}
function fixture(options={}){
 const db=memoryDB({user_roles:(options.roles??['owner']).map(name=>({user_id:'synthetic-staff',roles:{name}}))}),calls=[];
 db.auth={getUser:async()=>({data:{user:options.anonymous?null:{id:'synthetic-staff'}},error:null})};
 db.rpc=async(name,args)=>{if(name==='has_effective_platform_access')return{data:!options.disabled,error:null};assert.equal(name,'set_record_reminder_automation');calls.push(args);if(options.throws)throw Error('PRIVATE_SYNTHETIC');return{data:options.empty?null:options.ack??{record_type:args.p_record_type,record_id:args.p_record_id.toLowerCase(),enabled:args.p_enabled,updated_at:'2026-10-23T13:00:00+00:00',cancelled_count:2},error:options.error??null};};
 const f=settingsSaveActions(db,options);return{...f,calls,db,save:form=>f.actions.updateRecordAutomation({status:'idle',message:''},form)};
}
test('existing owner/admin/estimator/payroll permissions confirm quote and invoice changes through one native command',async()=>{
 for(const role of ['owner','admin','estimator','payroll_admin'])for(const type of ['quote','invoice'])for(const enabled of [true,false]){
  const f=fixture({roles:[role]}),r=await f.save(automationForm(type,enabled));assert.equal(r.status,'success');assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0],{p_record_type:type,p_record_id:recordId,p_enabled:enabled,p_expected_updated_at:recordVersion});assert.ok(f.revalidated.includes('/admin/'+type+'s/'+recordId));assert.ok(f.db.calls.every(x=>x.operation==='read'));
 }
});
test('nonstaff, disabled and signed-out identities cannot issue the command',async()=>{
 for(const options of [{roles:['crew']},{roles:['customer']},{roles:['property_manager']},{roles:[]},{disabled:true},{anonymous:true},{noClient:true}]){const f=fixture(options);assert.equal((await f.save(automationForm())).status,'error');assert.equal(f.calls.length,0);}
});
test('invalid record types, identifiers and missing or malformed boolean values fail before writes',async()=>{
 for(const[key,value]of [['record_type','job'],['record_type',''],['record_id','bad'],['record_id',''],['enabled',''],['enabled','true'],['enabled','2']]){const f=fixture(),form=automationForm();form.set(key,value);assert.equal((await f.save(form)).status,'error');assert.equal(f.calls.length,0);}
 const f=fixture(),form=automationForm();form.delete('enabled');assert.equal((await f.save(form)).status,'error');assert.equal(f.calls.length,0);
});
test('every toggle carries the version of the displayed record',async()=>{
 for(const value of ['', '2026-10-23','invalid','infinity','2026-99-99T12:00:00Z']){const f=fixture();assert.equal((await f.save(automationForm('quote',false,value))).status,'error');assert.equal(f.calls.length,0);}
});
test('native version conflicts require reload and do not claim a save',async()=>{
 const f=fixture({error:{code:'40001',message:'PRIVATE_SYNTHETIC'}}),r=await f.save(automationForm());assert.equal(r.status,'error');assert.match(r.message,/Reload/);assert.doesNotMatch(r.message,/PRIVATE_SYNTHETIC/);assert.equal(f.revalidated.length,0);
});
test('missing, unsuccessful, thrown and data-plus-error acknowledgements never claim success or expose diagnostics',async()=>{
 for(const options of [{empty:true},{error:{code:'42501',message:'PRIVATE_SYNTHETIC'}},{throws:true},{clientThrows:true},{error:{message:'PRIVATE_SYNTHETIC'},ack:{record_type:'invoice',record_id:recordId,enabled:false,updated_at:recordVersion,cancelled_count:0}}]){const f=fixture(options),r=await f.save(automationForm());assert.equal(r.status,'warning');assert.doesNotMatch(r.message,/PRIVATE_SYNTHETIC/);assert.equal(f.revalidated.length,0);}
});
test('malformed or wrong-record native acknowledgements cannot report a confirmed change',async()=>{
 const ack={record_type:'invoice',record_id:recordId,enabled:false,updated_at:recordVersion,cancelled_count:0};
 for(const patch of [{record_type:'quote'},{record_id:'other'},{enabled:true},{updated_at:'bad'},{updated_at:null},{cancelled_count:-1},{cancelled_count:1.5},{cancelled_count:'0'}]){const f=fixture({ack:{...ack,...patch}});assert.equal((await f.save(automationForm())).status,'warning');assert.equal(f.revalidated.length,0);}
});
test('native UUID normalization is accepted without losing record identity',async()=>{const f=fixture();assert.equal((await f.save(automationForm('quote',true,recordVersion,recordId.toUpperCase()))).status,'success');});
