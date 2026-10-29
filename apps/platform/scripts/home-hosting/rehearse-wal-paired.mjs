// Add the missing non-PGDATA recovery inputs to an existing closed WAL trial.
// No cloud upload, writer admission, source mutation or production installer.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,cpSync,readdirSync,statSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {CandidateIO,digest} from './candidate-io.mjs';
import {captureManifestSql} from './capture-manifest.mjs';
import {captureWalPair,verifyWalPair,assertClosedWalSource} from './wal-pairing.mjs';
assert.equal(process.env.ATS_WAL_PAIRED_REHEARSAL,'1');
const [sourceId,id]=process.argv.slice(2);for(const v of [sourceId,id])assert.match(v,/^[a-f0-9]{12}$/);
process.env.HOME_FAILOVER_REHEARSAL='1';process.env.ATS_FAILOVER_RUN_ID=id;
const io=new CandidateIO();io.folder=io.root+'/wal-paired-'+id;mkdirSync(io.folder,{mode:0o700});
await io.ready();assertClosedWalSource(io);
const origin=io.root+'/wal-rehearsal-'+sourceId,sourceResult=JSON.parse(readFileSync(origin+'/result.json'));
assert.equal(sourceResult.syntheticOnly,true);assert.equal(sourceResult.productionChanged,false);assert.equal(sourceResult.sourceDbImage,io.inspect(io.db).Image);
const sourceCheckpoint=sourceResult.checkpoints.at(-1),manifest=JSON.parse(readFileSync(origin+'/recovery/checkpoint.private.json'));
assert.equal(digest(readFileSync(origin+'/recovery/checkpoint.private.json')),sourceCheckpoint.manifestSha256);
assert.deepEqual(JSON.parse(io.sql(captureManifestSql)),manifest.database,'Retired source changed after its WAL cutoff');
const recovery=io.folder+'/recovery';cpSync(origin+'/recovery',recovery,{recursive:true,dereference:false,filter:path=>!path.endsWith('.partial')});
const release=io.root+'/continuous-9d56c5a2df31/release-source-scoped.tar.gz';
const pair=captureWalPair(io,recovery,release);await verifyWalPair(recovery,pair);
assert.deepEqual(JSON.parse(io.sql(captureManifestSql)),manifest.database);
manifest.pair=pair;manifest.privateFilesPaired=true;
writeFileSync(recovery+'/checkpoint.private.json',JSON.stringify(manifest),{mode:0o600});
const password=io.folder+'/password.private';writeFileSync(password,randomBytes(48).toString('base64'),{mode:0o600,flag:'wx'});
const binary=io.root+'/recovery-tools/restic_0.19.1_linux_arm64';assert.equal(digest(readFileSync(binary)),'2fb45ac6f9071b6f20eb883953a188f9e7c7cb6bbe43c67a2e47ada4e85ee7f0');
const repo=io.folder+'/encrypted-repository',restic=args=>io.run(binary,['--repo',repo,'--password-file',password,'--no-cache',...args],{timeout:120000}).stdout;
restic(['init','--repository-version','2']);const output=restic(['backup','--json','--compression','max','--pack-size','8',recovery]);restic(['check','--read-data']);
const summary=output.trim().split('\n').map(s=>JSON.parse(s)).find(s=>s.message_type==='summary');
const restored=io.folder+'/independent-restored';mkdirSync(restored,{mode:0o700});restic(['restore',summary.snapshot_id+':'+recovery,'--target',restored,'--verify']);
assert.equal(digest(readFileSync(restored+'/checkpoint.private.json')),digest(readFileSync(recovery+'/checkpoint.private.json')));
const verified=await verifyWalPair(restored,pair,{restoreRuntimeTo:io.folder+'/runtime-reconstructed'});
let encryptedBytes=0,objectCount=0;function walk(dir){for(const e of readdirSync(dir,{withFileTypes:true})){assert.ok(!e.isSymbolicLink());if(e.isDirectory())walk(dir+'/'+e.name);else{encryptedBytes+=statSync(dir+'/'+e.name).size;objectCount++;}}}walk(repo);
const checkpoint={...sourceCheckpoint,snapshotId:summary.snapshot_id,manifestSha256:digest(readFileSync(recovery+'/checkpoint.private.json'))};
const result={syntheticOnly:true,sourceDbImage:sourceResult.sourceDbImage,systemIdentifier:sourceResult.systemIdentifier,
  checkpoints:[checkpoint],initialEncryptedBytes:encryptedBytes,encryptedObjectCount:objectCount,privateFilesPaired:true,
  pairedEncryptedRestorePassed:true,...verified,cloudVerified:false,coldRestoreVerified:false,writerAdmission:false,productionChanged:false};
io.json('result.json',result);console.log(JSON.stringify(result));
