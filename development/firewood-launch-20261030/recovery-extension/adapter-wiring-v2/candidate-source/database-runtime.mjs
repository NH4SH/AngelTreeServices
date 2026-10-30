// Database configuration is separate from PGDATA on the pinned Supabase image.
// Read it through the local container CLI, never server-side filesystem SQL.
import assert from 'node:assert/strict';import {sha256} from './cloud-policy.mjs';
const safePath=p=>typeof p==='string'&&/^\/(?:etc\/postgresql(?:-custom)?|var\/lib\/postgresql\/data)\/(?:[a-zA-Z0-9_.-]+\/)*[a-zA-Z0-9_.-]+\.conf$/.test(p)&&!p.split('/').includes('..');
const recoverySettings=['max_connections','max_worker_processes','max_wal_senders','max_prepared_transactions','max_locks_per_transaction'];
export function captureDatabaseRuntime(io,{hbaOverride}={}){
 // The managed-compatible postgres role is intentionally restricted. Reuse
 // the existing local maintenance identity rather than granting it more access.
 const sql=query=>io.sql(query,{user:'supabase_admin'});
 const paths=new Set(JSON.parse(sql("select coalesce(jsonb_agg(distinct sourcefile order by sourcefile),'[]') from pg_file_settings where sourcefile is not null;")));
 const hba=sql('show hba_file;');for(const setting of ['config_file','hba_file','ident_file'])paths.add(sql('show '+setting+';'));
 const files=[];
 for(const path of [...paths].sort()){
  assert.ok(safePath(path));const bytes=path===hba&&hbaOverride!==undefined?Buffer.from(hbaOverride):Buffer.from(io.docker(['exec',io.db,'cat',path]));
  const mode=Number.parseInt(io.docker(['exec',io.db,'stat','-c','%a',path]).trim(),8);
  files.push({path,mode,size:bytes.length,sha256:sha256(bytes),content:bytes.toString('base64')});
 }
 const effectiveRecoverySettings=Object.fromEntries(recoverySettings.map(name=>[name,Number(sql('show '+name+';'))]));
 const result={version:1,sourceDbImage:io.inspect(io.db).Image,serverVersionNumber:Number(sql('show server_version_num;')),effectiveRecoverySettings,files};
 validateDatabaseRuntime(result,result.sourceDbImage);return result;
}
export function validateDatabaseRuntime(config,image){
 assert.equal(config.version,1);assert.match(config.sourceDbImage,/^sha256:[a-f0-9]{64}$/);assert.equal(config.sourceDbImage,image);
 assert.ok(Number.isSafeInteger(config.serverVersionNumber)&&config.serverVersionNumber>=170000&&config.serverVersionNumber<180000);
 assert.deepEqual(Object.keys(config.effectiveRecoverySettings).sort(),[...recoverySettings].sort());
 for(const value of Object.values(config.effectiveRecoverySettings))assert.ok(Number.isSafeInteger(value)&&value>=0&&value<=65536);
 assert.ok(Array.isArray(config.files)&&config.files.length>=3&&config.files.length<=32);const seen=new Set();let total=0;
 for(const file of config.files){assert.ok(safePath(file.path)&&!seen.has(file.path));seen.add(file.path);
  assert.ok(Number.isSafeInteger(file.mode)&&file.mode>=0&&file.mode<=0o777);const bytes=Buffer.from(file.content,'base64');assert.equal(bytes.toString('base64'),file.content);
  assert.equal(bytes.length,file.size);assert.ok(bytes.length<=262144);assert.equal(sha256(bytes),file.sha256);total+=bytes.length;}
 assert.ok(total<=512*1024);assert.ok([...seen].some(p=>p.endsWith('/pg_hba.conf')));assert.ok([...seen].some(p=>p.endsWith('/pg_ident.conf')));
 return sha256(JSON.stringify(config));
}
export function nativeRecoveryIdentity(pairingSha256,databaseRuntimeSha256){
 for(const value of [pairingSha256,databaseRuntimeSha256])assert.match(value,/^[a-f0-9]{64}$/);
 return sha256(JSON.stringify({pairingSha256,databaseRuntimeSha256}));
}
