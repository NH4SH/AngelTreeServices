// Read-only Restic preview of an already reviewed synthetic retention plan.
// This command has no cloud credentials and cannot prune or delete an object.
import assert from 'node:assert/strict';import {readFileSync,readdirSync,lstatSync} from 'node:fs';import {join} from 'node:path';import {spawnSync} from 'node:child_process';import {sha256} from './cloud-policy.mjs';
const [binary,repo,password,planFile]=process.argv.slice(2);assert.equal(process.env.ATS_CLOUD_REHEARSAL,'1');
assert.ok(['20d4142678d0d95ec11a4759def1b73fd9190abc9ca19e4b62d067c0b387e639','06582569ff2f10e1935a6f12187c76db02f0bae99e6e54098f2cdc374766d768'].includes(sha256(readFileSync(binary))));
const plan=JSON.parse(readFileSync(planFile));assert.equal(plan.previewOnly,true);assert.equal(plan.objectDeletionAllowed,false);assert.ok(plan.protectedSnapshots.length>=2);
assert.ok(plan.retirementCandidates.length>0&&plan.retirementCandidates.length<=256);
for(const id of [...plan.protectedSnapshots,...plan.retirementCandidates])assert.match(id,/^[a-f0-9]{64}$/);
assert.ok(plan.retirementCandidates.every(id=>!plan.protectedSnapshots.includes(id)));
function inventory(folder,prefix=''){
 return readdirSync(folder).sort().flatMap(name=>{const file=join(folder,name),s=lstatSync(file);assert.ok(!s.isSymbolicLink());return s.isDirectory()?inventory(file,prefix+name+'/'):[[prefix+name,sha256(readFileSync(file))]];});
}
const before=inventory(repo),r=spawnSync(binary,['--repo',repo,'--password-file',password,'--no-cache','forget','--dry-run','--json',...plan.retirementCandidates],{encoding:'utf8',timeout:15000,maxBuffer:1024*1024});
assert.equal(r.status,0,'Restic retention preview failed');assert.deepEqual(inventory(repo),before,'Read-only preview changed the repository');
console.log(JSON.stringify({previewOnly:true,retirementCandidates:plan.retirementCandidates.length,protectedSnapshots:plan.protectedSnapshots.length,repositoryUnchanged:true,objectsDeleted:0}));
