import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import React from 'react';
import {load} from './pr10-test-helpers.mjs';
const require=createRequire(import.meta.url),ts=require('typescript'),id='a0000000-0000-4000-8000-000000000001';
test('work-order loading gates ancillary reads, parallelizes independent checks and preserves role-sensitive rendering',async()=>{
 if(process.execArgv.includes('--conditions=react-server')){const child=spawnSync(process.execPath,['--experimental-strip-types','--test',fileURLToPath(import.meta.url)],{encoding:'utf8'});assert.equal(child.status,0,child.stdout+child.stderr);return;}
 const {renderToStaticMarkup}=await import('react-dom/server');
 for(const mode of ['owner','estimator','error','missing','setup']){
  const calls=[],captures={},roles=mode==='estimator'?['estimator']:['owner'];let release;const hold=new Promise(r=>release=r),job={id,status:'completed_pending_review',service_type:'other',requested_scope:'Synthetic scope',customer_id:id,organization_id:null,service_location_id:id,customers:{display_name:'Synthetic customer'},service_locations:{city:'Test City',street:'100 Synthetic Lane',state:'VA'},notes:[],quotes:[],invoices:[],appointments:[],schedule_events:[],change_orders:[],equipment_assignments:[]};
  const read=(name,data=[],wait=false)=>async()=>{assert.ok(calls.includes('core'),name+' must follow a successful core read');calls.push(name);if(wait)await hold;return{data,error:null};};
  const deps={
   'react':require('react'),'react/jsx-runtime':require('react/jsx-runtime'),'lucide-react':new Proxy({},{get:()=>()=>null}),
   'next/link':({href,children,...props})=>React.createElement('a',{href,...props},children),
   '@/lib/auth/pageContext':{getAuthenticatedPlatformContext:async()=>({configured:mode!=='setup',user:{id,email:'synthetic@example.invalid'},roles})},
   '@/lib/auth/roles':{hasAllowedRole:(roles,allowed)=>roles.some(r=>allowed.includes(r)),platformRoleGroups:{financialReporting:['owner'],accessApproval:['owner'],internalStaff:['owner','estimator']}},
   '@/lib/data/work-order-detail':{getWorkOrderDetail:async()=>{calls.push('core');return{data:['error','missing'].includes(mode)?null:job,error:mode==='error'?'Reload before making changes.':null};}},
   '@/lib/data/jobs':new Proxy({},{get:()=>assert.fail('The legacy detail reader must remain unused here')}),
   '@/lib/data/appointments':{getAssignableUsers:read('users')},'@/lib/data/job-photos':{getJobPhotos:read('photos')},
   '@/lib/data/communications':{getCustomerCommunications:read('communications'),getCommunicationRecipientOptions:read('recipients',[],true)},
   '@/lib/data/reports':{getJobCostEntries:read('costs')},'@/lib/data/materials':{getJobMaterials:read('materials',null)},
   '@/lib/data/record-reminder-summary':{getRecordReminderSummary:async()=>{calls.push('reminders');await hold;return{};}},
   '@/lib/actions/record-lifecycle':{getRecordLifecyclePreview:async()=>{calls.push('lifecycle');await hold;return{};}},
   '@/lib/actions/duplicate-records':{duplicateJob:()=>assert.fail('Render cannot mutate')},
   '@/lib/jobs/marketing-context':load('../src/lib/jobs/marketing-context.ts'),
   '@/lib/jobs/operational-status':load('../src/lib/jobs/operational-status.ts'),
   '@/lib/documents/email-drafts':{generateWorkOrderCrewMessage:()=>({})},
   '@/lib/documents/marketing-drafts':{getGoogleReviewUrl:()=>null},
   '@/lib/documents/scheduling-drafts':{generateEstimateScheduledMessage:()=>({}),generateJobScheduledMessage:()=>({}),generatePostJobFollowUpMessage:()=>({})},
   '@/lib/invoices/status':{formatInvoiceStatus:x=>x},'@/lib/maps':{getDirectionsUrl:()=>null},'@/lib/business-time':{formatBusinessDateTime:()=>''},
  };
  const code=ts.transpileModule(readFileSync(new URL('../src/app/admin/jobs/[jobId]/page.tsx',import.meta.url),'utf8'),{fileName:'page.tsx',compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,m={exports:{}};
  new Function('require','module','exports',code)(name=>{if(name in deps)return deps[name];if(name.startsWith('@/components/'))return new Proxy({},{get:(_,component)=>props=>{captures[component]=props;return React.createElement('div',null,props.children);}});assert.fail('Unexpected import '+name);},m,m.exports);
  const pending=m.exports.default({params:Promise.resolve({jobId:id}),searchParams:Promise.resolve({})});await new Promise(setImmediate);
  if(['owner','estimator'].includes(mode)){assert.ok(calls.includes('recipients')&&calls.includes('reminders'));assert.equal(calls.includes('lifecycle'),mode==='owner');assert.equal(calls.includes('costs'),mode==='owner');assert.equal(calls.filter(x=>x==='photos').length,1);}release();const html=renderToStaticMarkup(await pending);
  if(['error','missing'].includes(mode)){assert.deepEqual(calls,['core']);assert.equal(captures.JobScheduleManager,undefined);assert.equal(captures.CreateInvoiceFromJobAction,undefined);assert.match(html,mode==='error'?/Reload work order/:/Job not found or no access/);}
  else if(mode==='setup')assert.deepEqual(calls,[]);
  else{assert.ok(captures.JobScheduleManager);assert.ok(captures.WorkOrderDocument);assert.ok(captures.CompletedJobMarketingWorkspace);assert.equal('notes'in captures.CompletedJobMarketingWorkspace.job,false);assert.equal(captures.JobCostPanel!==undefined,mode==='owner');}
 }
});
