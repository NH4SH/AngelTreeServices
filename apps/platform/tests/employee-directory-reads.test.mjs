import assert from 'node:assert/strict';
import test from 'node:test';
import * as crypto from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {load} from './pr10-test-helpers.mjs';

const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const employee=(n,extra={})=>({id:id(10000+n),auth_user_id:id(n),legal_name:'Synthetic '+n,is_active:true,archived_at:null,employment_status:'active',employee_onboarding_items:[],employee_credentials:[],training_attendees:[],...extra});
function fixture(rows,{failTable,failBatch=1}={}){
  const calls=[],batches=new Map();let inflight=0,maxInflight=0;
  const client=createClient('http://127.0.0.1:54321','synthetic-public-key',{
    auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input)=>{
      const url=new URL(input instanceof Request?input.url:input);assert.equal(url.origin,'http://127.0.0.1:54321');
      const table=url.pathname.split('/').at(-1);
      if(table==='get_employee_operational_directory')return Response.json({employees:rows});
      if(table==='employee_access_requests')return Response.json([{id:'pending',email:'pending@example.invalid',status:'pending'}]);
      const value=url.searchParams.get(table==='profiles'?'id':'user_id');assert.match(value,/^in\.\(.+\)$/);
      const ids=value.slice(4,-1).split(',');assert.ok(ids.length<=100,'A full directory must never become one URI filter');
      assert.ok(url.href.length<5000,'Encoded request must fit comfortably under the observed gateway limit');
      const index=batches.get(table)??0;batches.set(table,index+1);calls.push({table,ids,index,length:url.href.length});
      inflight++;maxInflight=Math.max(maxInflight,inflight);await new Promise(resolve=>setImmediate(resolve));inflight--;
      if(table===failTable&&index===failBatch)return Response.json({message:'Fixture lookup unavailable',code:'XX001'},{status:400});
      return Response.json(ids.map(user=>table==='profiles'?{id:user,status:'active'}:table==='time_clock_permissions'?{user_id:user,is_enabled:true}:{user_id:user,roles:user===id(101)?[{name:'estimator'},{name:'crew'}]:{name:'crew'}}));
    }},
  });
  const module=load('../src/lib/data/employees.ts',{
    'server-only':{},'@/lib/files/private-file-links':{},'@/lib/employee-presentation':load('../src/lib/employee-presentation.ts'),
    '@/lib/auth/roles':{platformRoleGroups:{timeClockEligible:['owner','admin','payroll_admin','estimator','crew']}},
    '@/lib/supabase/server':{createClient:async()=>client},'@/lib/security/errors':load('../src/lib/security/errors.ts',{'node:crypto':crypto}),
    '@/lib/business-time':load('../src/lib/business-time.ts'),
  });
  return {module,calls,maxInflight:()=>maxInflight};
}

test('large retained employee directory preserves every row and enriches the final batch with bounded requests',async()=>{
  const rows=Array.from({length:2251},(_,i)=>employee(i+1));
  rows[999]=employee(1000,{is_active:false,employment_status:'separated'});
  const f=fixture(rows),result=await f.module.getEmployees();
  assert.equal(result.error,null);assert.equal(result.data.length,rows.length);
  assert.deepEqual(result.data.map(r=>r.id),rows.map(r=>r.id));
  for(const i of [0,99,100,2249,2250]){assert.equal(result.data[i].timeClockState,'enabled');assert.equal(result.data[i].platformAccessState,'active');}
  assert.equal(result.data[999].timeClockState,'disabled');assert.equal(result.data[999].platformAccessState,'disabled');
  assert.deepEqual(result.data[100].roleNames,['estimator','crew']);
  assert.equal(f.calls.length,69);assert.ok(f.maxInflight()<=3);
  for(const table of ['profiles','user_roles','time_clock_permissions']){
    assert.deepEqual(f.calls.filter(c=>c.table===table).flatMap(c=>c.ids),rows.map(r=>r.auth_user_id));
  }
});

test('empty and accountless directories avoid account lookups; pending access and employee order remain intact',async()=>{
  for(const rows of [[],[employee(1,{auth_user_id:null,contact_email:'Pending@example.invalid'}),employee(2,{auth_user_id:null})]]){
    const f=fixture(rows),result=await f.module.getEmployees();assert.equal(result.error,null);assert.equal(f.calls.length,0);
    assert.equal(result.data.length,rows.length);
    if(rows.length){assert.equal(result.data[0].platformAccessState,'pending');assert.equal(result.data[1].platformAccessState,'no_account');assert.ok(result.data.every(r=>r.timeClockState==='no_account'));}
  }
});

test('shared account references are requested once without dropping either employee record',async()=>{
  const rows=[employee(1),employee(2,{auth_user_id:id(1)})],f=fixture(rows),result=await f.module.getEmployees();
  assert.equal(result.data.length,2);assert.equal(result.error,null);assert.ok(f.calls.every(c=>c.ids.length===1));
  assert.ok(result.data.every(r=>r.roleNames.includes('crew')&&r.timeClockState==='enabled'));
});

test('a failed middle batch remains an error, keeps the directory, and cannot turn unknown clock access into permission',async()=>{
  for(const failTable of ['profiles','user_roles','time_clock_permissions']){
    const rows=Array.from({length:251},(_,i)=>employee(i+1)),f=fixture(rows,{failTable}),result=await f.module.getEmployees();
    assert.equal(result.data.length,251);assert.match(result.error,/Fixture lookup unavailable/);
    assert.equal(f.calls.filter(c=>c.table===failTable).length,3,'Later batches must still be read');
    assert.equal(result.data[150].timeClockState,'unavailable');assert.ok(result.data.every(r=>r.timeClockState!=='enabled'));
    assert.ok(result.data.at(-1).roleNames.includes('crew'));
  }
});
