import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './pr10-test-helpers.mjs';
const id='a0000000-0000-4000-8000-000000000001',user='a0000000-0000-4000-8000-000000000002',item=n=>({id:'material-'+n,name:'Synthetic '+n,default_unit:'each'}),parent=()=>({id,assigned_crew_user_id:user,job_material_requirements:[{id:'requirement',job_id:id,material_id:'material-0',planned_quantity:2.5,unit:'each',notes:'Synthetic loading note',is_estimated:true}]});
function reader({job=parent(),pages=[[item(0)]],failTable,throwTable}={}){
 const calls=[],db={from(table){const ops=[],call={table,ops};calls.push(call);const q=new Proxy({then(resolve,reject){if(table===throwTable)return Promise.reject(Error('Private network detail')).then(resolve,reject);const data=table==='jobs'?job:pages.shift();return Promise.resolve({data,error:table===failTable?{message:'Private backend diagnostic'}:null}).then(resolve,reject);}},{get(t,name){return name in t?t[name]:(...args)=>{ops.push([name,...args]);return q;};}});return q;}};
 const run=(roles=['owner'],who=user)=>load('../src/lib/data/work-order-materials.ts',{'server-only':{},'@/lib/supabase/server':{createClient:async()=>db},'@/lib/auth/roles':{hasAllowedRole:(r,g)=>r.some(x=>g.includes(x)),platformRoleGroups:{internalStaff:['owner','admin','payroll_admin','estimator']}}}).getWorkOrderMaterialPlan(id,roles,who);return{run,calls};
}
test('office material planning reads only its exact parent plan and active three-field catalog',async()=>{
 const r=reader(),result=await r.run();assert.equal(result.error,null);assert.deepEqual(result.data,{materials:[item(0)],requirements:parent().job_material_requirements});assert.deepEqual(r.calls.map(x=>x.table),['jobs','material_catalog']);assert.ok(r.calls[0].ops.some(x=>x[0]==='eq'&&x[1]==='id'&&x[2]===id));assert.match(r.calls[0].ops[0][1],/job_material_requirements_job_id_fkey/);assert.equal(r.calls[1].ops.find(x=>x[0]==='select')[1],'id, name, default_unit');assert.ok(r.calls[1].ops.some(x=>x[0]==='eq'&&x[1]==='is_active'&&x[2]===true));assert.ok(r.calls[1].ops.some(x=>x[0]==='is'&&x[1]==='archived_at'&&x[2]===null));
});
test('catalog pages retain every active choice beyond the API cap with stable ordering',async()=>{
 const first=Array.from({length:1000},(_,n)=>item(n)),last=[item(1000)],r=reader({pages:[first,last]}),result=await r.run();assert.equal(result.data.materials.length,1001);assert.deepEqual(result.data.materials.at(-1),item(1000));assert.deepEqual(r.calls[2].ops.find(x=>x[0]==='range'),['range',1000,1999]);for(const call of r.calls.slice(1))assert.deepEqual(call.ops.filter(x=>x[0]==='order').map(x=>x[1]),['name','id']);
});
test('missing, foreign, malformed or failed planning data cannot produce a partial add form',async()=>{
 for(const job of [null,{...parent(),id:'foreign'},{...parent(),job_material_requirements:null},{...parent(),job_material_requirements:[null]},{...parent(),job_material_requirements:[{...parent().job_material_requirements[0],job_id:'foreign'}]}])assert.equal((await reader({job}).run()).data,null);
 for(const table of ['jobs','material_catalog']){const result=await reader({failTable:table}).run();assert.equal(result.data,null);assert.doesNotMatch(result.error,/Private/);const thrown=await reader({throwTable:table}).run();assert.equal(thrown.data,null);assert.doesNotMatch(thrown.error,/Private/);}
 const first=Array.from({length:1000},(_,n)=>item(n));assert.equal((await reader({pages:[first,null]}).run()).data,null);assert.equal((await reader({pages:[first,[item(0)]]}).run()).data,null);
});
test('staff and assigned crew retain their existing reader boundary; a different crew account is denied',async()=>{
 assert.ok((await reader().run(['crew'])).data);assert.equal((await reader().run(['crew'],'other')).data,null);assert.ok((await reader().run(['estimator'],'other')).data);
});
