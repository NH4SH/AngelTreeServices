// Independent, bounded, synthetic-only worker. All storage/ledger I/O is injected.
// Encrypted cache reuse requires both verified bytes and a fresh object version.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,rmSync,existsSync,lstatSync,readdirSync,renameSync,createReadStream} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createPublicKey} from 'node:crypto';
import {cloudLimits,sha256,validateInventory,inventoryIdentity,validateCloudRequest,retentionPreview} from './cloud-policy.mjs';
import {signProof} from './failover-proof.mjs';
import {validateContinuousReceipt} from './continuous-policy.mjs';
import {verifyPrivateArchive} from './cloud-archive.mjs';
import {restoreDatabaseParts} from './database-parts.mjs';
import {validateRuntimeBlueprint} from './runtime-blueprint.mjs';

export function createCloudVerifier({namespace,cacheRoot,restic,resticSha256,password,privateKey,storage,ledger,onVerifiedRepository,now=()=>Date.now()}){
  const verifiedCache=new Map();let active=false;
  return async request=>{
    if(active)throw Error('Local verifier busy');active=true;
    let work,phase='request';
    try{
      const began=now(),ticket=validateCloudRequest(request,namespace,began),bodySha=sha256(JSON.stringify(request));
      assert.equal(sha256(readFileSync(restic)),resticSha256,'Untrusted Restic binary');
      phase='reserve';
      // Reserve metadata before even reading inventory. Denied and failed jobs
      // stay charged, so repeated failures cannot bypass the transfer cap.
      const reserved=await ledger({action:'reserve',namespace,requestId:request.requestId,bodySha,reserveBytes:cloudLimits.metadataReservationBytes});
      if(reserved.completed)return {envelope:signProof(reserved.claims,privateKey),report:reserved.report,replayed:true};
      phase='inventory';
      const initial=validateInventory(await ledger({action:'inventory',namespace}));
      const identity=inventoryIdentity(initial.rows),repo=join(cacheRoot,'encrypted');mkdirSync(repo,{recursive:true,mode:0o700});
      const needed=[];let cacheBytes=0;
      for(const object of initial.rows){
        const path=join(repo,object.name),known=verifiedCache.get(object.name);
        // Existing admission policy requires a fresh full remote readback.
        // Cache savings are available for archive audits, never write permits.
        if(request.mode==='archive'&&request.forceRemoteRead!==true&&known&&known.id===object.id&&known.version===object.version&&known.size===object.size&&existsSync(path)&&
          lstatSync(path).isFile()&&!lstatSync(path).isSymbolicLink()&&sha256(readFileSync(path))===known.sha256)cacheBytes+=object.size;
        else needed.push(object);
      }
      // No refunds: failures, timeouts and lost responses remain charged.
      const reservedBytes=needed.reduce((n,o)=>n+o.size,cloudLimits.metadataReservationBytes);
      if(reservedBytes>cloudLimits.metadataReservationBytes)await ledger({action:'augment',namespace,requestId:request.requestId,bodySha,additionalBytes:reservedBytes-cloudLimits.metadataReservationBytes});
      phase='download';
      const current=new Set(initial.rows.map(o=>o.name));
      // Only remove stale local cache entries, never cloud objects.
      function clearStale(dir,prefix=''){
        for(const entry of readdirSync(dir,{withFileTypes:true})){
          const name=prefix+entry.name,path=join(dir,entry.name);
          assert.ok(!entry.isSymbolicLink());
          if(entry.isDirectory())clearStale(path,name+'/');else if(!current.has(name))rmSync(path);
        }
      }
      clearStale(repo);
      const observed=new Map();let downloadedBytes=0;
      for(let offset=0;offset<needed.length;offset+=4)await Promise.all(needed.slice(offset,offset+4).map(async object=>{
        assert.ok(now()-began<45000,'Cloud verification deadline exceeded');
        const bytes=await storage.download(object.name,object.size);assert.equal(bytes.length,object.size);
        const path=join(repo,object.name);mkdirSync(join(path,'..'),{recursive:true,mode:0o700});
        writeFileSync(path+'.new',bytes,{mode:0o600});renameSync(path+'.new',path);
        observed.set(object.name,{...object,sha256:sha256(bytes)});downloadedBytes+=bytes.length;
      }));
      assert.equal(inventoryIdentity(await ledger({action:'inventory',namespace})),identity,'Remote object version changed');
      assert.equal(await storage.publicDenied(),true,'Backup public access was not denied');
      work=join(cacheRoot,'work-'+request.requestId);mkdirSync(work,{mode:0o700});
      const secret=join(work,'password');writeFileSync(secret,password,{mode:0o600});
      function execute(args,{binary=false,maxBuffer=2*1024*1024}={}){
        const remaining=50000-(now()-began);assert.ok(remaining>0,'Cloud verification deadline exceeded');
        const result=spawnSync(restic,['--repo',repo,'--password-file',secret,'--no-cache',...args],{
          env:{HOME:work,TMPDIR:work,PATH:'/usr/bin:/bin',GOMAXPROCS:'2',GOMEMLIMIT:'256MiB'},encoding:binary?undefined:'utf8',
          timeout:Math.min(20000,remaining),maxBuffer});
        assert.equal(result.status,0,'Independent Restic operation failed');return result.stdout;
      }
      phase='restic-readback';execute(['check','--read-data']);
      const snapshots=JSON.parse(execute(['snapshots','--json']));
      const chosen=snapshots.find(s=>s.id===ticket.snapshotId);assert.ok(chosen,'Requested snapshot absent');assert.deepEqual(chosen.paths,[ticket.capturePath]);
      const stats=JSON.parse(execute(['stats',ticket.snapshotId,'--mode','restore-size','--json']));
      assert.ok(stats.total_size>0&&stats.total_size<=cloudLimits.restoredBytes&&stats.total_file_count<=1024,'Restore exceeds scratch budget');
      const recovered=join(work,'recovered');execute(['restore',ticket.snapshotId+':'+ticket.capturePath,'--target',recovered,'--verify']);
      phase='paired-manifest';const manifestBytes=readFileSync(join(recovered,'manifest.private.json'));assert.ok(manifestBytes.length<=1024*1024);
      assert.equal(sha256(manifestBytes),ticket.manifestSha256);const manifest=JSON.parse(manifestBytes);
      assert.equal(manifest.syntheticOnly,true);assert.equal(manifest.namespace,namespace);assert.equal(manifest.sequence,ticket.sequence);
      assert.ok(request.mode==='archive'||manifest.backupLayout===undefined,'A split recovery component cannot issue a legacy write receipt');
      for(const key of ['captureStartedAt','captureStartedBootMs','captureCompletedAt'])assert.equal(manifest[key],ticket[key]);
      for(const key of ['sourceId','sourceBoot','databaseBoot','generation','topology'])assert.equal(manifest.binding[key],ticket[key]);
      if(manifest.binding.sourceScope==='crm-v1'){
        const runtime=manifest.runtimeFormat==='artifact-v1'?JSON.parse(readFileSync(join(recovered,'runtime.private.json'))):manifest.runtime;
        assert.equal(validateRuntimeBlueprint(runtime,{complete:true}),manifest.runtimeSha256);
      }
      if(manifest.databaseParts)restoreDatabaseParts(recovered,manifest.databaseParts);
      for(const [file,key] of [['database.dump','databaseSha256'],['objects.tar','objectArchiveSha256'],['release-source.tar.gz','releaseSourceSha256']]){
        const path=join(recovered,file);assert.ok(lstatSync(path).isFile()&&!lstatSync(path).isSymbolicLink());assert.equal(sha256(readFileSync(path)),manifest[key]);
      }
      for(const file of ['core.private.env','app.private.env'])assert.ok(lstatSync(join(recovered,file)).isFile()&&!lstatSync(join(recovered,file)).isSymbolicLink());
      for(const table of ['auth.users','public.payments','public.invoices','public.email_events','app_private.outbound_delivery_requests','app_private.outbound_delivery_attempts'])assert.ok(manifest.database.tables.some(t=>t.name===table),'Paired recovery manifest is incomplete');
      assert.ok(Array.isArray(manifest.objects)&&manifest.objects.length<=512);
      assert.ok(manifest.objects.reduce((sum,o)=>sum+o.size,0)<=cloudLimits.restoredBytes,'Private file corpus exceeds scratch budget');
      await verifyPrivateArchive(createReadStream(join(recovered,'objects.tar')),manifest.objects,{deadline:began+45000});
      const supplemental=onVerifiedRepository&&cacheBytes===0?await onVerifiedRepository({repo,recovered,inventory:initial.rows,ticket,manifest,execute}):undefined;
      assert.ok(now()-began<50000,'Cloud verification deadline exceeded');
      const verifiedAt=new Date(now()).toISOString(),claims={version:1,kind:request.mode==='continuous'?'continuous-backup':'archive-verification',
        ...Object.fromEntries(['namespace','generation','sourceId','sourceBoot','databaseBoot','topology','sequence','captureStartedAt','captureStartedBootMs','captureCompletedAt','manifestSha256','snapshotId'].map(k=>[k,ticket[k]])),
        issuedAt:verifiedAt,expiresAt:new Date(request.mode==='continuous'?Date.parse(ticket.captureStartedAt)+280000:now()+60000).toISOString(),offsiteVerifiedAt:verifiedAt,
        paired:true,authIncluded:true,paymentAndDeliveryIncluded:true,resticCheckPassed:true,remoteBytesReadBack:cacheBytes===0,sourceArtifactsVerified:true,publicAccessDenied:true,
        verificationMode:cacheBytes===0?'fresh-full-remote-readback':'full-local-read-with-fresh-remote-object-versions',inventorySha256:identity};
      if(request.mode==='continuous')validateContinuousReceipt(signProof(claims,privateKey),createPublicKey(privateKey),ticket,now());
      const history=await ledger({action:'status',namespace}),verifiedRoots=new Set(history.roots.map(r=>r.snapshot_id));verifiedRoots.add(ticket.snapshotId);
      const report={mode:request.mode,objects:initial.rows.length,repositoryBytes:initial.total,downloadedBytes,cacheBytes,reservedBytes,
        durationMs:now()-began,privateFiles:manifest.objects.length,resticFullReadPassed:true,restored:true,receiptPermitsWrites:request.mode==='continuous',
        retention:retentionPreview(snapshots.map(s=>({snapshotId:s.id,captureStartedAt:s.time,verified:verifiedRoots.has(s.id)})),{now:now()}),...(supplemental?{supplemental}:{}),productionChanged:false};
      phase='commit';const result=await ledger({action:'finish',namespace,requestId:request.requestId,bodySha,inventory:initial.rows,claims,report});
      for(const o of initial.rows)if(observed.has(o.name))verifiedCache.set(o.name,observed.get(o.name));
      return {envelope:signProof(result.claims,privateKey),report:result.report,replayed:false};
    }catch{throw Object.assign(Error('Cloud verification withheld'),{phase});}
    finally{if(work)rmSync(work,{recursive:true,force:true});active=false;}
  };
}
