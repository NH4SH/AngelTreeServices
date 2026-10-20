import assert from 'node:assert/strict';
import test from 'node:test';
import {load,memoryDB} from './pr10-test-helpers.mjs';
const reads=load('../src/lib/notifications/recipient-reads.ts',{'server-only':{}});
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
function fixture(options={}){
 const count=options.count??1250,profiles=Array.from({length:count},(_,i)=>({id:id(i+1),email:`local-${i}@example.invalid`,full_name:'Local',status:i>=count-20?'disabled':'active'}));
 const tables={roles:[{id:'owner',name:'owner'},{id:'admin',name:'admin'}],profiles,user_roles:[...profiles.map(p=>({user_id:p.id,role_id:'owner'})),...profiles.slice(0,205).map(p=>({user_id:p.id,role_id:'admin'}))],admin_notification_preferences:[{user_id:id(count-21),quote_email_enabled:false}],admin_notifications:[]};
 const batches=[],pages=[];
 const db=memoryDB(tables,{fail:options.fail}),from=db.from.bind(db);
 db.from=table=>{
  const q=from(table);q.limit(1000); // Model the existing Data API representation cap.
  const inFilter=q.in;q.in=(key,values)=>{batches.push({table,size:values.length});return inFilter(key,values);};
  const limit=q.limit;q.limit=n=>{pages.push({table,size:n});return limit(n);};
  return q;
 };
 return {db,tables,batches,pages};
}
test('all membership pages and bounded profile batches preserve every eligible account once',async()=>{
 const f=fixture(),result=await reads.readCustomerActivityRecipients(f.db);
 assert.equal(result.length,1230);assert.equal(new Set(result.map(r=>r.id)).size,1230);assert.ok(result.some(r=>r.id===id(1230)));assert.ok(result.every(r=>f.tables.profiles.find(p=>p.id===r.id).status==='active'));
 assert.ok(f.batches.filter(b=>b.table==='profiles').every(b=>b.size<=100));assert.ok(f.pages.filter(p=>p.table==='user_roles').every(p=>p.size===200));
});
test('bounded preference and notification reads retain late rows beyond the API cap',async()=>{
 const f=fixture();const prefs=await reads.readCustomerActivityPreferences(f.db,f.tables.profiles.map(p=>p.id));assert.equal(prefs.get(id(1229)).quote_email_enabled,false);
 f.tables.admin_notifications=Array.from({length:1250},(_,i)=>({id:id(i+2000),activity_id:'local',recipient_user_id:id(i+1)}));
 const result=await reads.readCustomerActivityNotifications(f.db,'local');assert.equal(result.length,1250);assert.equal(new Set(result.map(r=>r.id)).size,1250);
 assert.ok(f.batches.filter(b=>b.table==='admin_notification_preferences').every(b=>b.size<=100));
});
test('late directory, preference and notice errors fail closed instead of returning a partial set',async()=>{
 for(const table of ['user_roles','profiles','admin_notification_preferences','admin_notifications']){
  let count=0;const f=fixture({fail:({table:t,operation})=>t===table&&operation==='read'&&++count===3});
  f.tables.admin_notifications=Array.from({length:1250},(_,i)=>({id:id(i+2000),activity_id:'local'}));
  const run=table==='admin_notification_preferences'?()=>reads.readCustomerActivityPreferences(f.db,f.tables.profiles.map(p=>p.id)):table==='admin_notifications'?()=>reads.readCustomerActivityNotifications(f.db,'local'):()=>reads.readCustomerActivityRecipients(f.db);
  await assert.rejects(run());
 }
});
