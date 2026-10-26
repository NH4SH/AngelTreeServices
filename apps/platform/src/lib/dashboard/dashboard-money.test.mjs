import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { validateBusinessReport } from '../reporting/model.ts';
import { resolveReportFilters } from '../reporting/definitions.ts';
import { withDeadline, mapBounded } from '../runtime/deadline.ts';
import * as series from './cash-series.ts';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const compile = path => ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const moneyCode = compile('../data/dashboard-money.ts'), rolesCode = compile('../auth/roles.ts'), contextCode=compile('../auth/pageContext.ts');
function load(code, modules) { const module={exports:{}}; new Function('require','module','exports',code)(name=>{assert.ok(name in modules,`Unexpected import: ${name}`);return modules[name];},module,module.exports); return module.exports; }
function harness({roles=['owner'],signedIn=true,effective=true,settingsError=false,transform=r=>r,responseError=()=>false}={}) {
  let active=0,maxActive=0;const calls=[];
  const db={auth:{getUser:async()=>({data:{user:signedIn?{id:'synthetic-actor'}:null}})},
    from:()=>({select:()=>({eq:async()=>({data:roles.map(name=>({roles:{name}})),error:null})})}),
    rpc:(name,args)=>{
      if(name==='has_effective_platform_access')return Promise.resolve({data:effective,error:null});
      assert.equal(name,'get_dashboard_money_reports'); assert.deepEqual(Object.keys(args).sort(),['p_end','p_start']);
      calls.push(args);
      return {abortSignal:async signal=>{
        assert.ok(signal instanceof AbortSignal);active++;maxActive=Math.max(maxActive,active);
        await new Promise(resolve=>setImmediate(resolve));
        active--;
        const make=(start,end,index)=>{const days=(Date.parse(end)-Date.parse(start))/86400000+1;return transform({scope:'company',restricted:false,generatedAt:new Date().toISOString(),timezone:'America/New_York',allTotalsComplete:true,datasets:{},previous:{},options:{},settings:{},summary:{approvedQuoteCents:2000000,quoteApprovalRate:75,invoicedCents:4000000,collectedCents:days*100,outstandingCents:3000000,overdueCents:500000}},index);};
        const report=make(args.p_start,args.p_end,0),cash=report.scope==='company'?series.cashBuckets(args.p_start,args.p_end).map((bucket,i)=>{if(responseError(i+1))return null;const part=make(bucket.start,bucket.end,i+1);return{...bucket,scope:part.scope,timezone:part.timezone,collectedCents:part.summary.collectedCents};}):[];
        return responseError(0)?{data:null,error:{code:'42501'}}:{data:{report,cash},error:null};
      }};
    }};
  const server={createClient:async()=>db};
  const rolesModule=load(rolesCode,{'@/lib/supabase/server':server});
  const context=load(contextCode,{'react':{cache:fn=>fn},'next/navigation':{redirect:()=>assert.fail('Money reads must not redirect')},'@/lib/supabase/server':server,'@/lib/auth/roles':rolesModule});
  const money=load(moneyCode,{'server-only':{},'@/lib/auth/pageContext':context,'@/lib/auth/roles':rolesModule,'@/lib/data/reports':{getReportingSettings:async()=>({data:{business_timezone:'America/New_York'},error:settingsError?'Unavailable':null})},'@/lib/reporting/definitions':{resolveReportFilters},'@/lib/reporting/model':{validateBusinessReport},'@/lib/runtime/deadline':{withDeadline,mapBounded},'@/lib/dashboard/cash-series':series});
  return {read:money.getDashboardMoney,calls,getActive:()=>active,getMaxActive:()=>maxActive};
}

test('company chart uses one complete authenticated aggregate request',async()=>{
  const h=harness(),r=await h.read('last_30');
  assert.equal(r.kind,'financial');assert.equal(r.points.at(-1).cumulativeCents,3000);assert.equal(r.summary.collectedCents,3000);assert.equal(h.calls.length,1);assert.equal(h.getMaxActive(),1);assert.equal(h.getActive(),0);
  assert.equal(h.calls[0].p_start,r.start);assert.equal(h.calls.at(-1).p_end,r.end);
});
test('estimators receive only own-sales fields; financial fields are never serialized',async()=>{
  const h=harness({roles:['estimator'],transform:r=>({...r,scope:'own'})}),r=await h.read('last_7');
  assert.equal(r.kind,'sales');assert.deepEqual(Object.keys(r.summary).sort(),['approvedQuoteCents','quoteApprovalRate']);assert.equal(h.calls.length,1);assert.ok(!JSON.stringify(r).includes('collectedCents'));assert.ok(!('points' in r));
});
test('database own scope overrides an owner role hint',async()=>{
  const h=harness({transform:r=>({...r,scope:'own'})}),r=await h.read('last_7');assert.equal(r.kind,'sales');assert.equal(h.calls.length,1);assert.ok(!('outstandingCents' in r.summary));
});
test('signed-out, offboarded, crew and customer actors never request report totals',async()=>{
  for(const options of [{signedIn:false},{effective:false},{roles:['crew']},{roles:['customer']}]){
    const h=harness(options),r=await h.read('last_7');assert.equal(r.kind,'unavailable');assert.equal(h.calls.length,0);assert.ok(!('summary' in r));
  }
});
test('failed settings cannot silently substitute a timezone',async()=>{
  const h=harness({settingsError:true}),r=await h.read('last_7');assert.equal(r.kind,'unavailable');assert.equal(h.calls.length,0);
});
test('a role/scope change during bucket reads hides the whole money response',async()=>{
  const h=harness({transform:(r,i)=>i===2?{...r,scope:'own'}:r}),r=await h.read('last_7');assert.equal(r.kind,'unavailable');assert.ok(!('summary' in r));assert.equal(h.getActive(),0);
});
test('a failed bucket waits for bounded siblings and never returns a partial financial summary',async()=>{
  const h=harness({responseError:i=>i===2}),r=await h.read('last_7');assert.equal(r.kind,'unavailable');assert.equal(h.getActive(),0);assert.equal(h.calls.length,1);
});
test('concurrent cash restatements hide only an unconfirmed timeline',async()=>{
  const h=harness({transform:(r,i)=>i===2?{...r,summary:{...r.summary,collectedCents:r.summary.collectedCents+1}}:r}),r=await h.read('last_7');assert.equal(r.kind,'financial');assert.deepEqual(r.points,[]);assert.match(r.seriesError,/changed/);assert.equal(r.summary.collectedCents,700);
});
test('invalid and incomplete financial acknowledgements fail closed',async()=>{
  for(const transform of [r=>({...r,allTotalsComplete:false}),r=>({...r,restricted:true}),r=>({...r,summary:{...r.summary,collectedCents:null}}),r=>({...r,summary:{...r.summary,outstandingCents:Infinity}})]){
    const h=harness({transform}),r=await h.read('last_7');assert.equal(r.kind,'unavailable');assert.ok(!('summary' in r));
  }
});

test('unexpected company scope for an estimator and timezone changes fail closed',async()=>{
  for (const options of [{roles:['estimator']},{transform:r=>({...r,timezone:'Pacific/Honolulu'})}]) {
    const h=harness(options),r=await h.read('last_7');assert.equal(r.kind,'unavailable');assert.ok(!('summary' in r));assert.equal(h.calls.length,1);
  }
});
