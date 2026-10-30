// One immutable, independently read component. Writer admission is a separate
// serialized operation, after every dependency's provider identity is checked.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';import {join} from 'node:path';import {spawnSync} from 'node:child_process';
import {sha256,validateInventory,inventoryIdentity,cloudLimits} from './cloud-policy.mjs';
import {inspectWalRecovery} from './wal-recovery-inspection.mjs';
import {backupSourceScope} from './backup-source-scope.mjs';

export function createNativeComponentVerifier({namespace,scratchRoot,restic,resticSha256,password,storage,ledger,beginVerification,now=()=>Date.now()}){
 let active=false;
 return async jobId=>{
  assert.match(jobId,/^[a-f0-9-]{36}$/);
  assert.equal(active,false,'Verifier busy');active=true;
  let work,phase='verification-lease';const began=now();
  try{
   const job=await beginVerification(jobId,false);assert.equal(job.namespace,namespace);assert.equal(job.jobId,jobId);
   const scope=backupSourceScope(job.binding);
   assert.equal(job.bucket,(scope.syntheticOnly?'crm-native-lab-':'crm-native-home-')+namespace.slice(-12));assert.equal(job.prefix,jobId+'/');
   if(job.completed)return {proof:job.proof,componentSha256:job.componentSha256,report:job.report,replayed:true};
   assert.equal(job.attempted,true);assert.ok(['base','delta'].includes(job.kind));const ticket=job.ticket;
   assert.equal(ticket.namespace,namespace);assert.deepEqual(ticket.binding,job.binding);assert.ok(Number.isSafeInteger(ticket.sequence)&&ticket.sequence>0);
   assert.equal(ticket.capturePath,`${scope.root}/native-${namespace.slice(-12)}/capture-${ticket.sequence}`);
   assert.equal(sha256(readFileSync(restic)),resticSha256);
   const rpc=(action,fields={})=>ledger({action,namespace,jobId,bodySha:job.bodySha,...fields});
   phase='inventory';const inventory=validateInventory(await rpc('inventory'));assert.equal(inventory.rows.length,job.objects.length);
   const expected=new Map(job.objects.map(o=>[o.name,o]));
   for(const object of inventory.rows)assert.equal(object.size,expected.get(object.name)?.size);
   work=join(scratchRoot,'component-'+jobId);mkdirSync(work,{recursive:true,mode:0o700});const repo=join(work,'encrypted');mkdirSync(repo,{mode:0o700});
   phase='download';let downloadedBytes=0;
   for(let n=0;n<inventory.rows.length;n+=4){
    const results=await Promise.allSettled(inventory.rows.slice(n,n+4).map(async o=>{
     assert.ok(now()-began<45000);const bytes=await storage.download(job.bucket,job.prefix+o.name,o.size);assert.equal(bytes.length,o.size);
     assert.equal(sha256(bytes),expected.get(o.name).sha256);mkdirSync(join(repo,o.name,'..'),{recursive:true,mode:0o700});writeFileSync(join(repo,o.name),bytes,{mode:0o600});downloadedBytes+=bytes.length;
    }));for(const result of results)if(result.status==='rejected')throw result.reason;
   }
   assert.equal(inventoryIdentity(await rpc('inventory')),inventoryIdentity(inventory.rows));assert.equal(await storage.publicDenied(job.bucket,job.prefix+'config'),true);
   const secret=join(work,'password');writeFileSync(secret,password,{mode:0o600});
   function execute(args){const remaining=50000-(now()-began);assert.ok(remaining>0);const r=spawnSync(restic,['--repo',repo,'--password-file',secret,'--no-cache',...args],{
    env:{HOME:work,TMPDIR:work,PATH:'/usr/bin:/bin',GOMAXPROCS:'2',GOMEMLIMIT:'256MiB'},encoding:'utf8',timeout:Math.min(20000,remaining),maxBuffer:2*1024*1024});assert.equal(r.status,0,'Native component readback failed');return r.stdout;}
   phase='encrypted-readback';execute(['check','--read-data']);const snapshots=JSON.parse(execute(['snapshots','--json']));assert.equal(snapshots.length,1);assert.equal(snapshots[0].id,ticket.snapshotId);assert.deepEqual(snapshots[0].paths,[ticket.capturePath]);
   const stats=JSON.parse(execute(['stats',ticket.snapshotId,'--mode','restore-size','--json']));assert.ok(stats.total_size>0&&stats.total_size<=cloudLimits.restoredBytes&&stats.total_file_count<=1024);
   const restored=join(work,'restored');execute(['restore',ticket.snapshotId+':'+ticket.capturePath,'--target',restored,'--verify']);
   const inspected=await inspectWalRecovery({restored,ticket,delta:job.kind==='delta',began,expectedBinding:job.binding,parentProof:job.parentProof,onPhase:name=>phase=name});
   assert.ok(now()-began<50000);const m=inspected.manifest;
   const proof={kind:'native-wal-component-v1',componentType:job.kind,jobId,binding:job.binding,snapshotId:ticket.snapshotId,manifestSha256:ticket.manifestSha256,
    targetLsn:m.targetLsn,baseManifestSha256:m.baseManifestSha256,databaseRuntimeSha256:m.databaseRuntimeSha256,privatePairSha256:inspected.privatePairSha256,
    completeRecoveryPackage:job.kind==='base',resticFullReadPassed:true,publicAccessDenied:true,writeAdmission:false,
    ...(job.binding.privateFileFormat==='patch-v1'?{fileIndex:inspected.fileIndex,fileIndexBytes:inspected.fileIndexBytes,fileIndexSha256:inspected.fileIndexSha256,staticPairSha256:inspected.staticPairSha256,
      privateFileStateVerified:true,...(job.kind==='delta'?{parentFileIndexSha256:inspected.parentFileIndexSha256}:{})}:{}),
    ...(job.kind==='delta'?{previousTargetLsn:m.previousTargetLsn,previousManifestSha256:m.previousManifestSha256}:{})};
   const report={downloadedBytes,durationMs:now()-began,nativeBaseFilesVerified:inspected.nativeBaseFilesVerified,walHeadersAndGzipVerified:inspected.walHeadersAndGzipVerified,
    receiptPermitsWrites:false,productionChanged:false};
   phase='commit';return {...await rpc('finish',{inventory:inventory.rows,proof,report}),replayed:false};
  }catch{throw Object.assign(Error('Native component verification withheld'),{phase});}
  finally{if(work)rmSync(work,{recursive:true,force:true});active=false;}
 };
}
