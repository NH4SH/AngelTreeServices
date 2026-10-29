// Full-read archive proof only. It cannot admit writes or certify an incremental
// chain. All bytes come from the independently controlled offsite bucket.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {join} from 'node:path';import {spawnSync} from 'node:child_process';
import {cloudLimits,sha256,validateInventory,inventoryIdentity} from './cloud-policy.mjs';
import {signProof} from './failover-proof.mjs';
import {inspectWalRecovery} from './wal-recovery-inspection.mjs';

export function createWalArchiveVerifier({namespace,scratchRoot,restic,resticSha256,password,privateKey,storage,ledger,now=()=>Date.now()}){
 let active=false;
 return async request=>{
  assert.equal(active,false);active=true;let work,phase='request';
  try{
   const began=now();assert.match(namespace,/^ats-rehearsal-continuous-[a-f0-9]{12}$/);
   assert.ok(['wal-archive','wal-delta-archive'].includes(request.operation));const delta=request.operation==='wal-delta-archive';
   assert.match(request.requestId,/^[a-f0-9-]{36}$/);const t=request.ticket;
   assert.match(t.sourceRunId,/^[a-f0-9]{12}$/);assert.match(t.snapshotId,/^[a-f0-9]{64}$/);assert.match(t.manifestSha256,/^[a-f0-9]{64}$/);
   assert.equal(t.capturePath,'/home/noelsierra.guest/candidate/'+(delta?'wal-independent-':'wal-paired-')+t.sourceRunId+(delta?'/delta':'/recovery'));
   const bodySha=sha256(JSON.stringify(request));assert.equal(sha256(readFileSync(restic)),resticSha256);
   phase='reserve';const reservation=await ledger({action:'reserve',namespace,requestId:request.requestId,bodySha,reserveBytes:cloudLimits.metadataReservationBytes});
   if(reservation.completed)return {envelope:signProof(reservation.claims,privateKey),report:reservation.report,replayed:true};
   phase='inventory';const inventory=validateInventory(await ledger({action:'inventory',namespace}));
   await ledger({action:'augment',namespace,requestId:request.requestId,bodySha,additionalBytes:Math.max(1,inventory.total)});
   work=join(scratchRoot,'wal-'+request.requestId);mkdirSync(work,{mode:0o700,recursive:true});const repo=join(work,'encrypted');mkdirSync(repo,{mode:0o700});
   phase='download';let downloadedBytes=0;
   for(let offset=0;offset<inventory.rows.length;offset+=4)await Promise.all(inventory.rows.slice(offset,offset+4).map(async o=>{
    assert.ok(now()-began<45000);const bytes=await storage.download(o.name,o.size);assert.equal(bytes.length,o.size);
    mkdirSync(join(repo,o.name,'..'),{recursive:true,mode:0o700});writeFileSync(join(repo,o.name),bytes,{mode:0o600});downloadedBytes+=bytes.length;
   }));
   assert.equal(inventoryIdentity(await ledger({action:'inventory',namespace})),inventoryIdentity(inventory.rows));
   assert.equal(await storage.publicDenied(),true);
   const secret=join(work,'password');writeFileSync(secret,password,{mode:0o600});
   function execute(args){const remaining=50000-(now()-began);assert.ok(remaining>0);const r=spawnSync(restic,['--repo',repo,'--password-file',secret,'--no-cache',...args],{
    env:{HOME:work,TMPDIR:work,PATH:'/usr/bin:/bin',GOMAXPROCS:'2',GOMEMLIMIT:'256MiB'},encoding:'utf8',timeout:Math.min(20000,remaining),maxBuffer:2*1024*1024});
    assert.equal(r.status,0,'Independent encrypted readback failed');return r.stdout;
   }
   phase='encrypted-readback';execute(['check','--read-data']);
   const snapshots=JSON.parse(execute(['snapshots','--json']));assert.equal(snapshots.length,1);assert.equal(snapshots[0].id,t.snapshotId);assert.deepEqual(snapshots[0].paths,[t.capturePath]);
   const stats=JSON.parse(execute(['stats',t.snapshotId,'--mode','restore-size','--json']));assert.ok(stats.total_size>0&&stats.total_size<=cloudLimits.restoredBytes&&stats.total_file_count<=1024);
   const restored=join(work,'restored');execute(['restore',t.snapshotId+':'+t.capturePath,'--target',restored,'--verify']);
   const {manifest:m,pairing,coverage,nativeBaseFilesVerified,walHeadersAndGzipVerified}=await inspectWalRecovery({restored,ticket:t,delta,began,onPhase:name=>phase=name});
   assert.ok(now()-began<50000);
   const verifiedAt=new Date(now()).toISOString(),claims={version:1,kind:'archive-verification',format:delta?'native-wal-independent-archive-v1':'native-pg-base-wal-paired-v1',namespace,
    sequence:m.sequence??1,captureStartedAt:m.captureStartedAt,snapshotId:t.snapshotId,manifestSha256:t.manifestSha256,
    issuedAt:verifiedAt,expiresAt:new Date(now()+60000).toISOString(),writeAdmission:false,systemIdentifier:m.systemIdentifier,timeline:m.timeline,targetLsn:m.targetLsn,
    remoteBytesReadBack:true,resticCheckPassed:true,publicAccessDenied:true,paired:!delta};
   const report={format:claims.format,downloadedBytes,reservedBytes:inventory.total+cloudLimits.metadataReservationBytes,durationMs:now()-began,
    nativeBaseFilesVerified,walHeadersAndGzipVerified,coverage,...pairing,
    walRecordsReplayedInCloud:false,receiptPermitsWrites:false,productionChanged:false};
   phase='commit';const result=await ledger({action:'finish',namespace,requestId:request.requestId,bodySha,inventory:inventory.rows,claims,report});
   return {envelope:signProof(result.claims,privateKey),report:result.report,replayed:false};
  }catch{throw Object.assign(Error('Native WAL archive verification withheld'),{phase});}
  finally{if(work)rmSync(work,{recursive:true,force:true});active=false;}
 };
}
