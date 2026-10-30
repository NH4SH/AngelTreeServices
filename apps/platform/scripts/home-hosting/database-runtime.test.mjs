import {test} from 'node:test';import assert from 'node:assert/strict';import {sha256} from './cloud-policy.mjs';import {captureDatabaseRuntime,validateDatabaseRuntime,nativeRecoveryIdentity} from './database-runtime.mjs';
const image='sha256:'+'a'.repeat(64),config={version:1,sourceDbImage:image,serverVersionNumber:170011,
 effectiveRecoverySettings:{max_connections:100,max_worker_processes:8,max_wal_senders:10,max_prepared_transactions:0,max_locks_per_transaction:64},
 files:['postgresql.conf','pg_hba.conf','pg_ident.conf'].map(name=>({path:'/etc/postgresql/'+name,mode:0o640,size:9,sha256:sha256('synthetic'),content:Buffer.from('synthetic').toString('base64')}))};
test('database runtime config binds all safe source paths and exact bytes to the pinned image',()=>{
 assert.match(validateDatabaseRuntime(config,image),/^[a-f0-9]{64}$/);
 for(const edit of [c=>c.files[0].path='/etc/passwd',c=>c.files[0].path='/etc/postgresql/../secret.conf',c=>c.files[0].content='bad',
  c=>c.files[0].sha256='b'.repeat(64),c=>c.files[0].mode=0o4777,c=>c.files.push(c.files[0]),c=>c.files.pop(),c=>c.serverVersionNumber=180000]){
  const bad=structuredClone(config);edit(bad);assert.throws(()=>validateDatabaseRuntime(bad,image));
 }
 const a=nativeRecoveryIdentity('b'.repeat(64),validateDatabaseRuntime(config,image)),changed=structuredClone(config);changed.files[0].mode=0o600;
 assert.notEqual(a,nativeRecoveryIdentity('b'.repeat(64),validateDatabaseRuntime(changed,image)));
});
test('runtime capture uses the existing maintenance identity for restricted file settings',()=>{
 const io={db:'synthetic',inspect:()=>({Image:image}),sql(query,options){
  assert.equal(options.user,'supabase_admin');
  if(query.includes('pg_file_settings'))return JSON.stringify(config.files.map(f=>f.path));
  if(query==='show config_file;')return config.files[0].path;
  if(query==='show hba_file;')return config.files[1].path;
  if(query==='show ident_file;')return config.files[2].path;
  if(query==='show server_version_num;')return '170011';
  const name=query.match(/^show ([a-z_]+);$/)?.[1];assert.ok(name in config.effectiveRecoverySettings);return String(config.effectiveRecoverySettings[name]);
 },docker(args){return args[2]==='cat'?'synthetic':'640';}};
 assert.deepEqual(captureDatabaseRuntime(io),{...config,files:[...config.files].sort((a,b)=>a.path.localeCompare(b.path))});
});
