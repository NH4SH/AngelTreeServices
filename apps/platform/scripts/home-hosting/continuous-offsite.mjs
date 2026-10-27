// Development-Mac relay for the bounded synthetic rehearsal. The signing key
// stays off the candidate Mac. Only encrypted Restic objects leave the LAN.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync,mkdirSync,lstatSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {signProof} from './failover-proof.mjs';
import {validateContinuousReceipt} from './continuous-policy.mjs';

export async function verifyContinuousOffsite({repo,password,ticket,folder,keys,restic,createClient,privateKey,publicKey,injectTransportFailure=false}){
  assert.equal(process.platform,'darwin');process.umask(0o077);
  assert.match(ticket.namespace,/^ats-rehearsal-continuous-[a-f0-9]{12}$/);assert.equal(ticket.sourceId,'ats_crm_candidate_20261027');
  assert.equal(ticket.backupExitCode,0);assert.match(ticket.snapshotId,/^[a-f0-9]{64}$/);
  const project='gbyhdsuiqeslgjdnbqng',origin='https://'+project+'.supabase.co',bucket='crm-continuous-'+ticket.namespace.slice(-12);
  const anon=keys.find(k=>k.name==='anon').api_key,service=keys.find(k=>k.name==='service_role').api_key;
  for(const key of[anon,service])assert.equal(JSON.parse(Buffer.from(key.split('.')[1],'base64url')).ref,project);
  mkdirSync(folder,{mode:0o700});const hash=b=>createHash('sha256').update(b).digest('hex');
  function walk(dir,prefix=''){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>{assert.ok(!e.isSymbolicLink());const p=join(dir,e.name);return e.isDirectory()?walk(p,prefix+e.name+'/'):[{relative:prefix+e.name,path:p}];});}
  const objects=walk(repo);for(const o of objects)assert.match(o.relative,/^(config|keys\/[a-f0-9]{64}|index\/[a-f0-9]{64}|snapshots\/[a-f0-9]{64}|data\/[a-f0-9]{2}\/[a-f0-9]{64})$/);
  const total=objects.reduce((sum,o)=>sum+lstatSync(o.path).size,0);assert.ok(total<128*1024*1024,'Synthetic repository budget exceeded');
  const safeFetch=(input,init)=>{const u=new URL(input instanceof Request?input.url:input);assert.equal(u.origin,origin);if(injectTransportFailure)throw Error('injected_storage_transport_unavailable');return fetch(input,{...init,signal:AbortSignal.timeout(12000)});};
  const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:safeFetch}};
  const admin=createClient(origin,service,options),anonymous=createClient(origin,anon,options);
  const ok=result=>{assert.ifError(result.error&&Error(result.error.message));return result.data;};
  const existing=await admin.storage.getBucket(bucket);
  if(existing.error){assert.match(existing.error.message,/not found/i);ok(await admin.storage.createBucket(bucket,{public:false,fileSizeLimit:32*1024*1024,allowedMimeTypes:['application/octet-stream']}));}
  else assert.equal(existing.data.public,false);
  const downloaded=folder+'/downloaded';mkdirSync(downloaded,{mode:0o700});
  objects.sort((a,b)=>Number(a.relative.startsWith('snapshots/'))-Number(b.relative.startsWith('snapshots/'))||a.relative.localeCompare(b.relative));
  let uploaded=0;
  for(const o of objects){const local=readFileSync(o.path);assert.ok(local.length<32*1024*1024);let remote=await admin.storage.from(bucket).download(o.relative);
    if(remote.error){assert.match(remote.error.message,/not found|does not exist/i);await admin.storage.from(bucket).upload(o.relative,local,{upsert:false,cacheControl:'0',contentType:'application/octet-stream'});remote=await admin.storage.from(bucket).download(o.relative);uploaded+=local.length;}
    const bytes=Buffer.from(await ok(remote).arrayBuffer());assert.equal(hash(bytes),hash(local));mkdirSync(join(downloaded,...o.relative.split('/').slice(0,-1)),{recursive:true,mode:0o700});writeFileSync(join(downloaded,o.relative),bytes,{mode:0o600});
  }
  assert.ok((await anonymous.storage.from(bucket).download('config')).error);const denied=await safeFetch(origin+'/storage/v1/object/public/'+bucket+'/config',{redirect:'error'});assert.ok(denied.status>=400&&denied.status<500);await denied.body?.cancel();
  assert.equal(hash(readFileSync(restic)),'06582569ff2f10e1935a6f12187c76db02f0bae99e6e54098f2cdc374766d768');let step=0;
  const execute=args=>{const r=spawnSync(restic,['--repo',downloaded,'--password-file',password,'--no-cache',...args],{env:{HOME:folder,TMPDIR:folder,PATH:'/usr/bin:/bin',GOMAXPROCS:'2',GOMEMLIMIT:'256MiB'},encoding:'utf8',timeout:45000,maxBuffer:4*1024*1024});writeFileSync(folder+'/restic-'+(++step)+'.private.log',(r.stdout??'')+'\n'+(r.stderr??''),{mode:0o600});assert.equal(r.status,0,'Independent Restic readback failed');return r.stdout;};
  execute(['check','--read-data']);const snapshots=JSON.parse(execute(['snapshots','--json']));const chosen=snapshots.find(s=>s.id===ticket.snapshotId);assert.ok(chosen);assert.equal(chosen.paths[0],ticket.capturePath);
  const recovered=folder+'/recovered';assert.equal(existsSync(recovered),false);execute(['restore',ticket.snapshotId+':'+ticket.capturePath,'--target',recovered,'--verify']);
  const bytes=readFileSync(recovered+'/manifest.private.json'),m=JSON.parse(bytes);assert.equal(hash(bytes),ticket.manifestSha256);assert.equal(m.syntheticOnly,true);assert.equal(m.namespace,ticket.namespace);assert.equal(m.sequence,ticket.sequence);
  for(const[file,key]of[['database.dump','databaseSha256'],['objects.tar','objectArchiveSha256'],['release-source.tar.gz','releaseSourceSha256']])assert.equal(hash(readFileSync(recovered+'/'+file)),m[key]);
  const unpack=folder+'/objects';mkdirSync(unpack,{mode:0o700});const listing=spawnSync('/usr/bin/tar',['-tf',recovered+'/objects.tar'],{encoding:'utf8'});assert.equal(listing.status,0);
  for(const p of listing.stdout.trim().split('\n'))assert.ok(!p.startsWith('/')&&!p.split('/').includes('..'));
  assert.equal(spawnSync('/usr/bin/tar',['-xf',recovered+'/objects.tar','-C',unpack]).status,0);
  for(const o of m.objects){const b=readFileSync(unpack+'/'+o.path);assert.equal(b.length,o.size);assert.equal(hash(b),o.sha256);}
  const verified=new Date().toISOString(),claims={version:1,kind:'continuous-backup',namespace:ticket.namespace,generation:ticket.generation,sourceId:ticket.sourceId,sourceBoot:ticket.sourceBoot,databaseBoot:ticket.databaseBoot,topology:ticket.topology,sequence:ticket.sequence,issuedAt:verified,expiresAt:new Date(Date.parse(ticket.captureStartedAt)+280000).toISOString(),captureStartedAt:ticket.captureStartedAt,captureStartedBootMs:ticket.captureStartedBootMs,captureCompletedAt:ticket.captureCompletedAt,offsiteVerifiedAt:verified,manifestSha256:ticket.manifestSha256,snapshotId:ticket.snapshotId,paired:true,authIncluded:true,paymentAndDeliveryIncluded:true,resticCheckPassed:true,remoteBytesReadBack:true,sourceArtifactsVerified:true,publicAccessDenied:true};
  const envelope=signProof(claims,privateKey);validateContinuousReceipt(envelope,publicKey,ticket);
  const report={project,bucket,sequence:ticket.sequence,encryptedObjects:objects.length,repositoryBytes:total,newUploadedBytes:uploaded,readbackBytes:total,objectsRestored:m.objects.length,verifiedAt:verified,captureAgeAtVerificationMs:Date.now()-Date.parse(ticket.captureStartedAt),sourceArtifactsVerified:true,productionChanged:false};
  writeFileSync(folder+'/offsite-result.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});writeFileSync(folder+'/receipt.json',JSON.stringify(envelope)+'\n',{mode:0o600});return{envelope,report};
}
