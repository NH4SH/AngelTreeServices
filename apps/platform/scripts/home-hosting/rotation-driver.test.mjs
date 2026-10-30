import {test} from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
test('rotation driver refuses to load private state without the explicit rehearsal switch',()=>{
 const r=spawnSync(process.execPath,[fileURLToPath(new URL('./rehearse-rotation.mjs',import.meta.url)),'/tmp/not-a-run'],{env:{PATH:'/usr/bin:/bin',ATS_ROTATION_REHEARSAL:'0'},encoding:'utf8',timeout:5000});assert.notEqual(r.status,0);assert.match(r.stderr,/Explicit isolated rehearsal required/);assert.equal(r.stdout,'');
});
