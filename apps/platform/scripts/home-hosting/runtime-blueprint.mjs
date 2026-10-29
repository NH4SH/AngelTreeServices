// Bounded, encrypted-backup input. Read configuration templates and operations
// sources, never PGDATA, object volumes, sockets, logs or dependency caches.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, lstatSync, mkdirSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import { sha256 } from './cloud-policy.mjs';
import {backupSourceScope} from './backup-source-scope.mjs';

export function runtimeBlueprint(configRoot, operationsRoot) {
  const root = resolve(configRoot), ops = resolve(operationsRoot);
  const compose = JSON.parse(readFileSync(join(root, 'compose.json'))), paths = new Set();
  for (const service of Object.values(compose.services)) {
    for (const mount of service.volumes ?? []) {
      const source = typeof mount === 'string' ? mount.split(':')[0] : mount.source;
      const readonly = typeof mount === 'string' ? mount.split(':').slice(2).join(':').split(',').includes('ro') : mount.read_only;
      if (typeof mount==='string'&&!mount.includes(':'))continue;
      if(!source||Object.hasOwn(compose.volumes??{},source))continue;
      // The upstream Supabase compose file labels its initialization SQL with
      // SELinux :Z, rather than :ro. These seven source templates are recovery
      // inputs, not the live database directory. Include their exact bytes;
      // every other writable bind still needs a separate, reviewed capture.
      const destination = typeof mount === 'string' ? mount.split(':')[1] : mount.target;
      // A restored/cold server must obtain a fresh signed permit. Never restore
      // a saved public admission directory and accidentally revive old access.
      if(service===compose.services.app&&source==='../admission-public'&&destination==='/admission'){
        assert.equal(readonly,true,'The app cannot write its own admission');continue;
      }
      const initializer = /^\.\/volumes\/db\/(realtime|webhooks|roles|jwt|_supabase|logs|pooler)\.sql$/.test(source) &&
        /^\/docker-entrypoint-initdb\.d\/(?:init-scripts|migrations)\/[0-9]{2}-[a-z_]+\.sql$/.test(destination ?? '');
      assert.ok(readonly === true || initializer, 'Mutable bind mounts need a separate recovery plan');
      const absolute = resolve(root, source);
      assert.ok(absolute.startsWith(root + '/'));
      paths.add(absolute);
    }
  }
  const files = [], seen=new Set(); let bytes = 0;
  function add(path, name) {
    if(seen.has(name))return;
    seen.add(name);
    const s = lstatSync(path); assert.ok(!s.isSymbolicLink(), 'Configuration symlink rejected');
    if (s.isDirectory()) {
      for (const entry of readdirSync(path).sort()) add(join(path, entry), name + '/' + entry);
    } else {
      assert.ok(s.isFile() && s.size <= 262144); bytes += s.size;
      assert.ok(bytes <= 768 * 1024 && files.length < 128, 'Recovery blueprint exceeds reviewed bound');
      const content = readFileSync(path);
      files.push({ path: name, mode: s.mode & 0o777, size: content.length,
        sha256: sha256(content), content: content.toString('base64') });
    }
  }
  for (const path of [...paths].sort()) add(path, 'selfhost/' + relative(root, path));
  for(const name of readdirSync(root).sort())if(/(?:\.mjs|\.Dockerfile)$/.test(name)&&!name.includes('private'))add(join(root,name),'selfhost/'+name);
  for (const name of readdirSync(ops).sort()) {
    if (/\.(mjs|sql|json)$/.test(name) && !name.includes('.test.') &&
        !name.includes('private') && lstatSync(join(ops, name)).isFile()) add(join(ops, name), 'operations/' + name);
  }
  const blueprint = { version: 1, compose, files: files.sort((a, b) => a.path.localeCompare(b.path)) };
  return { blueprint, sha256: sha256(JSON.stringify(blueprint)), plaintextBytes: bytes };
}

export function validateRuntimeBlueprint(blueprint,{complete=false,expectedBinding}={}){
  assert.equal(blueprint.version,1);assert.ok(blueprint.compose&&blueprint.compose.services);
  assert.ok(Array.isArray(blueprint.files)&&blueprint.files.length>0&&blueprint.files.length<=128);
  const seen=new Set();let total=0;
  for(const f of blueprint.files){
    assert.match(f.path,/^(?:selfhost|operations)\/[a-zA-Z0-9_./-]+$/);
    assert.ok(!f.path.split('/').some(p=>!p||p==='.'||p==='..')&&!seen.has(f.path));seen.add(f.path);
    assert.notEqual(f.path,'selfhost/compose.json','Compose is captured as the explicit structured blueprint');
    assert.ok(Number.isSafeInteger(f.mode)&&f.mode>=0&&f.mode<=0o777);
    const bytes=Buffer.from(f.content,'base64');assert.equal(bytes.toString('base64'),f.content);
    assert.ok(bytes.length<=262144);assert.equal(f.size,bytes.length);assert.equal(sha256(bytes),f.sha256);total+=bytes.length;
  }
  assert.ok(total<=768*1024);
  if(complete){
    for(const name of ['db','app','api-gw','auth','rest','storage','imgproxy'])assert.ok(blueprint.compose.services[name]);
    const production=!backupSourceScope(expectedBinding).syntheticOnly;
    assert.ok(seen.has(production?'selfhost/primary-supervisor.mjs':'selfhost/candidate-supervisor.mjs'));
    for(const name of production?['primary-controller.mjs','primary-io.mjs','primary-write-fence.mjs','candidate-write-fence.sql','native-wal-checkpoint.mjs']:['continuous-candidate.mjs','candidate-write-fence.sql','certified-checkpoint.mjs'])assert.ok(seen.has('operations/'+name));
  }
  return sha256(JSON.stringify(blueprint));
}

export function restoreRuntimeBlueprint(blueprint,destination){
  const digest=validateRuntimeBlueprint(blueprint);assert.equal(existsSync(destination),false,'Never overwrite a recovery directory');
  mkdirSync(destination,{mode:0o700});
  for(const f of blueprint.files){const path=join(destination,f.path);mkdirSync(resolve(path,'..'),{recursive:true,mode:0o700});writeFileSync(path,Buffer.from(f.content,'base64'),{flag:'wx',mode:0o600});chmodSync(path,f.mode);}
  mkdirSync(join(destination,'selfhost'),{recursive:true,mode:0o700});
  writeFileSync(join(destination,'selfhost/compose.json'),JSON.stringify(blueprint.compose,null,2)+'\n',{mode:0o600,flag:'wx'});
  // This creates files only. It does not start containers or enable services.
  return {sha256:digest,files:blueprint.files.length,servicesStarted:false};
}
