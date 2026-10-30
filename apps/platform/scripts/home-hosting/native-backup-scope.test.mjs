import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('native rolling/WAL drivers refuse to inspect private state without their explicit rehearsal switch',()=>{
 for(const name of ['rehearse-rolling-health.mjs','rehearse-wal-candidate.mjs','rehearse-wal-restore.mjs','rehearse-wal-paired.mjs','rehearse-independent-wal.mjs']){
  const r=spawnSync(process.execPath,[fileURLToPath(new URL('./'+name,import.meta.url)),'0'.repeat(12),'1'.repeat(12)],{
   env:{HOME:'/no-private-state-for-this-test',PATH:process.env.PATH},encoding:'utf8',timeout:5000});
  assert.notEqual(r.status,0);assert.match(r.stderr,/AssertionError/);assert.doesNotMatch(r.stderr,/ENOENT|permission denied|SSH|password/i);
 }
});
