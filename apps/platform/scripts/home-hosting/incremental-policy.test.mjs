import {test} from 'node:test';import assert from 'node:assert/strict';import {generateKeyPairSync} from 'node:crypto';import {signProof} from './failover-proof.mjs';import {validateContinuousReceipt} from './continuous-policy.mjs';
import {validateCatalog,compareCatalog,artifactFingerprint,artifactNames,inspectIndexDelta,requiredPackGroups,verifyPackReadCoverage} from './incremental-policy.mjs';
const {privateKey,publicKey}=generateKeyPairSync('ed25519'),now=Date.now(),ticket={namespace:'ats-rehearsal-continuous-123456abcdef',sourceId:'candidate',sourceBoot:'boot',databaseBoot:'dbboot',generation:1,topology:'a'.repeat(32),sequence:2,captureStartedAt:new Date(now-1000).toISOString()};
const object={name:'config',id:'12345678-1234-1234-1234-123456789abc',version:'v1',size:155,sha256:'a'.repeat(64),etag:'"strong"'};
const c={version:1,kind:'restic-verified-catalog',writeAdmission:false,...ticket,sequence:1,captureStartedAt:new Date(now-2000).toISOString(),fullVerifiedAt:new Date(now-5000).toISOString(),issuedAt:new Date(now-4000).toISOString(),expiresAt:new Date(now-5000+86400000).toISOString(),objects:[object],artifacts:Object.fromEntries(artifactNames.slice(0,6).map(n=>[n,{sha256:'b'.repeat(64),fingerprint:'c'.repeat(64)}])),objectInventorySha256:'d'.repeat(64)};
test('valid signed baseline works after a cold start and cannot admit writes',()=>{const envelope=signProof(c,privateKey);assert.equal(validateCatalog(envelope,publicKey,ticket,now).sequence,1);assert.throws(()=>validateContinuousReceipt(envelope,publicKey,ticket,now));});
test('foreign signer, altered payload, source restart and old checkpoint are rejected',()=>{const foreign=generateKeyPairSync('ed25519');assert.throws(()=>validateCatalog(signProof(c,foreign.privateKey),publicKey,ticket,now));for(const change of [{sourceBoot:'other'},{generation:2},{sequence:2},{namespace:'another'}])assert.throws(()=>validateCatalog(signProof({...c,...change},privateKey),publicKey,ticket,now));});
test('incremental activity cannot slide the last full-read expiry forward',()=>{assert.throws(()=>validateCatalog(signProof({...c,issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+86400000).toISOString()},privateKey),publicKey,ticket,now));assert.throws(()=>validateCatalog(signProof(c,privateKey),publicKey,ticket,now+86400000));});
test('missing base, same-size replacement and silent key rotation require full verification',()=>{assert.throws(()=>compareCatalog(c,[]));assert.throws(()=>compareCatalog(c,[{...object,version:'v2'}]));assert.throws(()=>compareCatalog(c,[object,{...object,name:'keys/'+'e'.repeat(64),id:'12345678-1234-1234-1234-123456789abd'}]));});
test('file reuse binds ordered blob identity and size, independent of timestamps',()=>{const node={name:'database.dump',type:'file',size:12,content:['a'.repeat(64)]};assert.equal(artifactFingerprint(node),artifactFingerprint({...node,mtime:'other'}));assert.notEqual(artifactFingerprint(node),artifactFingerprint({...node,content:['b'.repeat(64)]}));assert.throws(()=>artifactFingerprint({...node,type:'symlink'}));});
test('artifact metadata cannot broaden private file permissions',()=>assert.throws(()=>artifactFingerprint({name:'core.private.env',type:'file',size:1,content:['a'.repeat(64)],mode:0o644})));
test('new indexes cannot invent blob locations inside a previously verified pack',()=>{
 const oldPack='a'.repeat(64),newPack='b'.repeat(64),oldIndex={name:'index/'+'c'.repeat(64),decoded:{packs:[{id:oldPack,blobs:[{id:'d'.repeat(64),type:'data',offset:0,length:100}]}]}};
 const base=[{name:oldIndex.name},{name:'data/aa/'+oldPack,size:120}],current=[...base,{name:'data/bb/'+newPack,size:120}],added={name:'index/'+'e'.repeat(64),decoded:{packs:[{id:newPack,blobs:[{id:'f'.repeat(64),type:'data',offset:0,length:100}]}]}};
 assert.equal(inspectIndexDelta([oldIndex,added],base,current).length,1);
 const poisoned=structuredClone(added);poisoned.decoded.packs[0].id=oldPack;assert.throws(()=>inspectIndexDelta([oldIndex,poisoned],base,current));
 const duplicate=structuredClone(added);duplicate.decoded.packs[0].blobs[0].id='d'.repeat(64);assert.throws(()=>inspectIndexDelta([oldIndex,duplicate],base,current));
});
test('native selectors cover every new pack and missing read bytes fail closed',()=>{
 const a={name:'data/00/'+'0'.repeat(64),size:100},b={name:'data/ff/'+'f'.repeat(64),size:50};assert.deepEqual(requiredPackGroups([a,b]),['1/256','256/256']);
 assert.doesNotThrow(()=>verifyPackReadCoverage([a,b],new Map([[a.name,[[0,39],[40,99]]],[b.name,[[0,49]]]])));
 for(const spans of [[[1,99]],[[0,98]],[[0,39],[41,99]]])assert.throws(()=>verifyPackReadCoverage([a],new Map([[a.name,spans]])));
 assert.throws(()=>verifyPackReadCoverage([a,b],new Map([[a.name,[[0,99]]]])));
});
