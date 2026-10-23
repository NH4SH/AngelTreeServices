import assert from 'node:assert/strict';
import test from 'node:test';
import {appointmentQueueFixture} from './appointment-queue-fixture.mjs';
const id=n=>'20000000-0000-4000-8000-'+String(n).padStart(12,'0');
const source=n=>({id:id(n),job_id:id(999999),event_type:'estimate',appointment_type:'estimate',status:'scheduled',starts_at:new Date(Date.now()+7*86400000).toISOString(),created_at:new Date().toISOString(),jobs:{id:id(999999),lead_disposition:'active',customers:{id:id(999998),email:'synthetic@example.invalid',status:'active'},organizations:null}});
const fixture=(table,n=401,extra={})=>appointmentQueueFixture({kind:table==='schedule_events'?'schedule_event':'appointment',tables:{schedule_events:[],appointments:[],[table]:Array.from({length:n},(_,i)=>source(i+1)),customer_communications:[]},...extra});
for(const table of ['schedule_events','appointments']){
 test(table+': complete 1001-source planning survives the API cap with bounded stable-key writes',async()=>{
  const f=fixture(table,1001);assert.equal((await f.run()).error,null);assert.equal(f.upserts.length,2002);
  const reads=f.calls.filter(c=>c.table===table);assert.equal(reads.length,7);assert.ok(reads.every(c=>c.cap===200&&c.sort.key==='id'));
  assert.ok(f.calls.filter(c=>c.operation==='upsert').every(c=>c.batchSize<=200));const saved=structuredClone(f.tables.customer_communications);await f.run();assert.deepEqual(f.tables.customer_communications,saved);
 });
 test(table+': short capped pages read through the final empty page',async()=>{const f=fixture(table,401,{sourceRowCaps:{[table]:7}});assert.equal((await f.run()).error,null);assert.equal(f.upserts.length,802);assert.equal(f.calls.filter(c=>c.table===table).length,59);});
 test(table+': later source failures withhold cleanup and all family writes',async()=>{
  for(const mode of ['error','throw','null','repeat','reverse','invalid']){const f=fixture(table,401,{sourceReadFault:{table,at:2,mode}});assert.ok((await f.run()).error);assert.equal(f.upserts.length,0);assert.equal(f.calls.some(c=>c.operation==='update'),false);}
 });
 test(table+': later source failures prevent worker claims and accepted follow-up acknowledgement',async()=>{
  const f=fixture(table,401,{sourceReadFault:{table,at:2,mode:'error'}});assert.equal((await f.worker()).claimed,0);assert.equal(f.calls.some(c=>c.rpc==='claim_due_customer_communications'),false);
  const g=fixture(table,401,{sourceReadFault:{table,at:2,mode:'null'}}),before=structuredClone(g.delivery);assert.equal((await g.followups()).sourceReconciled,false);assert.equal(g.acks,0);assert.deepEqual(g.delivery,before);
  g.clearSourceFaults();assert.equal((await g.followups()).sourceReconciled,true);assert.equal(g.acks,1);assert.equal(g.upserts.length,802);
 });
 test(table+': partial and lost write acknowledgement recovers without changing prior rows',async()=>{
  for(const mode of ['error','throw','lost']){const f=fixture(table,401,{sourceUpsertFault:{table,at:2,mode}}),r=await f.run();assert.ok(r.error);assert.equal(r.created,200);assert.equal(f.tables.customer_communications.length,mode==='lost'?400:200);const before=structuredClone(f.tables.customer_communications);f.clearSourceFaults();assert.equal((await f.run()).error,null);assert.equal(f.tables.customer_communications.length,802);for(const row of before)assert.deepEqual(f.tables.customer_communications.find(r=>r.id===row.id),row);}
 });
 test(table+': deleting an earlier source cannot hide the last visit',async()=>{const f=fixture(table,401,{onSourceRead({tables,table:readTable,read}){if(readTable===table&&read===1)tables[table].shift();}});assert.equal((await f.run()).error,null);assert.equal(f.upserts.length,802);});
 test(table+': source budget expiration remains visible before cleanup or writes',async()=>{const now=Date.now;let elapsed=0;Date.now=()=>now()+elapsed;try{const f=fixture(table,401,{onSourceRead({table:readTable,read}){if(readTable===table&&read===1)elapsed=6000;}});assert.ok((await f.run()).error);assert.equal(f.upserts.length,0);assert.equal(f.calls.some(c=>c.operation==='update'),false);}finally{Date.now=now;}});
 test(table+': concurrent passes and the OFF switch preserve duplicate protection',async()=>{const f=fixture(table);for(const r of await Promise.all([f.run(),f.run()]))assert.equal(r.error,null);assert.equal(f.tables.customer_communications.length,802);const off=fixture(table,401,{settings:{automated_sending_enabled:false}});assert.deepEqual(await off.run(),{created:0,error:null});assert.equal(off.calls.some(c=>c.table===table),false);});
}
test('the earliest work visit is selected across pages, with existing type, status and date filters',async()=>{
 const f=fixture('schedule_events',401);for(const v of f.tables.schedule_events)v.event_type='job';f.tables.schedule_events.at(-1).starts_at=new Date(Date.now()+86400000).toISOString();
 f.tables.schedule_events.push({...source(500),event_type:'blocked'},{...source(501),status:'cancelled'},{...source(502),starts_at:'2000-01-01T00:00:00Z'},{...source(503),starts_at:new Date(Date.now()+46*86400000).toISOString()});
 assert.equal((await f.run()).error,null);assert.equal(f.upserts.length,2);assert.ok(f.upserts.every(r=>r.schedule_event_id===id(401)&&r.communication_type.startsWith('work_')));
});
test('legacy appointment types and organization site contacts retain the existing selection',async()=>{const f=fixture('appointments',0);f.tables.appointments.push({...source(1),appointment_type:'emergency'}, {...source(2),jobs:{id:id(999999),customers:null,organizations:{id:id(999997),status:'active',billing_email:'billing@example.invalid'},onsite_contact:{email:'site@example.invalid',is_active:true}}});assert.equal((await f.run()).error,null);assert.equal(f.upserts.length,2);assert.ok(f.upserts.every(r=>r.appointment_id===id(2)&&r.recipient_email==='site@example.invalid'));});
test('coverage beyond 1000 records suppresses the tail visit and leaves independent families intact',async()=>{
 for(const kind of ['schedule_event','appointment']){const table=kind==='schedule_event'?'schedule_events':'appointments',coverage=Array.from({length:1001},(_,i)=>({source_kind:kind,source_id:id(i+1),suppress_reminder:true})),f=fixture(table,1001,{settings:{appointment_change_notices_enabled:true},coverage,coverageRowCap:73});assert.equal((await f.run()).error,null);assert.equal(f.upserts.length,0);assert.ok(f.calls.filter(c=>c.coverageRead).length>28);}
});
test('duplicate boundary groups cannot hide positive suppression even behind 1001 false rows',async()=>{
 const kind='appointment',table='appointments',coverage=[...Array.from({length:1001},()=>({source_kind:kind,source_id:id(1),suppress_reminder:false})),{source_kind:kind,source_id:id(1),suppress_reminder:true},{source_kind:kind,source_id:id(2),suppress_reminder:false}];
 const f=fixture(table,2,{settings:{appointment_change_notices_enabled:true},coverage,coverageRowCap:7});assert.equal((await f.run()).error,null);assert.equal(f.upserts.length,1);assert.equal(f.upserts[0].appointment_id,id(2));assert.equal(f.upserts[0].reminder_stage,'reminder');
});
test('null suppression still covers a previous confirmation and permits the ordinary reminder',async()=>{const f=fixture('appointments',1,{settings:{appointment_change_notices_enabled:true},coverage:[{source_kind:'appointment',source_id:id(1),suppress_reminder:null}]});assert.equal((await f.run()).error,null);assert.equal(f.upserts.length,1);assert.equal(f.upserts[0].reminder_stage,'reminder');});
test('incomplete or malformed coverage fails before cleanup, preparation or delivery claims',async()=>{
 for(const mode of ['error','throw','null','repeat','reverse','invalid']){const coverage=Array.from({length:401},(_,i)=>({source_kind:'schedule_event',source_id:id(i+1),suppress_reminder:true})),f=fixture('schedule_events',401,{settings:{appointment_change_notices_enabled:true},coverage,coverageReadFault:{at:2,mode}});const r=await f.worker();assert.equal(r.claimed,0);assert.equal(f.calls.some(c=>c.rpc==='claim_due_customer_communications'),false);assert.equal(f.upserts.length,0);assert.equal(f.calls.some(c=>c.operation==='update'),false);}
});
test('accepted delivery recovery remains pending after a coverage error and never resends',async()=>{const f=fixture('appointments',1,{settings:{appointment_change_notices_enabled:true},coverageReadFault:{at:1,mode:'error'}}),saved=structuredClone(f.delivery);assert.equal((await f.followups()).sourceReconciled,false);assert.equal(f.acks,0);assert.deepEqual(f.delivery,saved);f.clearSourceFaults();assert.equal((await f.followups()).sourceReconciled,true);assert.equal(f.acks,1);});

test('a later positive-suppression read cannot be treated as successful presence-only coverage',async()=>{
 const coverage=Array.from({length:201},(_,i)=>({source_kind:'schedule_event',source_id:id(i+1),suppress_reminder:true}));
 const f=fixture('schedule_events',201,{settings:{appointment_change_notices_enabled:true},coverage,coverageReadFault:{at:5,mode:'error'}});assert.equal((await f.worker()).claimed,0);assert.equal(f.upserts.length,0);assert.equal(f.calls.some(c=>c.operation==='update'),false);
});
test('coverage budget expiry stops before preparing any reminder family',async()=>{
 const now=Date.now;let elapsed=0;Date.now=()=>now()+elapsed;
 try{const f=fixture('schedule_events',1,{settings:{appointment_change_notices_enabled:true},onCoverageRead(){elapsed=6000;}});assert.ok((await f.run()).error);assert.equal(f.upserts.length,0);assert.equal(f.calls.some(c=>c.operation==='update'),false);}finally{Date.now=now;}
});
