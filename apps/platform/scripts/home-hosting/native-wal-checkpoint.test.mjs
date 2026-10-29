import {test} from 'node:test';import assert from 'node:assert/strict';import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {signProof} from './failover-proof.mjs';import {validateNativeWalReceipt} from './native-wal-checkpoint.mjs';
import {nativeFileRecoveryIdentity,nativeFileIndexSha256} from './native-file-patch.mjs';
const keys=generateKeyPairSync('ed25519'),at=Date.now(),iso=n=>new Date(n).toISOString();
const binding={namespace:'ats-rehearsal-continuous-aaaaaaaaaaaa',sourceBoot:randomUUID(),databaseBoot:iso(at-3600000),sourceId:'ats_crm_candidate_20261027',generation:3,topology:'a'.repeat(64),sourceDbImage:'sha256:'+'b'.repeat(64),systemIdentifier:'7701364729366052896',timeline:1};
function claims(){return {version:1,kind:'certified-native-wal-backup',namespace:binding.namespace,generation:binding.generation,binding,sequence:2,jobId:randomUUID(),baseJobId:randomUUID(),
 componentSha256:'c'.repeat(64),snapshotId:'d'.repeat(64),manifestSha256:'e'.repeat(64),privatePairSha256:'f'.repeat(64),targetLsn:'0/E01BC10',captureStartedBootMs:100000,
 captureStartedAt:iso(at-20000),captureCompletedAt:iso(at-10000),issuedAt:iso(at-1000),offsiteVerifiedAt:iso(at-2000),
 fullVerifiedAt:iso(at-100000),fullExpiresAt:iso(at-100000+86400000),expiresAt:iso(at-20000+280000),completeRecoveryChain:true,allNewBytesReadBack:true,
 retainedProviderVersionsChecked:true,serializedByAuthority:true,freshFullRemoteRead:false};}
test('only the exact bound native authority receipt can renew the writer deadline',()=>{
 const c=claims();assert.equal(validateNativeWalReceipt(signProof(c,keys.privateKey),keys.publicKey,binding,at).freshFullRemoteRead,false);
 for(const edit of [v=>v.kind='archive-verification',v=>v.kind='native-wal-chain-reference',v=>v.binding={...binding,sourceBoot:randomUUID()},
  v=>v.expiresAt=iso(at+280000),v=>v.captureCompletedAt=iso(at+1000),v=>v.fullExpiresAt=iso(at+86400000),
  v=>v.completeRecoveryChain=false,v=>v.allNewBytesReadBack=false,v=>v.serializedByAuthority=false,v=>delete v.privatePairSha256]){
  const bad=structuredClone(c);edit(bad);assert.throws(()=>validateNativeWalReceipt(signProof(bad,keys.privateKey),keys.publicKey,binding,at));
 }
 assert.throws(()=>validateNativeWalReceipt(signProof(c,keys.privateKey),keys.publicKey,binding,at+300000));
});
test('file-aware receipts bind both the verified static base and the current file index',()=>{
 const b={...binding,privateFileFormat:'patch-v1'},c={...claims(),binding:b,privateFileStateVerified:true,staticPairSha256:'1'.repeat(64),fileIndexSha256:nativeFileIndexSha256([])};
 c.privatePairSha256=nativeFileRecoveryIdentity(c.staticPairSha256,[]);
 assert.equal(validateNativeWalReceipt(signProof(c,keys.privateKey),keys.publicKey,b,at).privateFileStateVerified,true);
 for(const edit of [v=>delete v.privateFileStateVerified,v=>v.fileIndexSha256='2'.repeat(64),v=>v.staticPairSha256='3'.repeat(64)]){
  const bad=structuredClone(c);edit(bad);assert.throws(()=>validateNativeWalReceipt(signProof(bad,keys.privateKey),keys.publicKey,b,at));
 }
});
