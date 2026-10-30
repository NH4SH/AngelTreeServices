import {acquireCaptureLock,cleanupCapture} from './capture-attempt-lock.mjs';
// Online synthetic candidate producer. Not a production installer. File and
// database state share an explicit transaction barrier; no app session is killed.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync,copyFileSync,renameSync,readdirSync,statSync,createReadStream} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {digest,literal} from './candidate-io.mjs';
import {captureWalStatic,captureOnlineWalPair,verifyWalPair,walStaticDescriptor} from './wal-pairing.mjs';
import {captureReferencedObjectFilePatch,referencedObjectPaths,fileIndexFromInventory} from './referenced-object-files.mjs';
import {canonicalFileIndex,nativeFileStaticIdentity,nativeFileRecoveryIdentity,verifyNativeFilePatchArchive} from './native-file-patch.mjs';
import {captureDatabaseRuntime,nativeRecoveryIdentity,validateDatabaseRuntime} from './database-runtime.mjs';
import {openOnlineTableBarrier} from './online-table-barrier.mjs';
import {validateNativeWalReceipt} from './native-wal-checkpoint.mjs';import {walLsn,walSegmentNumber,validateWalSegment} from './wal-archive-policy.mjs';
import {onlineBackupSourceScope} from './backup-source-scope.mjs';

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export async function captureOnlineNativeCandidate(io,binding,sequence){
 const scope=onlineBackupSourceScope(io);assert.equal(binding.captureMode,'transaction-barrier');
 assert.equal(binding.admissionProtocol,'certified-native-wal-v1');assert.equal(binding.sourceScope,'crm-v1');
 assert.ok(binding.privateFileFormat===undefined||binding.privateFileFormat==='patch-v1');const fileMode=binding.privateFileFormat==='patch-v1';
 assert.equal(io.folder,io.root+'/native-'+io.id);assert.ok(Number.isSafeInteger(sequence)&&sequence>0);
 io.assertSource();assert.equal(io.inspect(io.db).Image,binding.sourceDbImage);
 assert.equal(io.sql('select pg_postmaster_start_time()::text;'),binding.databaseBoot);
 let previous,previousManifest;
 if(existsSync(io.folder+'/active.json')){
  const active=JSON.parse(readFileSync(io.folder+'/active.json'));previous=validateNativeWalReceipt(active.envelope,readFileSync(io.folder+'/authority-public.pem'),binding);
  assert.equal(sequence,previous.sequence+1);const bytes=readFileSync(io.folder+'/manifests/'+previous.manifestSha256+'.json');assert.equal(digest(bytes),previous.manifestSha256);previousManifest=JSON.parse(bytes);
 }else assert.equal(sequence,1);
 const startedAt=new Date().toISOString(),startedBootMs=Number(readFileSync('/proc/uptime','utf8').split(' ')[0])*1000;
 const lock=acquireCaptureLock(io.folder,{sequence,sourceBoot:binding.sourceBoot});
 let barrier,restoreHba,captureFailure;
 try{
 const out=io.folder+'/capture-'+sequence,repo=io.folder+'/repository-'+sequence,attempt=randomBytes(6).toString('hex');
 // Holding earlier failed artifacts is safe even if their original request is
 // reconciled later: parent lookup uses the signed manifest digest, not a path.
 if(existsSync(out)||existsSync(repo)){
  const held=io.folder+'/held-'+sequence+'-'+attempt;mkdirSync(held,{mode:0o700});
  for(const [path,name] of [[out,'capture'],[repo,'repository']])if(existsSync(path))renameSync(path,held+'/'+name);
 }
 mkdirSync(out,{mode:0o700});const evidence=io.folder+'/evidence-'+sequence+'-'+attempt;mkdirSync(evidence,{mode:0o700});
 assert.equal(io.sql('select hosting_guard.catalog_fingerprint();'),binding.topology);
 const hba=io.sql('show hba_file;');assert.match(hba,/^\/etc\/postgresql(?:-custom)?\/pg_hba\.conf$/);
 const originalHba=io.docker(['exec',io.db,'cat',hba]);writeFileSync(evidence+'/pg_hba.original.private.conf',originalHba,{mode:0o600});
 const writeHba=bytes=>{io.docker(['exec','-i',io.db,'sh','-c','cat > "$1"','sh',hba],{input:bytes});assert.equal(io.sql('select pg_reload_conf();'),'t');};
 const slot='ats_native_'+io.id,receiver='ats_crm_recovery_'+io.id+'-wal-receiver',walDir=io.folder+'/receiver-wal';
 restoreHba=()=>writeHba(originalHba);
  const collections={},runtimeSha256=captureWalStatic(io,out,io.folder+'/release-source-scoped.tar.gz',collections);
  const staticState={collections,runtimeSha256};
  const databaseRuntime=captureDatabaseRuntime(io,{hbaOverride:originalHba}),databaseRuntimeSha256=validateDatabaseRuntime(databaseRuntime,binding.sourceDbImage);
  assert.equal(io.sql('show full_page_writes;'),'on');assert.equal(io.sql('show wal_level;'),'logical');
  assert.equal(Number(io.sql("select count(*) from pg_replication_slots where slot_name<>"+literal(slot))),0,'Unknown replication slot');
  mkdirSync(walDir,{recursive:true,mode:0o700});io.env.PGPASSWORD=io.config.pg;
  const pgEnv=application=>['--env','PGHOST=127.0.0.1','--env','PGPORT=5432','--env','PGUSER=supabase_admin','--env','PGPASSWORD','--env','PGAPPNAME='+application];
  const common=['--network','container:'+io.db,'--read-only','--user','0:0','--cap-drop','ALL','--security-opt','no-new-privileges:true','--pids-limit','64','--memory','512m','--memory-swap','512m','--cpus','1','--ulimit','core=0:0','--tmpfs','/tmp:size=16m,mode=0700','--mount','type=bind,src='+io.folder+',dst=/output'];
  writeHba('# Native online rehearsal '+io.id+'\nhost replication supabase_admin 127.0.0.1/32 scram-sha-256\n'+originalHba);await sleep(200);
  if(!Number(io.sql('select count(*) from pg_replication_slots where slot_name='+literal(slot))))io.sql('select slot_name from pg_create_physical_replication_slot('+literal(slot)+',true);');
  const receiverInspect=io.run('/usr/bin/docker',['inspect',receiver],{allowFailure:true});
  if(receiverInspect.status!==0)io.docker(['run','--detach','--name',receiver,'--label','ats-purpose=synthetic-native-continuous',...common,...pgEnv('ATS_NATIVE_RECEIVER_'+io.id),
   '--entrypoint','pg_receivewal',binding.sourceDbImage,'--no-password','--no-loop','--synchronous','--status-interval=1','--slot='+slot,'--directory=/output/receiver-wal','--compress=gzip:6']);
  else{const info=JSON.parse(receiverInspect.stdout)[0];assert.equal(info.Config.Labels['ats-purpose'],'synthetic-native-continuous');assert.equal(info.State.Running,true);}
  for(let n=0;;n++){assert.ok(n<60,'Native receiver unavailable');if(Number(io.sql("select count(*) from pg_stat_replication where application_name="+literal('ATS_NATIVE_RECEIVER_'+io.id)))===1)break;await sleep(100);}
  let baseManifestSha256=previousManifest?.baseManifestSha256,firstSegment;
  const takeBase=()=>{
   io.docker(['run','--rm',...common,...pgEnv('ATS_NATIVE_CAPTURE_'+io.id),'--entrypoint','pg_basebackup',binding.sourceDbImage,
    '--no-password','--pgdata=/output/capture-'+sequence+'/base','--format=tar','--compress=gzip:6','--wal-method=stream','--checkpoint=fast','--manifest-checksums=SHA256','--no-clean'],{timeout:120000});
   const bytes=readFileSync(out+'/base/backup_manifest'),base=JSON.parse(bytes);assert.equal(bytes.toString().match(/"System-Identifier"\s*:\s*([0-9]+)/)?.[1],binding.systemIdentifier);
   baseManifestSha256=digest(bytes);assert.equal(base['WAL-Ranges'].length,1);firstSegment=(walLsn(base['WAL-Ranges'][0]['End-LSN'])-1n)/16777216n;
  };
  let kind=!previous||Date.now()-Date.parse(previous.fullVerifiedAt)>=23*3600000?'base':'delta';
  if(kind==='base')takeBase();
  const parentIndex=fileMode&&previousManifest?canonicalFileIndex(previousManifest.fileIndex??previousManifest.filePatch?.current):undefined;
  const staticDescriptor=walStaticDescriptor(out,collections,runtimeSha256,{expectedBinding:binding,verifiedProfile:io.recoveryProfile});
  const pairAtBarrier=async()=>{
   barrier=await openOnlineTableBarrier(io);const references=await barrier.objects();
   if(fileMode&&kind==='delta'){
    const {patch,index}=captureReferencedObjectFilePatch(io,out,references,parentIndex);
    const staticPairSha256=nativeFileStaticIdentity(staticDescriptor,databaseRuntimeSha256,{expectedBinding:binding,verifiedProfile:io.recoveryProfile});
    return {patch,index,staticPairSha256,privatePairSha256:nativeFileRecoveryIdentity(staticPairSha256,index)};
   }
   const pair=captureOnlineWalPair(io,out,references,staticState);
   if(fileMode){const index=fileIndexFromInventory(pair.collections.objects,referencedObjectPaths(references,io.config.id,{expectedBinding:io.productionBinding}));
    const staticPairSha256=nativeFileStaticIdentity(pair,databaseRuntimeSha256,{expectedBinding:binding,verifiedProfile:io.recoveryProfile});
    return {pair,index,staticPairSha256,privatePairSha256:nativeFileRecoveryIdentity(staticPairSha256,index)};}
   return {pair,privatePairSha256:nativeRecoveryIdentity(pair.pairingSha256,databaseRuntimeSha256)};
  };
  let {pair,index,patch,staticPairSha256,privatePairSha256}=await pairAtBarrier();
  if(kind==='delta'&&(fileMode?staticPairSha256!==previousManifest.staticPairSha256:privatePairSha256!==previous.privatePairSha256)){
   await barrier.abort();barrier=undefined;
   const name=fileMode?'objects.patch.tar':'objects.tar';renameSync(out+'/'+name,evidence+'/probe-'+name);
   if(existsSync(out+'/'+name+'.private.log'))renameSync(out+'/'+name+'.private.log',evidence+'/probe-'+name+'.private.log');
   kind='base';takeBase();({pair,index,patch,staticPairSha256,privatePairSha256}=await pairAtBarrier());
  }
  if(kind==='delta')firstSegment=walSegmentNumber(previousManifest.targetWalFile,binding.timeline)+1n;
  const cutoff=await barrier.capture(),barrierTimings=await barrier.finish();barrier=undefined;
  const {manifest:database,targetLsn,through,targetWalFile}=cutoff;
  if(fileMode&&kind==='delta')await verifyNativeFilePatchArchive(createReadStream(out+'/objects.patch.tar'),parentIndex,patch);
  else await verifyWalPair(out,pair,{objectsIndex:fileMode?index:undefined,expectedBinding:io.productionBinding});
  for(const name of ['objects.tar','objects.patch.tar','db-config.tar'])if(existsSync(out+'/'+name+'.private.log'))renameSync(out+'/'+name+'.private.log',evidence+'/'+name+'.private.log');
  for(let n=0;;n++){assert.ok(n<80,'Completed native segment unavailable');const flushed=io.sql('select coalesce(bool_and(flush_lsn>='+literal(through)+'::pg_lsn),false) from pg_stat_replication where application_name='+literal('ATS_NATIVE_RECEIVER_'+io.id)+';');
   if(existsSync(walDir+'/'+targetWalFile+'.gz')&&flushed==='t')break;await sleep(100);}
  const lastSegment=walSegmentNumber(targetWalFile,binding.timeline);assert.ok(lastSegment>=firstSegment&&lastSegment-firstSegment<128n);
  mkdirSync(out+'/wal',{mode:0o700});const files=[];
  for(const file of readdirSync(walDir)){if(!/^[A-F0-9]{24}\.gz$/.test(file))continue;const name=file.slice(0,-3),number=walSegmentNumber(name,binding.timeline);if(number<firstSegment||number>lastSegment)continue;
   const bytes=readFileSync(walDir+'/'+file);validateWalSegment(bytes,name,binding);copyFileSync(walDir+'/'+file,out+'/wal/'+file);files.push({name,size:bytes.length,sha256:digest(bytes)});}
  assert.equal(files.length,Number(lastSegment-firstSegment+1n));assert.equal(io.sql('select hosting_guard.catalog_fingerprint();'),binding.topology);
  const manifest={version:1,syntheticOnly:scope.syntheticOnly,namespace:binding.namespace,binding,sequence,sourceId:binding.sourceId,sourceDbImage:binding.sourceDbImage,
   sourceMigrationCount:102,systemIdentifier:binding.systemIdentifier,timeline:binding.timeline,databaseBoot:binding.databaseBoot,
   targetLsn,targetWalFile,baseManifestSha256,privatePairSha256,databaseRuntimeSha256,captureStartedAt:startedAt,captureStartedBootMs:startedBootMs,captureCompletedAt:new Date().toISOString(),database,barrierTimings,
   writeAdmissionIssued:false,
   ...(fileMode?{staticPairSha256}:{}),
   ...(kind==='base'?{pair,databaseRuntime,privateFilesPaired:true,...(fileMode?{fileIndex:index}:{})}:{format:fileMode?'native-wal-file-delta-v1':'native-wal-independent-archive-v1',writeAdmission:false,previousTargetLsn:previous.targetLsn,previousManifestSha256:previous.manifestSha256,files,
    ...(fileMode?{filePatch:patch,patchArchive:{size:statSync(out+'/objects.patch.tar').size,sha256:digest(readFileSync(out+'/objects.patch.tar'))}}:{})})};
  if(kind==='delta'){
   // The independently certified base owns these unchanged inputs. Keep the
   // just-checked copies as evidence; the delta transports only new native WAL.
   for(const name of Object.keys(fileMode?staticDescriptor.artifacts:pair.artifacts))renameSync(out+'/'+name,evidence+'/'+name);
  }
  const manifestName=kind==='base'?'checkpoint.private.json':'manifest.private.json',bytes=Buffer.from(JSON.stringify(manifest));writeFileSync(out+'/'+manifestName,bytes,{mode:0o600});
  mkdirSync(io.folder+'/manifests',{recursive:true,mode:0o700});const manifestSha256=digest(bytes),saved=io.folder+'/manifests/'+manifestSha256+'.json';
  if(existsSync(saved))assert.equal(digest(readFileSync(saved)),manifestSha256);else writeFileSync(saved,bytes,{mode:0o600,flag:'wx'});
  // Initialization starts closed with this capture flag set. Clear it only for
  // the first completed capture; admission is still withheld until the cloud
  // authority independently verifies it. Later online captures never override
  // an operator's maintenance state.
  if(!previous)io.sql('update hosting_guard.state set capture_in_progress=false where singleton;');
  const restic=io.root+'/recovery-tools/restic_0.19.1_linux_arm64';assert.equal(digest(readFileSync(restic)),'2fb45ac6f9071b6f20eb883953a188f9e7c7cb6bbe43c67a2e47ada4e85ee7f0');
  const run=args=>io.run(restic,['--repo',repo,'--password-file',io.folder+'/recovery-password.private','--no-cache',...args],{timeout:120000}).stdout;
  run(['init','--repository-version','2']);const output=run(['backup','--json','--compression','max','--pack-size','8',out]);run(['check','--read-data']);
  const summary=output.trim().split('\n').map(s=>JSON.parse(s)).find(s=>s.message_type==='summary');
  const ticket={namespace:binding.namespace,binding,sequence,parentJobId:previous?.jobId??null,capturePath:out,snapshotId:summary.snapshot_id,manifestSha256,
   captureStartedAt:startedAt,captureStartedBootMs:startedBootMs,captureCompletedAt:manifest.captureCompletedAt,
   ...(fileMode?{fileIndexBytes:Buffer.byteLength(JSON.stringify(index))}:{})};
  io.json('ticket-'+sequence+'.json',ticket);let encryptedBytes=0;function count(dir){for(const e of readdirSync(dir,{withFileTypes:true})){assert.ok(!e.isSymbolicLink());if(e.isDirectory())count(dir+'/'+e.name);else encryptedBytes+=statSync(dir+'/'+e.name).size;}}count(repo);
  return {kind,ticket,repository:repo,encryptedBytes,writeAdmissionIssued:false,barrierTimings,productionChanged:false};
 }catch(error){
  captureFailure=error;throw error;
 }finally{
  await cleanupCapture({barrier,restoreHba,release:()=>lock.release(),utilityCleanupConfirmed:captureFailure?.archiveCleanupUnconfirmed!==true});
 }
}
