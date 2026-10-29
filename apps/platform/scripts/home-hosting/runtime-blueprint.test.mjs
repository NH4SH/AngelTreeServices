import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runtimeBlueprint,validateRuntimeBlueprint,restoreRuntimeBlueprint } from './runtime-blueprint.mjs';

test('recovery blueprint includes mounted templates and executable sources, excluding mutable data and logs', t => {
  const root = mkdtempSync(join(tmpdir(), 'ats-blueprint-')); t.after(() => rmSync(root, { recursive:true, force:true }));
  const core=join(root,'core'),ops=join(root,'ops');mkdirSync(core);mkdirSync(ops);
  writeFileSync(join(core,'gateway.mjs'),'// scoped gateway');writeFileSync(join(ops,'watch.mjs'),'// scoped watcher');
  writeFileSync(join(ops,'watch.test.mjs'),'// test only');writeFileSync(join(ops,'attempt.private.json'),'private log');
  const config={services:{db:{volumes:['pg-data:/var/lib/postgresql/data']},api:{volumes:['./gateway.mjs:/gateway.mjs:ro']}},volumes:{'pg-data':{}}};
  writeFileSync(join(core,'compose.json'),JSON.stringify(config));
  const a=runtimeBlueprint(core,ops);
  assert.deepEqual(a.blueprint.files.map(f=>f.path),['operations/watch.mjs','selfhost/gateway.mjs']);
  assert.equal(runtimeBlueprint(core,ops).sha256,a.sha256);
  writeFileSync(join(core,'gateway.mjs'),'// changed gateway');assert.notEqual(runtimeBlueprint(core,ops).sha256,a.sha256);
  config.services.api.volumes=['./gateway.mjs:/gateway.mjs:rw'];writeFileSync(join(core,'compose.json'),JSON.stringify(config));
  assert.throws(()=>runtimeBlueprint(core,ops),/Mutable bind/);
  config.services.api.volumes=['/run/docker.sock:/socket:ro'];writeFileSync(join(core,'compose.json'),JSON.stringify(config));
  assert.throws(()=>runtimeBlueprint(core,ops));
  config.services.api.volumes=['./gateway.mjs:/gateway.mjs:ro'];writeFileSync(join(core,'compose.json'),JSON.stringify(config));
  rmSync(join(core,'gateway.mjs'));symlinkSync('/etc/hosts',join(core,'gateway.mjs'));
  assert.throws(()=>runtimeBlueprint(core,ops),/symlink/);
});
test('blueprint recovery reconstructs configuration without starting services or accepting links and path traversal',t=>{
 const root=mkdtempSync(join(tmpdir(),'ats-blueprint-restore-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const core=join(root,'core'),ops=join(root,'ops');mkdirSync(core);mkdirSync(ops);
 writeFileSync(join(core,'compose.json'),JSON.stringify({services:{app:{image:'synthetic-only'}}}));writeFileSync(join(ops,'run.mjs'),'// restore only');
 const {blueprint}=runtimeBlueprint(core,ops),out=join(root,'restored');
 const result=restoreRuntimeBlueprint(blueprint,out);assert.equal(result.servicesStarted,false);
 assert.equal(readFileSync(join(out,'operations/run.mjs'),'utf8'),'// restore only');
 assert.deepEqual(JSON.parse(readFileSync(join(out,'selfhost/compose.json'))),blueprint.compose);
 assert.throws(()=>restoreRuntimeBlueprint(blueprint,out),/Never overwrite/);
 for(const edit of [b=>b.files[0].path='operations/../escape',b=>b.files[0].sha256='0'.repeat(64),
  b=>b.files.push(b.files[0]),b=>b.files[0].content='bad',b=>b.files[0].mode=0o4777]){
  const bad=structuredClone(blueprint);edit(bad);assert.throws(()=>validateRuntimeBlueprint(bad));
 }
});

test('upstream SQL initialization templates are captured even with SELinux labels, without allowing writable runtime data', t => {
  const root=mkdtempSync(join(tmpdir(),'ats-blueprint-init-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const core=join(root,'core'),ops=join(root,'ops');mkdirSync(join(core,'volumes/db'),{recursive:true});mkdirSync(ops);
  writeFileSync(join(core,'volumes/db/roles.sql'),'-- reviewed role initialization');
  const config={services:{db:{volumes:['./volumes/db/roles.sql:/docker-entrypoint-initdb.d/init-scripts/99-roles.sql:Z']}}};
  writeFileSync(join(core,'compose.json'),JSON.stringify(config));
  const before=runtimeBlueprint(core,ops);assert.equal(before.blueprint.files[0].path,'selfhost/volumes/db/roles.sql');
  writeFileSync(join(core,'volumes/db/roles.sql'),'-- changed initialization');assert.notEqual(runtimeBlueprint(core,ops).sha256,before.sha256);
  config.services.db.volumes=['./volumes/db/roles.sql:/var/lib/postgresql/data/roles.sql:Z'];
  writeFileSync(join(core,'compose.json'),JSON.stringify(config));assert.throws(()=>runtimeBlueprint(core,ops),/Mutable bind/);
});
