// Read-only receipt validation. The caller must obtain metadata/logs through
// authenticated Netlify access; this tool does not authenticate their provenance.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {assessNodeRuntime} from '../../src/lib/security/node-runtime.ts';

const server='___netlify-server-handler';
const profiles={
 staging:{siteId:'d81d923d-6ccf-4c1e-87cc-263f3d51555d',functions:[server]},
 production:{siteId:'6fe7a9ca-878e-4b7b-bb4a-966efdc4d1a0',functions:[server,'advance-scheduled-jobs','manager-notifications','process-communications','process-google-calendar','run-system-health']},
};

export function verifyRuntimeEvidence(evidence,profile,deployId,now=Date.now()) {
 const expected=profiles[profile];assert.ok(expected,'Select staging or production.');
 assert.match(deployId,/^[a-f0-9]{24}$/);
 assert.equal(evidence.siteId,expected.siteId);assert.equal(evidence.deployId,deployId);
 assert.ok(Number.isFinite(evidence.observedAt)&&evidence.observedAt<=now&&now-evidence.observedAt<=15*60*1000,'Obtain fresh runtime evidence.');
 for(const records of [evidence.packagedFunctions,evidence.deployedFunctions]) {
  assert.ok(Array.isArray(records));assert.deepEqual(records.map(x=>x.name).sort(),[...expected.functions].sort());
  assert.ok(records.every(x=>x.runtime==='nodejs22.x'),'Packaged and deployed runtime must both be Node22.');
 }
 assert.ok(Array.isArray(evidence.executionRecords));
 for(const name of expected.functions) {
  const records=evidence.executionRecords.filter(x=>x.functionName===name&&x.deployId===deployId);
  assert.ok(records.length>0,'Missing actual function execution evidence.');
  assert.ok(records.every(x=>/^v22\./.test(x.nodeVersion)&&assessNodeRuntime(x.nodeVersion).patched),'Actual runtime lacks the reviewed Node22 patch.');
 }
 return {profile,siteId:expected.siteId,deployId,functionsVerified:expected.functions.length,advisory:'CVE-2026-111497',verified:true,changesApplied:false};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
 try {
  const [flag,profile,deployFlag,deployId,fileFlag,file,...extra]=process.argv.slice(2);
  assert.ok(flag==='--profile'&&deployFlag==='--deploy'&&fileFlag==='--evidence'&&file&&!extra.length);
  console.log(JSON.stringify(verifyRuntimeEvidence(JSON.parse(readFileSync(file,'utf8')),profile,deployId)));
 }catch{console.error('Runtime release evidence rejected. Check target, freshness, all function runtimes and actual execution versions.');process.exitCode=1;}
}
