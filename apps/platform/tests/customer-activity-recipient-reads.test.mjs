import assert from 'node:assert/strict';
import test from 'node:test';
import {load,memoryDB} from './pr10-test-helpers.mjs';
import {mapBounded} from '../src/lib/runtime/deadline.ts';
const reads=load('../src/lib/notifications/recipient-reads.ts',{'server-only':{}});
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
function fixture(options={}){
 const count=options.count??1250,profiles=Array.from({length:count},(_,i)=>({id:id(i+1),email:`local-${i}@example.invalid`,full_name:'Local',status:i>=count-20?'disabled':'active'}));
 const tables={roles:[{id:'owner',name:'owner'},{id:'admin',name:'admin'}],profiles,user_roles:[...profiles.map(p=>({user_id:p.id,role_id:'owner'})),...profiles.slice(0,205).map(p=>({user_id:p.id,role_id:'admin'}))],admin_notification_preferences:[{user_id:id(count-21),quote_email_enabled:false}],admin_notifications:[]};
 const batches=[],pages=[],sends=[],logs=[];let active=0,peak=0,inserted=0;
 const db=memoryDB(tables,{fail:options.fail}),from=db.from.bind(db);
 db.from=table=>{
  const q=from(table);q.limit(1000); // Model the existing Data API representation cap.
  const inFilter=q.in;q.in=(key,values)=>{batches.push({table,size:values.length});return inFilter(key,values);};
  const limit=q.limit;q.limit=n=>{pages.push({table,size:n});return limit(n);};
  if(table==='admin_notifications'){
   const insert=q.insert;q.insert=values=>{if(!Array.isArray(values))return insert(values);
    inserted++;if(options.insertError)return Promise.resolve({error:{message:'SECRET write diagnostic'},data:null});
    tables.admin_notifications.push(...values.map((v,i)=>({id:id(i+count+1),...v})));return Promise.resolve({data:null,error:null});
   };
  }
  return q;
 };
 const originalRead=reads.readCustomerActivityNotifications;
 const exports={...reads,readCustomerActivityNotifications:async(...args)=>{const rows=await originalRead(...args);return options.incomplete?rows.slice(1):options.duplicate?[...rows.slice(1),rows.at(-1)]:rows;}};
 const mod=load('../src/lib/notifications/customer-activity.ts',{
  'server-only':{},'@/lib/notifications/recipient-reads':exports,'@/lib/activity-log':{recordActivity:async()=>({created:!options.replay,id:'activity'})},
  '@/lib/runtime/deadline':{mapBounded},'@/lib/email/send':{sendTransactionalEmail:async input=>{sends.push(input);active++;peak=Math.max(peak,active);await new Promise(r=>setImmediate(r));active--;return{ok:true,outcome:'accepted',historyRecorded:true};}},
  '@/lib/security/app-base-url':{buildCanonicalAppUrl:()=>null},'@/lib/supabase/admin':{getServiceRoleClient:()=>db},'@/lib/notifications/definitions':{emailPreferenceFields:{quotes:'quote_email_enabled'}},
 });
 return{db,tables,batches,pages,sends,peak:()=>peak,inserted:()=>inserted,logs,run:async()=>{const old=console.error;console.error=(...x)=>{if(String(x[0]).startsWith("Customer activity"))logs.push(x);else old(...x);};try{await mod.emitCustomerActivity({category:options.category??'quotes',eventType:'local',idempotencyKey:'local',subjectId:id(999999),subjectType:'quote',title:'Local notice',summary:'Local summary',destinationPath:'/admin'});}finally{console.error=old;}}};
}
test('all membership pages and bounded profile batches preserve every eligible account once',async()=>{
 const f=fixture(),result=await reads.readCustomerActivityRecipients(f.db);
 assert.equal(result.length,1230);assert.equal(new Set(result.map(r=>r.id)).size,1230);assert.ok(result.some(r=>r.id===id(1230)));assert.ok(result.every(r=>f.tables.profiles.find(p=>p.id===r.id).status==='active'));
 assert.ok(f.batches.filter(b=>b.table==='profiles').every(b=>b.size<=100));assert.ok(f.pages.filter(p=>p.table==='user_roles').every(p=>p.size===200));
});
test('complete notice readback exceeds the representation cap while preserving opt-outs and three-way fan-out',async()=>{
 const f=fixture();await f.run();assert.deepEqual(f.logs,[]);assert.equal(f.inserted(),1);assert.equal(f.tables.admin_notifications.length,1230);assert.equal(f.sends.length,1229);assert.equal(f.peak(),3);
 assert.equal(new Set(f.sends.map(x=>x.to)).size,1229);assert.ok(f.sends.some(x=>x.to==='local-1229@example.invalid'));assert.ok(!f.sends.some(x=>x.to==='local-1228@example.invalid'));
 assert.ok(f.batches.filter(b=>b.table==='admin_notification_preferences').every(b=>b.size<=100));
 assert.equal(f.tables.admin_notifications.filter(n=>n.email_status==='skipped').length,1);assert.equal(f.tables.admin_notifications.filter(n=>n.email_status==='sent').length,1229);
 assert.ok(f.sends.every(x=>x.idempotencyKey.startsWith('admin-activity:')));
});
test('a late profile failure is not treated as an empty recipient set and sends nothing',async()=>{
 let n=0;const f=fixture({fail:({table,operation})=>table==='profiles'&&operation==='read'&&++n===4});await f.run();assert.equal(f.inserted(),0);assert.equal(f.sends.length,0);assert.equal(f.logs.length,1);assert.ok(!JSON.stringify(f.logs).includes('SECRET'));
});
test('a late membership failure aborts preparation without inserting or sending',async()=>{
 let n=0;const f=fixture({fail:({table,operation})=>table==='user_roles'&&operation==='read'&&++n===4});await f.run();assert.equal(f.inserted(),0);assert.equal(f.sends.length,0);assert.equal(f.logs.length,1);
});
test('late preferences or notice-page errors prevent all mail without deleting saved notices',async()=>{
 for(const table of ['admin_notification_preferences','admin_notifications']){
  let n=0;const f=fixture({fail:({table:t,operation})=>t===table&&operation==='read'&&++n===3});await f.run();assert.equal(f.inserted(),1);assert.equal(f.sends.length,0);assert.equal(f.tables.admin_notifications.length,1230);assert.equal(f.logs.length,1);
 }
});
test('empty, partial or duplicate acknowledgements never authorize a partial recipient send',async()=>{
 for(const opt of [{incomplete:true},{duplicate:true},{insertError:true}]){const f=fixture(opt);await f.run();assert.equal(f.sends.length,0);assert.equal(f.logs.length,1);}
});
test('activity replay does not create or resend notifications',async()=>{
 const f=fixture({replay:true});await f.run();assert.equal(f.db.calls.length,0);assert.equal(f.inserted(),0);assert.equal(f.sends.length,0);
});
test('a real empty role set remains valid and never creates notices',async()=>{
 const f=fixture();f.tables.roles.length=0;await f.run();assert.equal(f.logs.length,0);assert.equal(f.inserted(),0);assert.equal(f.sends.length,0);
});
test('missing role/preference data fails closed; empty preference records retain existing defaults',async()=>{
 for(const table of ['roles','admin_notification_preferences']){
  const f=fixture(),base=f.db.from;f.db.from=t=>t===table?{select(){return this;},in:async()=>({data:null,error:null})}:base(t);
  await f.run();assert.equal(f.logs.length,1);assert.equal(f.sends.length,0);
 }
 const f=fixture({category:'other'});await f.run();assert.equal(f.logs.length,0);assert.equal(f.sends.length,0);assert.equal(f.tables.admin_notifications.filter(n=>n.email_status==='skipped').length,1230);
});
