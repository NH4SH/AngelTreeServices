import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import * as policy from '../../src/lib/security/staging-policy.mjs';

const ts=(await import(process.env.HOME_HOSTING_TYPESCRIPT_MODULE??'typescript')).default;
const directory=fileURLToPath(new URL('.',import.meta.url));
const repo=path.resolve(directory,'../../../..');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'ats-scheduler-artifact-'));
const fixture=path.join(scratch,'source');
const files=['netlify/functions/advance-scheduled-jobs.ts','netlify/functions/manager-notifications.ts','netlify/functions/process-communications.ts','netlify/functions/process-google-calendar.ts','netlify/functions/run-system-health.ts','netlify/lib/worker-request.ts','src/lib/runtime/deadline.ts','src/lib/security/staging-policy.mjs','staging/targets.json'];
for(const name of files){const target=fixture+'/apps/platform/'+name;fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(repo+'/apps/platform/'+name,target);}
// The published-runtime branch has its additional Node guard. This isolated
// fixture supplies that dependency without modifying either source worktree.
const helper=fixture+'/apps/platform/netlify/lib/worker-request.ts';
if(!fs.readFileSync(helper,'utf8').includes('../../src/lib/security/node-runtime.ts'))fs.writeFileSync(helper,'import {logNodeRuntimeOnce} from "../../src/lib/security/node-runtime.ts";\n'+fs.readFileSync(helper,'utf8'));
fs.writeFileSync(fixture+'/apps/platform/src/lib/security/node-runtime.ts','export function logNodeRuntimeOnce() {}\n');
const artifacts={};
for(const mode of ['held','released']){
 const dest=path.join(scratch,mode);
 const args=[path.join(directory,'package-primary-edge.mjs'),fixture,dest];
 if(mode==='released')args.push(mode);
 const p=spawnSync(process.execPath,args,{encoding:'utf8'});
 assert.equal(p.status,0,p.stderr);
 artifacts[mode]=dest;
}
const secret='synthetic-worker-key-for-artifact-check-000000';
function worker(mode,settings={}){
 const env={APP_ENV:'production',SITE_ID:policy.production.netlifySiteId,APP_BASE_URL:policy.production.appOrigin,WORKER_SECRET:secret,ATS_HOME_EDGE_DISPATCH:'held',...settings};
 const source=fs.readFileSync(artifacts[mode]+'/platform/netlify/lib/worker-request.ts','utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const exports={},read=[],calls=[];
 const dependencies={
  '../../staging/targets.json':{},
  '../../src/lib/security/staging-policy.mjs':policy,
  '../../src/lib/security/node-runtime.ts':{logNodeRuntimeOnce(){}},
  '../../src/lib/runtime/deadline.ts':{withDeadline:fn=>fn(new AbortController().signal)},
 };
 vm.runInNewContext(compiled,{exports,require:key=>{assert.ok(key in dependencies);return dependencies[key];},Netlify:{env:{get:key=>{read.push(key);return env[key];}}},URL,Buffer,console,fetch:async(url,init)=>{calls.push({url:String(url),init});return new Response('{"ok":true}',{status:200});}});
 return{run:()=>exports.runScheduledWorker('/api/internal/test','WORKER_SECRET','Synthetic worker'),read,calls};
}
test('a default held artifact stops before reading credentials or making a request',async()=>{
 const f=worker('held');await assert.rejects(f.run(),/held/);assert.equal(f.read.length,0);assert.equal(f.calls.length,0);
});
test('explicit release is bound to the artifact, with the original authenticated canonical transport',async()=>{
 const f=worker('released');await f.run();assert.equal(f.calls.length,1);assert.equal(f.calls[0].url,policy.production.appOrigin+'/api/internal/test');assert.equal(f.calls[0].init.headers.Authorization,'Bearer '+secret);assert.equal(f.calls[0].init.redirect,'error');assert.equal(f.read.includes('ATS_HOME_EDGE_DISPATCH'),false);
});
test('release never permits a foreign site, alternate destination or missing credential',async()=>{
 for(const settings of [{SITE_ID:'foreign-site'},{APP_BASE_URL:'https://foreign.invalid'},{WORKER_SECRET:undefined},{APP_ENV:'staging'}]){const f=worker('released',settings);await assert.rejects(f.run());assert.equal(f.calls.length,0);}
});
test('held and released artifacts preserve exactly the existing five scheduler entrypoints',()=>{
 const expected=['advance-scheduled-jobs','manager-notifications','process-communications','process-google-calendar','run-system-health'];
 for(const mode of ['held','released']){const a=JSON.parse(fs.readFileSync(artifacts[mode]+'/artifact.json'));assert.equal(a.workerDispatchMode,mode);assert.deepEqual(a.schedulers,expected);assert.equal(a.crmRuntimeIncluded,false);assert.equal(a.dependencyFiles.length,10);}
});
test('every packaged timer pins Node 22 and retains its original schedule',()=>{
 const schedules={'advance-scheduled-jobs':'*/5 * * * *','manager-notifications':'*/5 * * * *','process-communications':'@hourly','process-google-calendar':'*/5 * * * *','run-system-health':'*/10 * * * *'};
 for(const mode of ['held','released'])for(const [name,schedule]of Object.entries(schedules)){
  const source=fs.readFileSync(artifacts[mode]+'/platform/netlify/functions/'+name+'.ts','utf8'),code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,exports={};
  vm.runInNewContext(code,{exports,require:key=>{assert.equal(key,'../lib/worker-request');return{runScheduledWorker(){assert.fail('Packaging must not run a worker');}};}});
  assert.equal(exports.config.nodeVersion,'nodejs22.x');assert.equal(exports.config.schedule,schedule);
 }
});
