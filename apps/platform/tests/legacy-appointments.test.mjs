import assert from 'node:assert/strict';
import test from 'node:test';
import {load} from './pr10-test-helpers.mjs';
import {withDeadline} from '../src/lib/runtime/deadline.ts';
import {saveLegacyAppointment} from '../src/lib/schedule/legacy-appointment.ts';
import * as eventForm from '../src/lib/schedule/event-form.ts';
const id='11111111-1111-4111-8111-111111111111',jobId='22222222-2222-4222-8222-222222222222';
const input={id,jobId,revision:1,mode:'details',values:{starts_at:'2035-03-01T13:00:00Z',ends_at:null,calendar_notes:'A retained draft',assigned_id:null}};
function client(reply,events=[]){return{rpc(name,args){events.push({name,args});const q={abortSignal(signal){assert.equal(signal.aborted,false);return q;},then(resolve,reject){return Promise.resolve(reply).then(resolve,reject);}};return q;}};}
test('one versioned command saves the displayed appointment and requires a complete acknowledgement',async()=>{
 const events=[],r=await saveLegacyAppointment(client({data:{id,revision:2,replayed:false,warning_count:0},error:null},events),input);
 assert.equal(r.status,'success');assert.equal(r.appointmentId,id);assert.equal(r.revision,2);assert.equal(events.length,1);assert.equal(events[0].name,'save_legacy_appointment');
 assert.equal(events[0].args.p_expected_revision,1);assert.equal(events[0].args.p_appointment_id,id);assert.deepEqual(events[0].args.p_values,input.values);
});
test('missing or malformed response never claims success or refreshes an editor version',async()=>{
 for(const data of [null,{}, {id,revision:0,replayed:false,warning_count:0},{id,revision:2,replayed:'false',warning_count:0},{id:jobId,revision:2,replayed:false,warning_count:0},{id,revision:2,replayed:false,warning_count:-1}]) {
  const r=await saveLegacyAppointment(client({data,error:null}),input);assert.equal(r.status,'error');assert.equal(r.revision,undefined);assert.match(r.message,/Review the calendar/);
 }
});
test('replayed creation and committed qualification warnings remain acknowledged saves',async()=>{
 const replay=await saveLegacyAppointment(client({data:{id,revision:1,replayed:true,warning_count:0},error:null}),{...input,mode:'create',revision:null});assert.equal(replay.status,'success');assert.match(replay.message,/already saved/);
 const warning=await saveLegacyAppointment(client({data:{id,revision:2,replayed:false,warning_count:1},error:null}),input);assert.equal(warning.status,'warning');assert.equal(warning.appointmentId,id);
});
test('stale and revoked requests show safe next steps without adopting a version',async()=>{
 for(const code of ['40001','42501']){const r=await saveLegacyAppointment(client({data:null,error:{code,message:'PRIVATE_DIAGNOSTIC'}}),input);assert.equal(r.status,'error');assert.equal(r.revision,undefined);assert.doesNotMatch(r.message,/PRIVATE/);}
 const r=await saveLegacyAppointment({rpc(){throw Error('PRIVATE_TRANSPORT');}},input);assert.equal(r.status,'error');assert.match(r.message,/could not be confirmed/);assert.doesNotMatch(r.message,/PRIVATE/);
});
test('invalid identity or absent displayed revision stops before database work',async()=>{
 let calls=0;const db={rpc(){calls++;throw Error('unexpected');}};
 for(const changes of [{id:'bad'},{jobId:''},{revision:null},{revision:0},{revision:NaN}])assert.equal((await saveLegacyAppointment(db,{...input,...changes})).status,'error');assert.equal(calls,0);
});
function actionFixture({signedIn=true,reply={status:'success',message:'Saved',appointmentId:id,revision:2},syncFails=false}={}){
 const calls=[],paths=[];
 const deps={
  'next/cache':{revalidatePath:p=>paths.push(p)},'@/lib/activity-log':{},'@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:signedIn?{id}:null}})}})},
  '@/lib/supabase/admin':{getServiceRoleClient:()=>({})},'@/lib/auth/roles':{},'@/lib/data/employees':{},
  '@/lib/communications/queue':{syncAutomatedCommunications:async()=>{calls.push('sync');if(syncFails)throw Error('PRIVATE_DIAGNOSTIC');}},
  '@/lib/security/errors':{},'@/lib/schedule/event-form':eventForm,
  '@/lib/schedule/legacy-appointment':{saveLegacyAppointment:async(_,args)=>{calls.push(args);return reply;}},
 };
 const actions=load('../src/app/admin/schedule/actions.ts',deps);
 const form=new FormData();for(const [key,value] of Object.entries({appointment_id:id,job_id:jobId,expected_revision:'1',starts_at:'2035-03-01T08:00',ends_at:'2035-03-01T09:00',calendar_notes:'Keep this scope',assigned_user_id:'',next_status:'cancelled',appointment_type:'estimate',request_id:id}))form.set(key,value);
 return{actions,form,calls,paths};
}
const initial={status:'idle',message:''};
test('all three web actions delegate their current values to one atomic command and sync only after acknowledgement',async()=>{
 for(const [name,mode] of [['createAppointment','create'],['updateAppointmentDetails','details'],['updateAppointmentStatus','status']]) {
  const f=actionFixture();const r=await f.actions[name](initial,f.form);assert.equal(r.appointmentId,id);assert.equal(f.calls[0].mode,mode);assert.equal(f.calls[0].id,id);assert.equal(f.calls[1],'sync');assert.ok(f.paths.includes('/admin/schedule'));
  if(mode!=='create')assert.equal(f.calls[0].revision,1);if(mode==='status')assert.deepEqual(f.calls[0].values,{status:'cancelled'});
 }
});
test('no authenticated actor, invalid date, or stale save can create reminders or revalidate as a success',async()=>{
 const signedOut=actionFixture({signedIn:false});assert.equal((await signedOut.actions.createAppointment(initial,signedOut.form)).status,'error');assert.equal(signedOut.calls.length,0);
 const invalid=actionFixture();invalid.form.set('ends_at','not-a-date');assert.equal((await invalid.actions.updateAppointmentDetails(initial,invalid.form)).status,'error');assert.equal(invalid.calls.length,0);
 const stale=actionFixture({reply:{status:'error',message:'Refresh'}});assert.equal((await stale.actions.updateAppointmentDetails(initial,stale.form)).status,'error');assert.equal(stale.calls.length,1);assert.equal(stale.paths.length,0);
});
test('post-commit reminder preparation failure keeps the saved identity and version with a clear warning',async()=>{
 const f=actionFixture({syncFails:true}),r=await f.actions.updateAppointmentDetails(initial,f.form);assert.equal(r.status,'warning');assert.equal(r.appointmentId,id);assert.equal(r.revision,2);assert.match(r.message,/Appointment saved/);assert.doesNotMatch(r.message,/PRIVATE/);
});
