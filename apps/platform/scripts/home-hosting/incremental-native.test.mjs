// Opt-in real Restic test against retained, coherent synthetic candidate captures.
// Only fixture paths are supplied through the environment; no provider calls.
import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync,readdirSync,statSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomUUID,generateKeyPairSync} from 'node:crypto';
import {createCloudVerifier} from './cloud-verifier.mjs';import {createIncrementalVerifier,fullCatalogIssuer} from './incremental-verifier.mjs';import {sha256} from './cloud-policy.mjs';import {validateContinuousReceipt} from './continuous-policy.mjs';
import {signProof} from './failover-proof.mjs';
test('real cold Restic chain agrees with full restore and withholds proofs on faults',{skip:!process.env.ATS_INCREMENTAL_FIXTURE,timeout:90000},async()=>{
 const fixture=process.env.ATS_INCREMENTAL_FIXTURE,binary=process.env.ATS_TEST_RESTIC;assert.ok(binary);const scratch=mkdtempSync(join(tmpdir(),'ats-native-incremental-'));const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 const sequences=process.env.ATS_INCREMENTAL_SEQUENCES?.split(',').map(Number)??[1,2,3];assert.equal(sequences.length,3);assert.ok(sequences.every((n,i)=>Number.isSafeInteger(n)&&n>0&&(i===0||n>sequences[i-1])));
 const tickets=sequences.map(n=>JSON.parse(readFileSync(join(fixture,'ticket-'+n+'.json')))),ids=new Map();let repository,inventory,fault,readCount=0,finishes=0;
 function list(folder,prefix=''){return readdirSync(folder,{withFileTypes:true}).flatMap(e=>e.isDirectory()?list(join(folder,e.name),prefix+e.name+'/'):[{name:prefix+e.name,id:ids.has(prefix+e.name)?ids.get(prefix+e.name):ids.set(prefix+e.name,randomUUID()).get(prefix+e.name),version:'v1',size:statSync(join(folder,e.name)).size}]);}
 const fullReadIdentities=new Map(),storage={download:async name=>{const bytes=readFileSync(join(repository,name));fullReadIdentities.set(name,{size:bytes.length,sha256:sha256(bytes),etag:sha256(bytes)});return bytes;},fullReadIdentity:name=>fullReadIdentities.get(name),read:async(o,start,end)=>{readCount++;if(fault==='missing')throw Error('Injected missing payload');const bytes=readFileSync(join(repository,o.name)),result=Buffer.from(bytes.subarray(start,end+1));if(fault==='corrupt-new'&&o.name.startsWith('data/')&&!baseNames.has(o.name))result[0]^=1;return{bytes:result,etag:fault==='provider-identity'?'changed':sha256(bytes)};},publicDenied:async()=>true};
 const ledger=async p=>{if(p.action==='charge'&&fault==='quota')throw Error('Injected quota exhaustion');if(p.action==='finish'){finishes++;return{claims:p.claims,report:p.report};}return p.action==='inventory'?inventory:p.action==='status'?{roots:[]}:{reserved:true};};
 const common={namespace:tickets[0].namespace,restic:binary,resticSha256:'06582569ff2f10e1935a6f12187c76db02f0bae99e6e54098f2cdc374766d768',password:readFileSync(join(fixture,'recovery-password.private'),'utf8'),privateKey,storage,ledger};let baseNames;
 try{
  repository=join(fixture,'repo-'+sequences[0]);inventory=list(repository);baseNames=new Set(inventory.map(o=>o.name));
  const full=await createCloudVerifier({...common,cacheRoot:join(scratch,'full'),onVerifiedRepository:fullCatalogIssuer({storage,privateKey})})({requestId:randomUUID(),mode:'archive',forceRemoteRead:true,ticket:tickets[0]});
  const firstCertificate=full.report.supplemental.catalogCertificate;let certificate=firstCertificate,last;
  fault='provider-identity';const beforeBaselineRace=finishes;
  await assert.rejects(createCloudVerifier({...common,cacheRoot:join(scratch,'raced-full'),onVerifiedRepository:fullCatalogIssuer({storage,privateKey})})({requestId:randomUUID(),mode:'archive',forceRemoteRead:true,ticket:tickets[0]}));
  assert.equal(finishes,beforeBaselineRace);fault=undefined;
  for(let i=1;i<sequences.length;i++){
   repository=join(fixture,'repo-'+sequences[i]);inventory=list(repository);
   last=await createIncrementalVerifier({...common,scratchRoot:join(scratch,'cold-'+i)})({requestId:randomUUID(),ticket:tickets[i],catalogCertificate:certificate});
   assert.ok(last.report.downloadedBytes<last.report.repositoryBytes/20);assert.equal(last.report.receiptPermitsWrites,false);assert.equal(last.report.fullDataRead,false);assert.throws(()=>validateContinuousReceipt(last.envelope,publicKey,tickets[i]));certificate=last.report.catalogCertificate;
  }
  const restored=await createCloudVerifier({...common,cacheRoot:join(scratch,'full-last'),onVerifiedRepository:fullCatalogIssuer({storage,privateKey})})({requestId:randomUUID(),mode:'archive',forceRemoteRead:true,ticket:tickets[2]});
  const a=JSON.parse(Buffer.from(certificate.payload,'base64url')),b=JSON.parse(Buffer.from(restored.report.supplemental.catalogCertificate.payload,'base64url'));assert.deepEqual(a.artifacts,b.artifacts);assert.equal(a.objectInventorySha256,b.objectInventorySha256);
  repository=join(fixture,'repo-'+sequences[1]);inventory=list(repository);const original=[...inventory];let before=finishes;
  for(const name of ['missing','corrupt-new','quota','provider-identity']){fault=name;readCount=0;await assert.rejects(createIncrementalVerifier({...common,scratchRoot:join(scratch,'fault-'+name)})({requestId:randomUUID(),ticket:tickets[1],catalogCertificate:firstCertificate}));assert.equal(finishes,before);if(name==='quota')assert.equal(readCount,0);}
  fault=undefined;inventory=original.map(o=>o.name==='config'?{...o,version:'replaced'}:o);readCount=0;await assert.rejects(createIncrementalVerifier({...common,scratchRoot:join(scratch,'fault-version')})({requestId:randomUUID(),ticket:tickets[1],catalogCertificate:firstCertificate}));assert.equal(readCount,0);assert.equal(finishes,before);
  inventory=original;const expiring=JSON.parse(Buffer.from(firstCertificate.payload,'base64url')),expiry=Date.now()+500;expiring.fullVerifiedAt=new Date(expiry-86400000).toISOString();expiring.issuedAt=new Date().toISOString();expiring.expiresAt=new Date(expiry).toISOString();
  await assert.rejects(createIncrementalVerifier({...common,scratchRoot:join(scratch,'fault-expiry')})({requestId:randomUUID(),ticket:tickets[1],catalogCertificate:signProof(expiring,privateKey)}));assert.equal(finishes,before);
 }finally{rmSync(scratch,{recursive:true,force:true});}
});
