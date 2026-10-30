// Root controller only. This construction closure owns the actual private-key
// read and SDK instance. A hash argument or foreign SDK object cannot mint proof.
import assert from 'node:assert/strict';
import {sha,freeze,TEST} from '../shared/protocol.mjs';
const verified=new WeakMap();
export function createTestSdkCustodyCache({readPrivateKey,constructSdk}){
 assert.equal(typeof readPrivateKey,'function');assert.equal(typeof constructSdk,'function');let client=null;const fingerprints=new WeakMap();
 function get(){const key=readPrivateKey().trim();assert.match(key,/^rk_test_[A-Za-z0-9]+$/);const seen=sha(key);if(!client){client=constructSdk(key);assert.ok(client&&typeof client==='object');fingerprints.set(client,seen);}else assert.equal(fingerprints.get(client),seen,'Private key changed; reviewed restart required');return client;}
 return Object.freeze({
  getClientKeyFingerprint(candidate){return fingerprints.get(candidate)??null;},
  async observe(expectedFingerprint){const sdk=get();assert.equal(fingerprints.get(sdk),expectedFingerprint,'Registered test key differs from actual constructed SDK');assert.equal(typeof sdk.accounts?.retrieve,'function');assert.equal(typeof sdk.balance?.retrieve,'function');const account=await sdk.accounts.retrieve();const balance=await sdk.balance.retrieve();assert.equal(account.id,TEST.accountId);assert.equal(balance.livemode,false);assert.equal(fingerprints.get(get()),expectedFingerprint);const value=freeze({kind:'ats-actual-private-test-sdk-custody-v1',accountId:account.id,livemode:false,testKeyFingerprint:expectedFingerprint});verified.set(value,{sdk,readAgain:()=>assert.equal(fingerprints.get(get()),expectedFingerprint)});return value;}
 });
}
export function assertActualTestSdkCustody(value){const entry=verified.get(value);assert.ok(entry,'No actual private-SDK custody capability');entry.readAgain();return value;}
