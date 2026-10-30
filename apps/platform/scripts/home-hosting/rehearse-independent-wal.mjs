// Measure the genuine captured cleanup transaction as a small independent
// encrypted repository. Existing snapshots/DBs remain untouched. No admission.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,readdirSync,statSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {CandidateIO,digest} from './candidate-io.mjs';
import {validateWalSegment,walSegmentNumber} from './wal-archive-policy.mjs';
assert.equal(process.env.ATS_INDEPENDENT_WAL_REHEARSAL,'1');
const [sourceId,id]=process.argv.slice(2);for(const v of [sourceId,id])assert.match(v,/^[a-f0-9]{12}$/);
process.env.HOME_FAILOVER_REHEARSAL='1';process.env.ATS_FAILOVER_RUN_ID=id;
const io=new CandidateIO();io.folder=io.root+'/wal-independent-'+id;mkdirSync(io.folder,{mode:0o700});
await io.ready();io.assertSource();
const origin=io.root+'/wal-rehearsal-'+sourceId,result=JSON.parse(readFileSync(origin+'/result.json'));
assert.equal(result.syntheticOnly,true);assert.equal(result.productionChanged,false);assert.equal(result.checkpoints.length,2);
const binary=io.root+'/recovery-tools/restic_0.19.1_linux_arm64';assert.equal(digest(readFileSync(binary)),'2fb45ac6f9071b6f20eb883953a188f9e7c7cb6bbe43c67a2e47ada4e85ee7f0');
const original=args=>io.run(binary,['--repo',origin+'/encrypted-repository','--password-file',origin+'/password.private','--no-cache',...args],{timeout:120000}).stdout;
const manifests=[];
for(const checkpoint of result.checkpoints){
 const dir=io.folder+'/checkpoint-'+checkpoint.sequence;mkdirSync(dir,{mode:0o700});
 original(['restore',checkpoint.snapshotId+':'+origin+'/recovery','--target',dir,'--verify']);
 assert.equal(digest(readFileSync(dir+'/checkpoint.private.json')),checkpoint.manifestSha256);
 manifests.push(JSON.parse(readFileSync(dir+'/checkpoint.private.json')));
}
const [first,last]=manifests;
for(const key of ['sourceId','sourceDbImage','systemIdentifier','timeline','databaseBoot','baseManifestSha256'])assert.equal(first[key],last[key]);
const before=walSegmentNumber(first.targetWalFile,first.timeline),through=walSegmentNumber(last.targetWalFile,last.timeline);
assert.ok(through>before&&through-before<=128n);
const delta=io.folder+'/delta';mkdirSync(delta,{mode:0o700});mkdirSync(delta+'/wal',{mode:0o700});
const files=[];
for(const file of readdirSync(io.folder+'/checkpoint-2/wal')){
 assert.match(file,/^[0-9A-F]{24}\.gz$/);const name=file.slice(0,-3),n=walSegmentNumber(name,last.timeline);
 if(n<=before||n>through)continue;
 const bytes=readFileSync(io.folder+'/checkpoint-2/wal/'+file);validateWalSegment(bytes,name,last);
 copyFileSync(io.folder+'/checkpoint-2/wal/'+file,delta+'/wal/'+file);files.push({name,size:bytes.length,sha256:digest(bytes)});
}
assert.equal(files.length,Number(through-before));
const manifest={version:1,syntheticOnly:true,format:'native-wal-independent-archive-v1',sourceId:last.sourceId,
 sourceDbImage:last.sourceDbImage,systemIdentifier:last.systemIdentifier,timeline:last.timeline,
 previousManifestSha256:result.checkpoints[0].manifestSha256,baseManifestSha256:last.baseManifestSha256,
 previousTargetLsn:first.targetLsn,targetLsn:last.targetLsn,targetWalFile:last.targetWalFile,files,
 captureStartedAt:last.captureStartedAt,captureStartedBootMs:last.captureStartedBootMs,database:last.database,writeAdmission:false};
writeFileSync(delta+'/manifest.private.json',JSON.stringify(manifest),{mode:0o600});
const password=io.folder+'/password.private';writeFileSync(password,randomBytes(48).toString('base64'),{mode:0o600,flag:'wx'});
const repo=io.folder+'/encrypted-repository',restic=args=>io.run(binary,['--repo',repo,'--password-file',password,'--no-cache',...args],{timeout:120000}).stdout;
const started=Date.now();restic(['init','--repository-version','2']);const output=restic(['backup','--json','--compression','max','--pack-size','8',delta]);restic(['check','--read-data']);
const summary=output.trim().split('\n').map(s=>JSON.parse(s)).find(s=>s.message_type==='summary');
const restored=io.folder+'/independent-restored';mkdirSync(restored,{mode:0o700});restic(['restore',summary.snapshot_id+':'+delta,'--target',restored,'--verify']);
assert.equal(digest(readFileSync(restored+'/manifest.private.json')),digest(readFileSync(delta+'/manifest.private.json')));
for(const file of files){const bytes=readFileSync(restored+'/wal/'+file.name+'.gz');assert.equal(bytes.length,file.size);assert.equal(digest(bytes),file.sha256);validateWalSegment(bytes,file.name,last);}
let encryptedBytes=0,objects=0;function walk(dir){for(const e of readdirSync(dir,{withFileTypes:true})){assert.ok(!e.isSymbolicLink());if(e.isDirectory())walk(dir+'/'+e.name);else{encryptedBytes+=statSync(dir+'/'+e.name).size;objects++;}}}walk(repo);
const report={syntheticOnly:true,format:manifest.format,sourceTrialId:sourceId,nativeCapturedTransaction:true,
 walSegments:files.length,compressedWalBytes:files.reduce((n,f)=>n+f.size,0),encryptedBytes,encryptedObjects:objects,
 encryptedMonthlyPayloadBytes:encryptedBytes*720*31,durationMs:Date.now()-started,snapshotId:summary.snapshot_id,
 manifestSha256:digest(readFileSync(delta+'/manifest.private.json')),encryptedFullReadAndRestorePassed:true,
 completeRecoveryPackage:false,cloudVerified:false,receiptPermitsWrites:false,productionChanged:false};
io.json('result.json',report);console.log(JSON.stringify(report));
