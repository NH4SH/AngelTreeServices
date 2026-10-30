import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,cpSync,rmSync,renameSync,readdirSync,chmodSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';import {createPublicKey,randomBytes} from 'node:crypto';
import {sourceCatalog,copyRotation,verifyRotationRoots,nativeExecutor,verifyLocalCiphertext} from './native-rotation.mjs';import {restoreDatabaseParts} from './database-parts.mjs';import {sha256} from './cloud-policy.mjs';
test('native rotation retains unknown roots, restores without its source and detects corrupt replacement data',{skip:!process.env.ATS_ROTATION_FIXTURE,timeout:120000},async()=>{
 const fixture=process.env.ATS_ROTATION_FIXTURE,work=mkdtempSync(join(tmpdir(),'ats-native-rotation-')),binary=process.env.ATS_TEST_RESTIC,binarySha256='06582569ff2f10e1935a6f12187c76db02f0bae99e6e54098f2cdc374766d768';
 try{
  const publicKey=createPublicKey(readFileSync(join(fixture,'authority-public.pem'))),namespace=JSON.parse(readFileSync(join(fixture,'ticket-5.json'))).namespace;
  const envelopes=[['baseline.private.json',true],['baseline-stable.private.json',true],['incremental-4.private.json',false],['incremental-5.private.json',false]].map(([file,full])=>{const r=JSON.parse(readFileSync(join(fixture,file)));return full?r.report.supplemental.catalogCertificate:r.report.catalogCertificate;});
  // These are offline archived fixtures, not current retirement authorization.
  const recordedNow=Date.parse(JSON.parse(Buffer.from(envelopes.at(-1).payload,'base64url')).issuedAt)+1;
  const certificates=envelopes.map(e=>sourceCatalog(e,publicKey,namespace,recordedNow)),catalog=certificates.at(-1),source=join(work,'source'),target=join(work,'target'),password=join(work,'target-password');cpSync(join(fixture,'repo-5'),source,{recursive:true});writeFileSync(password,randomBytes(48).toString('base64'),{mode:0o600});
  const result=copyRotation({binary,binarySha256,sourceRepo:source,sourcePasswordFile:join(fixture,'recovery-password.private'),targetRepo:target,targetPasswordFile:password,work,namespace,catalog,certifiedRoots:certificates.map(c=>c.snapshotId)});
  assert.equal(result.mapping.length,3);assert.equal(result.plan.retirementRootCandidates.length,2);
  const checked=await verifyRotationRoots({binary,binarySha256,repo:target,passwordFile:password,work,namespace,mapping:result.mapping,sourceRepo:source,sourcePasswordFile:join(fixture,'recovery-password.private'),sourceCertificates:certificates});assert.equal(checked.length,3);verifyLocalCiphertext(source,catalog);
  renameSync(source,join(work,'source-held'));const restored=join(work,'without-source');mkdirSync(restored);const chosen=result.mapping[0],run=nativeExecutor({binary,binarySha256,repo:target,passwordFile:password,work});run(['restore',chosen.targetSnapshotId+':'+chosen.capturePath,'--target',restored,'--verify']);
  const manifest=JSON.parse(readFileSync(join(restored,'manifest.private.json')));restoreDatabaseParts(restored,manifest.databaseParts);assert.equal(sha256(readFileSync(join(restored,'database.dump'))),manifest.databaseSha256);
  const prefix=readdirSync(join(target,'data')).find(n=>readdirSync(join(target,'data',n)).length),file=join(target,'data',prefix,readdirSync(join(target,'data',prefix))[0]),bytes=readFileSync(file);bytes[0]^=1;chmodSync(file,0o600);writeFileSync(file,bytes);assert.throws(()=>run(['check','--read-data']));
 }finally{rmSync(work,{recursive:true,force:true});}
});
