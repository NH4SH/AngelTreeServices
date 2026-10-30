// The native-WAL receipt is intentionally distinct from full-read and logical
// incremental receipts. Neither an archive proof nor a chain reference can open
// a writer. Only the durable independent authority issues this short deadline.
import assert from 'node:assert/strict';
import {signProof,verifyProof} from './failover-proof.mjs';
import {sha256} from './cloud-policy.mjs';
import {walLsn} from './wal-archive-policy.mjs';
import {createHash} from 'node:crypto';

export function validateNativeWalReceipt(envelope,key,binding,now=Date.now()){
 assert.ok(binding.privateFileFormat===undefined||binding.privateFileFormat==='patch-v1');
 const c=verifyProof(envelope,key,{kind:'certified-native-wal-backup',namespace:binding.namespace,now});
 assert.equal(c.generation,binding.generation);
 assert.deepEqual(c.binding,binding,'Source, boot or recovery generation changed');
 assert.ok(Number.isSafeInteger(c.sequence)&&c.sequence>0);
 for(const name of ['jobId','baseJobId'])assert.match(c[name],/^[a-f0-9-]{36}$/);
 for(const name of ['componentSha256','snapshotId','manifestSha256','privatePairSha256'])assert.match(c[name],/^[a-f0-9]{64}$/);
 assert.ok(Number.isFinite(c.captureStartedBootMs)&&c.captureStartedBootMs>0);assert.ok(walLsn(c.targetLsn)>0n);
 const times=Object.fromEntries(['captureStartedAt','captureCompletedAt','issuedAt','offsiteVerifiedAt','fullVerifiedAt','fullExpiresAt','expiresAt'].map(k=>[k,Date.parse(c[k])]));
 assert.ok(Object.values(times).every(Number.isFinite));
 assert.ok(times.captureStartedAt<=times.captureCompletedAt&&times.captureCompletedAt<=times.offsiteVerifiedAt&&times.offsiteVerifiedAt<=times.issuedAt&&times.issuedAt<=now);
 assert.ok(times.fullVerifiedAt<=times.offsiteVerifiedAt&&times.fullExpiresAt===times.fullVerifiedAt+86400000);
 assert.equal(times.expiresAt,Math.min(times.captureStartedAt+280000,times.fullExpiresAt));assert.ok(now-times.captureStartedAt<280000);
 for(const name of ['completeRecoveryChain','allNewBytesReadBack','retainedProviderVersionsChecked','serializedByAuthority'])assert.equal(c[name],true);
 if(binding.privateFileFormat==='patch-v1'){
  assert.equal(c.privateFileStateVerified,true);for(const n of ['staticPairSha256','fileIndexSha256'])assert.match(c[n],/^[a-f0-9]{64}$/);
  const identity=createHash('sha256').update(JSON.stringify({kind:'native-wal-file-state-v1',staticSha256:c.staticPairSha256,fileIndexSha256:c.fileIndexSha256})).digest('hex');
  assert.equal(c.privatePairSha256,identity);
 }
 assert.equal(typeof c.freshFullRemoteRead,'boolean');return c;
}

export function createNativeWalAuthority({namespace,privateKey,publicKey,ledger,now=()=>Date.now()}){
 return async request=>{
  assert.match(request.requestId,/^[a-f0-9-]{36}$/);assert.match(request.jobId,/^[a-f0-9-]{36}$/);
  assert.equal(request.binding.namespace,namespace);
  const result=await ledger({action:'admit',namespace,jobId:request.jobId,requestId:request.requestId,bodySha:sha256(JSON.stringify(request))});
  assert.equal(result.claims.jobId,request.jobId);const envelope=signProof(result.claims,privateKey);
  validateNativeWalReceipt(envelope,publicKey,request.binding,now());
  assert.equal(result.chain.kind,'native-wal-chain-reference');assert.equal(result.chain.writeAdmission,false);
  assert.equal(result.chain.jobId,request.jobId);assert.deepEqual(result.chain.binding,request.binding);
  return {envelope,chainCertificate:signProof(result.chain,privateKey),replayed:result.replayed===true};
 };
}
