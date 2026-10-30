// Shared read-only inspection of a restored native recovery component.
import assert from 'node:assert/strict';
import {readFileSync,createReadStream,readdirSync,lstatSync} from 'node:fs';
import {join} from 'node:path';import {createGunzip} from 'node:zlib';
import {sha256} from './cloud-policy.mjs';import {verifyWalPair} from './wal-pairing.mjs';
import {verifyPrivateArchive} from './cloud-archive.mjs';
import {validateWalSegment,validateWalCoverage,validateWalDelta} from './wal-archive-policy.mjs';
import {readRecoveryFile} from './recovery-files.mjs';
import {validateDatabaseRuntime,nativeRecoveryIdentity} from './database-runtime.mjs';
import {canonicalFileIndex,nativeFileIndexSha256,nativeFileStaticIdentity,nativeFileRecoveryIdentity,verifyNativeFilePatchArchive} from './native-file-patch.mjs';
import {backupSourceScope} from './backup-source-scope.mjs';
import {assertManifestSourceInventory} from './recovery-profile-context.mjs';
export async function inspectWalRecovery({restored,ticket:t,delta,began,expectedBinding,parentProof,onPhase=()=>{}}){
 let phase;
   phase='paired-recovery';onPhase(phase);const bytes=readRecoveryFile(restored,delta?'manifest.private.json':'checkpoint.private.json',2*1024*1024);assert.equal(sha256(bytes),t.manifestSha256);
   const m=JSON.parse(bytes),scope=backupSourceScope(expectedBinding);assert.equal(m.version,1);assert.equal(m.syntheticOnly,scope.syntheticOnly);assert.equal(m.sourceId,scope.project);
   assertManifestSourceInventory(m.database,expectedBinding);
   const fileMode=expectedBinding?.privateFileFormat==='patch-v1';assert.ok(m.binding?.privateFileFormat===undefined||fileMode,'Explicit expected file format required');
   assert.match(m.sourceDbImage,/^sha256:[a-f0-9]{64}$/);
   if(expectedBinding){
    assert.deepEqual(m.binding,expectedBinding);assert.equal(m.namespace,expectedBinding.namespace);assert.equal(m.sequence,t.sequence);
    for(const name of ['captureStartedAt','captureStartedBootMs','captureCompletedAt'])assert.equal(m[name],t[name]);
    for(const name of ['sourceId','sourceDbImage','systemIdentifier','timeline'])assert.equal(m[name],expectedBinding[name]);
    if(delta){
     assert.ok(parentProof);assert.equal(m.previousManifestSha256,parentProof.manifestSha256);
     assert.equal(m.previousTargetLsn,parentProof.targetLsn);assert.equal(m.baseManifestSha256,parentProof.baseManifestSha256);
     if(fileMode)assert.equal(m.staticPairSha256,parentProof.staticPairSha256);
     else assert.equal(m.privatePairSha256,parentProof.privatePairSha256);
     assert.equal(m.databaseRuntimeSha256,parentProof.databaseRuntimeSha256);
    }
   }

   let pairing,coverage,nativeBaseFilesVerified=0,walHeadersAndGzipVerified=0,fileIndex;
   if(delta){
    phase='delta-coverage';onPhase(phase);coverage=validateWalDelta(m,{expectedBinding});
    const files=readdirSync(join(restored,'wal'));assert.deepEqual([...files].sort(),m.files.map(f=>f.name+'.gz').sort());
    for(const file of m.files){const path=join(restored,'wal',file.name+'.gz');assert.ok(lstatSync(path).isFile()&&!lstatSync(path).isSymbolicLink());
     const bytes=readRecoveryFile(restored,'wal/'+file.name+'.gz');assert.equal(bytes.length,file.size);assert.equal(sha256(bytes),file.sha256);validateWalSegment(bytes,file.name,m);}
    walHeadersAndGzipVerified=files.length;pairing={completeRecoveryPackage:false,parentRecoveryVerified:false};
    if(fileMode){
     assert.equal(nativeFileIndexSha256(parentProof.fileIndex),parentProof.fileIndexSha256);
     const patchBytes=readRecoveryFile(restored,'objects.patch.tar');assert.equal(patchBytes.length,m.patchArchive.size);assert.equal(sha256(patchBytes),m.patchArchive.sha256);
     await verifyNativeFilePatchArchive(createReadStream(join(restored,'objects.patch.tar')),parentProof.fileIndex,m.filePatch,{deadline:began+48000});
     fileIndex=canonicalFileIndex(m.filePatch.current);assert.equal(nativeFileRecoveryIdentity(m.staticPairSha256,fileIndex),m.privatePairSha256);
    }
   }else{
   assert.equal(m.sourceMigrationCount,102);assert.equal(m.privateFilesPaired,true);
   if(expectedBinding?.captureMode==='transaction-barrier'){
    assert.equal(m.pair.version,3);assert.equal(m.pair.captureMode,'transaction-barrier');assert.equal(m.writeAdmissionIssued,false);
    assert.equal(m.sourceWritesAdmitted,undefined);
   }else assert.equal(m.sourceWritesAdmitted,false);
   if(fileMode){fileIndex=canonicalFileIndex(m.fileIndex);assert.equal(nativeFileStaticIdentity(m.pair,m.databaseRuntimeSha256,{expectedBinding}),m.staticPairSha256);
    assert.equal(nativeFileRecoveryIdentity(m.staticPairSha256,fileIndex),m.privatePairSha256);}
   pairing=await verifyWalPair(restored,m.pair,{objectsIndex:fileIndex,expectedBinding});
   if(expectedBinding){
    assert.equal(validateDatabaseRuntime(m.databaseRuntime,m.sourceDbImage),m.databaseRuntimeSha256);
    if(!fileMode)assert.equal(nativeRecoveryIdentity(m.pair.pairingSha256,m.databaseRuntimeSha256),m.privatePairSha256);
   }
   const manifestBytes=readRecoveryFile(restored,'base/backup_manifest',4*1024*1024);assert.equal(sha256(manifestBytes),m.baseManifestSha256);
   assert.equal(manifestBytes.toString().match(/"System-Identifier"\s*:\s*([0-9]+)/)?.[1],m.systemIdentifier);
   const base=JSON.parse(manifestBytes);assert.equal(base['WAL-Ranges'].length,1);assert.ok(base.Files.length>0&&base.Files.length<=4096);
   const expected=base.Files.map(f=>{assert.equal(f['Checksum-Algorithm'],'SHA256');return {path:f.Path,size:f.Size,sha256:f.Checksum};});
   // Stream the native base archive, checking every file against pg_basebackup's
   // SHA256 inventory. No extraction, links, unknown paths or code execution.
   phase='native-base-files';onPhase(phase);const archivePath=join(restored,'base/base.tar.gz');assert.ok(lstatSync(archivePath).isFile()&&!lstatSync(archivePath).isSymbolicLink());const input=createReadStream(archivePath),gzip=createGunzip();input.pipe(gzip);
   try{await verifyPrivateArchive(gzip,expected,{deadline:began+48000,maximumFiles:4096});}finally{input.destroy();gzip.destroy();}
   phase='wal-coverage';onPhase(phase);const files=readdirSync(join(restored,'wal'));const names=files.map(f=>{assert.match(f,/^[A-F0-9]{24}\.gz$/);return f.slice(0,-3);});
   coverage=validateWalCoverage(names,base['WAL-Ranges'][0],m);
   for(const name of names){validateWalSegment(readRecoveryFile(restored,'wal/'+name+'.gz'),name,m);}
   nativeBaseFilesVerified=expected.length;walHeadersAndGzipVerified=names.length;
   }
 if(fileMode)assert.equal(Buffer.byteLength(JSON.stringify(fileIndex)),t.fileIndexBytes,'File index transfer was under-reserved');
 return {manifest:m,pairing,coverage,nativeBaseFilesVerified,walHeadersAndGzipVerified,
 ...(fileMode?{fileIndex,fileIndexBytes:Buffer.byteLength(JSON.stringify(fileIndex)),fileIndexSha256:nativeFileIndexSha256(fileIndex),staticPairSha256:m.staticPairSha256,privateFileStateVerified:true,
   ...(delta?{parentFileIndexSha256:parentProof.fileIndexSha256}:{})}:{}),
 privatePairSha256:expectedBinding?m.privatePairSha256:delta?m.privatePairSha256:m.pair.pairingSha256};
}
