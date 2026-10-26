import assert from 'node:assert/strict';import test from 'node:test';import * as jsx from 'react/jsx-runtime';
import{readFileSync}from'node:fs';import{createRequire}from'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
function load(file,deps={}){
 const js=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,m={exports:{}};
 new Function('require','module','exports',js)(name=>{assert.ok(name in deps,`Unexpected import ${name}`);return deps[name];},m,m.exports);return m.exports;
}
function elements(node){return Array.isArray(node)?node.flatMap(elements):node&&typeof node==='object'&&'props'in node?[node,...elements(node.props.children)]:[];}
function text(node){return Array.isArray(node)?node.map(text).join(' '):node&&typeof node==='object'&&'props'in node?text(node.props.children):typeof node==='string'||typeof node==='number'?String(node):'';}
import{Suspense}from'react';import * as series from'../src/lib/dashboard/cash-series.ts';
const Link=()=>null,Frame=()=>null,Setup=()=>null,Periods=()=>null,Money=()=>null,MoneyLoading=()=>null,icon=()=>null;
function pageHarness({configured=true,denied=false}={}){
 let reads=0;const slow=()=>{reads++;return new Promise(()=>{});};
 const dependencies={
  'react/jsx-runtime':jsx,react:{Suspense},'next/link':Link,'lucide-react':new Proxy({},{get:()=>icon}),
  '@/lib/business-time':{formatBusinessDateTime:()=> 'Synthetic date',getBusinessDateKey:()=> '2026-10-22'},'@/components/NextActionsPanel':{},'@/components/CompletedEstimatesPanel':{},'@/lib/schedule/event-form':{},
  '@/components/PlatformFrame':{PlatformFrame:Frame},'@/components/SetupRequired':{SetupRequired:Setup},
  '@/lib/auth/pageContext':{getAuthenticatedPlatformContext:async()=>{if(denied)throw Error('Signed out');return{configured,roles:['owner'],user:{id:'synthetic',email:'synthetic@example.invalid'}};}},
  '@/lib/auth/roles':{hasAllowedRole:(roles,allowed)=>roles.some(x=>allowed.includes(x)),platformRoleGroups:{financialReporting:['owner'],accessApproval:['owner']}},
  '@/lib/data/appointments':{getFollowUpsDue:slow},'@/lib/data/invoices':{getUnpaidInvoices:slow},'@/lib/data/jobs':{getDashboardJobSummaries:slow},'@/lib/data/organizations':{getOrganizationDashboardSummary:slow},'@/lib/data/quotes':{getQuoteDashboardSummaries:slow},'@/lib/data/schedule':{getScheduleDashboardSummary:slow},'@/lib/data/communications':{getCommunicationDashboardSummary:slow},'@/lib/data/equipment':{getEquipmentDashboardSummary:slow},'@/lib/data/employees':{getEmployeeDashboardSummary:slow},'@/lib/data/materials':{getMaterialsDashboardSummary:slow},'@/lib/data/workflow-pipeline':{getWorkflowPipelineStages:slow},
  '@/components/dashboard/DashboardMoney':{DashboardMoney:Money,DashboardMoneyLoading:MoneyLoading},'@/components/dashboard/DashboardMoneyController':{DashboardMoneyController:Periods},'@/lib/dashboard/cash-series':series,'./dashboard.css':{},
 };
 return{page:load('../src/app/admin/page.tsx',dependencies).default,reads:()=>reads};
}
test('slow operations cannot hold back the authenticated shell, reporting controls or money boundary',{timeout:1500},async()=>{
 const h=pageHarness(),view=await h.page({searchParams:Promise.resolve({range:'last_90'})}),nodes=elements(view);
 assert.equal(view.type,Frame);assert.equal(h.reads(),0);assert.equal(nodes.find(n=>n.type===Periods).props.period,'last_90');
 const boundary=nodes.find(n=>n.type===Suspense&&n.props.children?.type===Money);assert.equal(boundary.key,'last_90');assert.equal(boundary.props.children.props.period,'last_90');assert.equal(boundary.props.fallback.type,MoneyLoading);
 const work=nodes.find(n=>n.type===Suspense&&n.props.children?.type?.name==='DashboardOperations');assert.ok(work);
 const next=elements(await h.page({searchParams:Promise.resolve({range:'month'})})).find(n=>n.type===Suspense&&n.props.children?.type?.name==='DashboardOperations');assert.notEqual(work.key,next.key,'Range navigation must reset pending work rather than hold the already visible page');
});
test('configuration and authentication gates still precede any dashboard reads',async()=>{
 const unavailable=pageHarness({configured:false}),view=await unavailable.page({searchParams:Promise.resolve({})});assert.equal(view.type,Setup);assert.equal(unavailable.reads(),0);
 const denied=pageHarness({denied:true});await assert.rejects(denied.page({searchParams:Promise.resolve({})}),/Signed out/);assert.equal(denied.reads(),0);
});
for(const pending of [false,true])test('reporting links retain real navigation with '+(pending?'immediate pending feedback':'no false loading state'),()=>{
 const {DashboardPeriodLinks}=load('../src/components/dashboard/DashboardPeriodLinks.tsx',{'react/jsx-runtime':jsx,'next/link':{__esModule:true,default:Link,useLinkStatus:()=>({pending})},'@/lib/dashboard/cash-series':series});
 const nodes=elements(DashboardPeriodLinks({period:'month'})),links=nodes.filter(n=>n.type===Link);assert.equal(links.length,5);
 const ninety=links.find(n=>n.props.href==='/admin?range=last_90');assert.equal(ninety.props.prefetch,false);assert.equal(ninety.props.scroll,false);assert.equal(ninety.props['aria-label'],'Last 90 days');assert.equal(ninety.props['aria-current'],undefined);
 const label=ninety.props.children.type(ninety.props.children.props);assert.equal(label.props['aria-busy'],pending);assert.equal(label.props['data-pending'],pending);assert.equal(text(label).includes('Loading last 90 days…'),pending);
 assert.equal(links.find(n=>n.props.href==='/admin?range=month').props['aria-current'],'page');
});
test('loading money never displays a stale value or waits to offer period navigation',()=>{
 const mod=load('../src/components/dashboard/DashboardMoneyView.tsx',{'react/jsx-runtime':jsx,'next/link':Link,'@/lib/dashboard/cash-series':series,'./DashboardCashChart':{}});
 const view=mod.DashboardMoneyLoading();assert.equal(String(view.props['aria-busy']),'true');assert.match(text(view),/Loading verified totals/);assert.doesNotMatch(text(view),/\$/);
});
