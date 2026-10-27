// Ciphertext-only upload/readback in existing CRM Staging. This does not import
// a database into managed Supabase or enable any production backup schedule.
import assert from 'node:assert/strict';import{createHash}from'node:crypto';import{lstatSync,mkdirSync,readFileSync,readdirSync,writeFileSync,existsSync}from'node:fs';import{join}from'node:path';import{spawnSync}from'node:child_process';import{pathToFileURL}from'node:url';
assert.equal(process.env.HOME_FAILOVER_STAGING,'1');assert.equal(process.platform,'darwin');process.umask(0o077);
const root='/Users/noelsierra/Documents/Codex/2026-10-27/home-crm-failover',context=JSON.parse(readFileSync(root+'/run-context.json'));assert.match(context.id,/^[a-f0-9]{12}$/);
const baseline=process.env.ATS_FAILOVER_ARCHIVE_PHASE==='baseline';
const base=root+'/native-export',repo=base+'/encrypted-repository',password=base+'/recovery-password.private',proof=JSON.parse(readFileSync(base+(baseline?'/admission-baseline-proof.json':'/capture-proof.json')));
assert.equal(proof.namespace,'ats-rehearsal-'+context.id);assert.equal(proof.sourceMigrationCount,102);assert.equal(proof.pairedDatabaseAndObjects,true);assert.equal(lstatSync(password).mode&0o077,0);
const hash=b=>createHash('sha256').update(b).digest('hex'),project='gbyhdsuiqeslgjdnbqng',origin='https://'+project+'.supabase.co',bucket='crm-failover-rehearsal-'+context.id;
const keys=JSON.parse(readFileSync('/Users/noelsierra/Documents/Codex/2026-10-26/macbook-crm-benchmark/staging-keys.private.json'));
const anon=keys.find(k=>k.name==='anon').api_key,service=keys.find(k=>k.name==='service_role').api_key;for(const key of[anon,service])assert.equal(JSON.parse(Buffer.from(key.split('.')[1],'base64url')).ref,project);
const{createClient}=await import(pathToFileURL('/Users/noelsierra/Documents/Codex/2026-10-26/macbook-crm-benchmark/source/apps/platform/node_modules/@supabase/supabase-js/dist/index.cjs'));
const allowedFetch=(input,init)=>{const u=new URL(input instanceof Request?input.url:input);assert.equal(u.origin,origin);return fetch(input,{...init,signal:AbortSignal.timeout(45000)});};const opts={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:allowedFetch}};
const round=baseline?(proof.round??1):1;
const admin=createClient(origin,service,opts),anonymous=createClient(origin,anon,opts),out=root+(baseline?'/supabase-baseline-archive'+(round>1?'-'+round:''):'/supabase-archive'),downloaded=out+'/downloaded-repository';mkdirSync(out,{recursive:true,mode:0o700});mkdirSync(downloaded,{recursive:true,mode:0o700});
const ok=r=>{assert.equal(r.error,null,'Staging archive operation failed.');return r.data;};
function files(dir,prefix=''){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>{assert.equal(e.isSymbolicLink(),false);return e.isDirectory()?files(join(dir,e.name),prefix+e.name+'/'):[{relative:prefix+e.name,path:join(dir,e.name)}];});}
const entries=files(repo);for(const e of entries)assert.match(e.relative,/^(config|keys\/[a-f0-9]{64}|index\/[a-f0-9]{64}|snapshots\/[a-f0-9]{64}|data\/[a-f0-9]{2}\/[a-f0-9]{64})$/);
const bytes=entries.reduce((n,e)=>n+lstatSync(e.path).size,0);assert.ok(bytes<128*1024*1024,'Rehearsal archive exceeds its explicit test budget.');
const existing=await admin.storage.getBucket(bucket);if(existing.error){assert.match(String(existing.error.message),/not found/i);ok(await admin.storage.createBucket(bucket,{public:false,fileSizeLimit:32*1024*1024,allowedMimeTypes:['application/octet-stream']}));}else{assert.equal(existing.data.public,false);}
writeFileSync(out+'/target.json',JSON.stringify({project,bucket,syntheticOnly:true,public:false})+'\n',{mode:0o600});
entries.sort((a,b)=>Number(a.relative.startsWith('snapshots/'))-Number(b.relative.startsWith('snapshots/'))||a.relative.localeCompare(b.relative));
const progress=[];
for(const e of entries){
 const content=readFileSync(e.path);assert.ok(content.length<32*1024*1024);
 let remote=await admin.storage.from(bucket).download(e.relative);
 if(remote.error){
  assert.ok(/not found|does not exist/i.test(remote.error.message),'Existing-object check failed; do not blindly upload.');
  const put=await admin.storage.from(bucket).upload(e.relative,content,{upsert:false,cacheControl:'0',contentType:'application/octet-stream'});
  // Resolve a lost upload response through a read; never overwrite an object.
  remote=await admin.storage.from(bucket).download(e.relative);
  if(remote.error)throw Error('Immutable object upload/readback unresolved: '+e.relative+'; '+(put.error?.message??remote.error.message));
 }
 const recovered=Buffer.from(await ok(remote).arrayBuffer());assert.equal(hash(recovered),hash(content));
 mkdirSync(join(downloaded,...e.relative.split('/').slice(0,-1)),{recursive:true,mode:0o700});writeFileSync(join(downloaded,e.relative),recovered,{mode:0o600});
 progress.push({object:e.relative,bytes:content.length,readbackVerified:true});writeFileSync(out+'/upload-progress.json',JSON.stringify(progress)+'\n',{mode:0o600});
}
assert.ok((await anonymous.storage.from(bucket).download('config')).error);const publicUrl=admin.storage.from(bucket).getPublicUrl('config').data.publicUrl;const publicResponse=await allowedFetch(publicUrl,{redirect:'error'});assert.ok(publicResponse.status>=400&&publicResponse.status<500);await publicResponse.body?.cancel();
const restic='/Users/noelsierra/Documents/Codex/2026-10-27/home-crm-migration/tools/restic_0.19.1_darwin_arm64';assert.equal(hash(readFileSync(restic)),'06582569ff2f10e1935a6f12187c76db02f0bae99e6e54098f2cdc374766d768');let step=0;
function local(args){const r=spawnSync(restic,['--repo',downloaded,'--password-file',password,'--no-cache',...args],{env:{HOME:out,TMPDIR:out,PATH:'/usr/bin:/bin',GOMAXPROCS:'2',GOMEMLIMIT:'256MiB'},encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024});writeFileSync(out+'/restic-'+(++step)+'.private.log',(r.stdout??'')+'\n'+(r.stderr??''),{mode:0o600});assert.equal(r.status,0,'Restic offsite verification failed.');return r.stdout;}
local(['check','--read-data']);const snapshots=JSON.parse(local(['snapshots','--json']));const snapshot=snapshots.find(s=>s.id===proof.snapshotId);assert.ok(snapshot);const expectedPath='/home/noelsierra.guest/candidate/failover-'+context.id+(baseline?'/recovered-baseline-capture'+(round>1?'-'+round:''):'/capture');assert.equal(snapshot.paths[0],expectedPath);
const recovered=out+'/recovered-capture';assert.equal(existsSync(recovered),false,'Preserve a previous recovery result.');local(['restore',proof.snapshotId+':'+snapshot.paths[0],'--target',recovered,'--verify']);
const manifestBytes=readFileSync(recovered+'/manifest.private.json'),manifest=JSON.parse(manifestBytes);assert.equal(hash(manifestBytes),proof.manifestSha256);assert.equal(manifest.syntheticOnly,true);assert.equal(manifest.namespace,proof.namespace);
for(const[file,key]of[['database.dump','databaseSha256'],['objects.tar','objectArchiveSha256'],['release-source.tar.gz','releaseSourceSha256']])assert.equal(hash(readFileSync(recovered+'/'+file)),manifest[key]);
const report={version:1,namespace:proof.namespace,project,bucket,verifiedAt:new Date().toISOString(),manifestSha256:proof.manifestSha256,snapshotId:proof.snapshotId,remoteBytesReadBack:true,resticCheckPassed:true,publicAccessDenied:true,encryptedObjects:entries.length,encryptedBytes:bytes,authAndPrivateFileArchiveRecovered:true,managedDatabaseImported:false,managedDatabaseBlocked:'Two active free-project limit',productionChanged:false,productionScheduleEnabled:false};
writeFileSync(out+'/offsite-verification.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report));
