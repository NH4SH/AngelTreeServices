import assert from 'node:assert/strict';
import test from 'node:test';
import {memoryDB} from './pr10-test-helpers.mjs';
import {settingsSaveActions} from './communication-settings-save-fixture.mjs';
const id='a0b1c2d3-1111-4222-8333-444455556666',version='2026-10-23T12:00:00.000001+00:00';
export function cancellationForm(row={id,updated_at:version}){const f=new FormData();f.set('communication_id',row.id);f.set('expected_updated_at',row.updated_at);return f;}
function fixture(options={}){
 const row={id,updated_at:version,status:'pending',communication_type:'invoice_payment_reminder',is_automatic:false,scheduled_for:'2026-10-25T12:00:00Z',attempt_count:0,provider_message_id:null,...options.row};
 const untouched={...row,id:'b0b1c2d3-1111-4222-8333-444455556666'},tables={customer_communications:options.missing?[]:[row,untouched],user_roles:(options.roles??['owner']).map(name=>({user_id:'synthetic-cancellation-staff',roles:{name}}))};
 const db=memoryDB(tables,{fail:({table,operation})=>table==='customer_communications'&&operation==='update'?(options.writeError?'error':options.writeThrows?'throw':null):null});
 db.auth={getUser:async()=>({data:{user:options.anonymous?null:{id:'synthetic-cancellation-staff'}},error:null})};
 db.rpc=async name=>{assert.equal(name,'has_effective_platform_access');return{data:!options.disabled,error:null};};
 const from=db.from.bind(db);db.from=name=>{const q=from(name);if(name!=='customer_communications')return q;
  const update=q.update.bind(q),single=q.maybeSingle.bind(q);let writing=false;
  q.update=values=>{writing=true;return update({...values,updated_at:'2026-10-23T12:01:00.000002+00:00'});};
  q.maybeSingle=async()=>{const r=await single();if(writing&&r.data){if(options.lostAcknowledgement)return{data:null,error:{message:'PRIVATE_SYNTHETIC_ACK'}};if(options.badAck)return{data:options.badAck,error:null};if(options.dataAndError)return{data:r.data,error:{message:'PRIVATE_SYNTHETIC_ACK'}};}return r;};return q;
 };
 const f=settingsSaveActions(db,options);return{...f,row,untouched,db,tables,cancel:form=>f.actions.cancelScheduledCommunication({status:'idle',message:''},form??cancellationForm())};
}
test('existing staff can cancel exactly the reviewed pending reminder with a confirmed acknowledgement',async()=>{
 for(const role of ['owner','admin','estimator','payroll_admin']){const f=fixture({roles:[role]}),other=structuredClone(f.untouched),before=structuredClone(f.row),r=await f.cancel();assert.equal(r.status,'success');assert.equal(f.row.status,'cancelled');assert.ok(f.row.cancelled_at);assert.equal(f.row.skip_reason,'Cancelled by staff.');assert.deepEqual(f.untouched,other);assert.deepEqual({...f.row,status:before.status,updated_at:before.updated_at,cancelled_at:undefined,skip_reason:undefined},{...before,cancelled_at:undefined,skip_reason:undefined});assert.deepEqual(f.revalidated,['/admin','/admin/communications']);}
});
test('nonstaff, disabled and signed-out callers cannot issue a cancellation write',async()=>{
 for(const options of [{roles:['crew']},{roles:['customer']},{roles:['property_manager']},{roles:[]},{disabled:true},{anonymous:true},{noClient:true}]){const f=fixture(options);assert.equal((await f.cancel()).status,'error');assert.equal(f.db.calls.filter(x=>x.operation==='update').length,0);assert.equal(f.revalidated.length,0);}
});
test('invalid or missing reminder IDs and displayed versions fail before writing',async()=>{
 for(const[key,value]of [['communication_id',''],['communication_id','invalid'],['expected_updated_at',''],['expected_updated_at','2026-10-23'],['expected_updated_at','infinity'],['expected_updated_at','2026-99-99T00:00:00Z']]){const f=fixture(),form=cancellationForm();form.set(key,value);assert.equal((await f.cancel(form)).status,'error');assert.equal(f.db.calls.filter(x=>x.operation==='update').length,0);}
});
test('a stale page cannot cancel a reminder after it has been rescheduled or edited',async()=>{
 const f=fixture({row:{updated_at:'2026-10-23T12:00:00.000002+00:00',scheduled_for:'2026-10-28T12:00:00Z'}}),before=structuredClone(f.row),r=await f.cancel();assert.equal(r.status,'error');assert.match(r.message,/Reload/);assert.deepEqual(f.row,before);assert.equal(f.revalidated.length,0);
});
test('processing and every nonpending delivery state remain untouched',async()=>{
 for(const status of ['processing','sent','failed','skipped','cancelled']){const f=fixture({row:{status,attempt_count:3,provider_message_id:'synthetic-accepted'}}),before=structuredClone(f.row);assert.equal((await f.cancel()).status,'error');assert.deepEqual(f.row,before);}
});
test('an absent or invisible reminder cannot report successful cancellation',async()=>{const f=fixture({missing:true});assert.equal((await f.cancel()).status,'error');assert.equal(f.revalidated.length,0);});
test('database errors, thrown failures and unavailable clients remain reviewable without diagnostics',async()=>{
 for(const options of [{writeError:true},{writeThrows:true},{clientThrows:true}]){const f=fixture(options),before=structuredClone(f.row),r=await f.cancel();assert.equal(r.status,'warning');assert.match(r.message,/Reload and review/);assert.doesNotMatch(r.message,/PRIVATE|Untrusted/);assert.deepEqual(f.row,before);assert.equal(f.revalidated.length,0);}
});
test('a committed cancellation with a lost acknowledgement cannot run again from the old page',async()=>{
 const f=fixture({lostAcknowledgement:true});assert.equal((await f.cancel()).status,'warning');assert.equal(f.row.status,'cancelled');const before=structuredClone(f.row);assert.equal((await f.cancel()).status,'error');assert.deepEqual(f.row,before);assert.equal(f.revalidated.length,0);
});
test('a malformed, wrong-row or data-plus-error response never claims a confirmed cancellation',async()=>{
 const ack={id,status:'cancelled',updated_at:version,cancelled_at:'2026-10-23T12:00:00Z'};
 for(const patch of [{id:'other'},{status:'pending'},{updated_at:'bad'},{updated_at:null},{cancelled_at:null},{cancelled_at:'bad'}]){const f=fixture({badAck:{...ack,...patch}});assert.equal((await f.cancel()).status,'warning');assert.equal(f.revalidated.length,0);}
 const f=fixture({dataAndError:true});assert.equal((await f.cancel()).status,'warning');assert.equal(f.revalidated.length,0);
});
test('explicit cancellation preserves manual reminders, automatic reminders and chosen pending receipt controls',async()=>{
 for(const communication_type of ['quote_follow_up','invoice_payment_reminder','overdue_invoice_reminder','payment_confirmation','estimate_reminder','work_reminder'])for(const is_automatic of [true,false]){const f=fixture({row:{communication_type,is_automatic}});assert.equal((await f.cancel()).status,'success');assert.equal(f.row.communication_type,communication_type);assert.equal(f.row.is_automatic,is_automatic);}
});
