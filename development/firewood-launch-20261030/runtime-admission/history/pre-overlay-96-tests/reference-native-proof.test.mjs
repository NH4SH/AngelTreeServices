import test from 'node:test';
import assert from 'node:assert/strict';
import { validateVerifierBinding, combineNativeAdmission, NATIVE_CONTEXT_SQL } from './native-proof-core.mjs';
import { createAdmissionVerifier } from './native-proof.mjs';
import { nativeProofIntegrationFixture } from './runtime-admission/native-proof-integration-fixture.mjs';
const now = 1800000000000, clone = value => structuredClone(value);
function fixture() {
  const binding = { database:'postgres', schema:'app_private', profile:'production-live', role:'ats_firewood_request',
    systemIdentifier:'7000000000000000000', releaseSha256:'6'.repeat(64), schemaSha256:'7'.repeat(64),
    recoveryBindingSha256:'b'.repeat(64), authorityPublicKeyFingerprint:'a'.repeat(64) };
  const descriptor = {version:1,profile:'production-live',sourceId:'website_firewood_invoice_live_v1',
    environmentId:'ats_firewood_live_v1',accountId:'acct_1Tv92EI7tY6VHUvU',mode:'live',
    origin:'https://checkout.angeltreeservices.org',roles:{web:'ats_firewood_request'},binding:clone(binding)};
  const input = {descriptor,role:'web',mode:'status',binding};
  const expected = validateVerifierBinding(input);
  const context = {mode:'status',namespace:'ats-home-continuous-aaaaaaaaaaaa',generation:4,
    sourceId:'ats_crm_primary_20261029',sourceBoot:'00000000-0000-4000-8000-000000000001',databaseBoot:'2027-01-15 08:00:00+00',
    topologyFingerprint:'c'.repeat(32),timeline:1,bindingSha256:binding.recoveryBindingSha256,
    authorityPublicKeyFingerprint:binding.authorityPublicKeyFingerprint,schemaSha256:binding.schemaSha256,
    releaseSha256:binding.releaseSha256,signingKeyId:'fixture-hmac',signingKeyFingerprint:'8'.repeat(64),stripeKeyFingerprint:'9'.repeat(64),
    systemIdentifier:binding.systemIdentifier,databaseStartedAtMs:now-100000,account:descriptor.accountId,
    source:descriptor.sourceId,modes:{status:true,preparation:false,office:false,collection:false,sending:false},
    backupCaptureStartedAtMs:now-1000,captureStartedBootMs:99000,receiptSequence:1,
    receiptComponentSha256:'e'.repeat(64),receiptExpiresAtMs:now+279000,
    backupAgeMs:1000,observedAtMs:now,expiresAtMs:now+200000};
  const native = {admitted:true,database:'postgres',systemIdentifier:context.systemIdentifier,
    databaseStartedAtMs:context.databaseStartedAtMs,leaseEpoch:'4',nodeIdentity:'ats-home-primary',
    topologyFingerprint:context.topologyFingerprint,captureStartedAtMs:now-1000,leaseIssuedAtMs:now-500,
    expiresAtMs:now+10000,observedAtMs:now};
  return {input,expected,before:clone(context),after:clone(context),native,nowMs:now};
}
test('paired native proof is capped by the actual short SQL lease and contains no keys',()=>{
  const f=fixture(),proof=combineNativeAdmission(f);
  assert.equal(proof.expiresAtMs,now+10000);assert.equal(proof.backupAgeMs,1000);
  assert.deepEqual(Object.keys(proof).sort(),['admitted','systemIdentifier','releaseSha256','schemaSha256','recoveryBindingSha256','authorityPublicKeyFingerprint','backupAgeMs','expiresAtMs'].sort());
  assert.equal(Object.isFrozen(proof),true);
  assert.equal(NATIVE_CONTEXT_SQL,'SELECT app_private.fwofficev2_native_context() AS proof');
});
for(const field of ['systemIdentifier','databaseStartedAtMs','leaseEpoch','nodeIdentity','topologyFingerprint','captureStartedAtMs','database','admitted'])
  test('rejects native mismatch '+field,()=>{const f=fixture();f.native[field]=typeof f.native[field]==='number'?f.native[field]+1:'mismatch';assert.throws(()=>combineNativeAdmission(f));});
for(const field of ['bindingSha256','authorityPublicKeyFingerprint','schemaSha256','releaseSha256','sourceBoot','namespace','generation','stripeKeyFingerprint'])
  test('rejects changing release '+field,()=>{const f=fixture();f.after[field]='changed';assert.throws(()=>combineNativeAdmission(f));});
for(const field of ['receiptSequence','backupCaptureStartedAtMs','captureStartedBootMs','receiptComponentSha256','receiptExpiresAtMs'])
  test('rejects midquery authority receipt change '+field,()=>{const f=fixture();f.after[field]=typeof f.after[field]==='number'?f.after[field]+1:'f'.repeat(64);assert.throws(()=>combineNativeAdmission(f));});
test('receipt and SQL capture advancing together midquery still require a fresh paired query',()=>{
  const f=fixture();
  f.after.backupCaptureStartedAtMs=now-500;f.after.captureStartedBootMs+=500;f.after.receiptSequence+=1;
  f.native.captureStartedAtMs=f.after.backupCaptureStartedAtMs;
  assert.throws(()=>combineNativeAdmission(f));
});
test('unchanged authority receipt remains valid while clocks advance during SQL',()=>{
  const f=fixture();f.after.observedAtMs+=20;f.after.backupAgeMs+=20;f.native.observedAtMs+=10;f.nowMs+=30;
  const proof=combineNativeAdmission(f);assert.equal(proof.backupAgeMs,1030);assert.equal(proof.expiresAtMs,now+10000);
});
for(const field of ['systemIdentifier','releaseSha256','schemaSha256','recoveryBindingSha256','authorityPublicKeyFingerprint'])
  test('rejects an unbound expected '+field,()=>{const f=fixture();f.expected={...f.expected,binding:{...f.expected.binding,[field]:'d'.repeat(64)}};assert.throws(()=>combineNativeAdmission(f));});
for(const [label,mutate]of Object.entries({
  'expired lease':f=>{f.native.expiresAtMs=now;},
  'overlong lease':f=>{f.native.expiresAtMs=now+14000;},
  'future SQL clock':f=>{f.native.observedAtMs=now+1001;},
  'stale SQL clock':f=>{f.native.observedAtMs=now-1001;},
  'future lease':f=>{f.native.leaseIssuedAtMs=now+1;},
  'unsafe epoch encoding':f=>{f.native.leaseEpoch='04';},
  'slow verification':f=>{f.before.observedAtMs=now-5000;},
  'future master observation':f=>{f.after.observedAtMs=now+1;},
  'wrong mode':f=>{f.after.mode='collection';},
  'closed mode':f=>{f.before.modes.status=false;f.after.modes.status=false;},
  'stale backup':f=>{f.after.backupAgeMs=280000;},
  'negative backup age':f=>{f.after.backupAgeMs=-1;},
  'unknown backup age':f=>{f.after.backupAgeMs=NaN;},
  'wrong account':f=>{f.after.account='acct_other';},
  'wrong source':f=>{f.after.source='other';},
  'missing context':f=>{f.after=null;},
})) test('rejects '+label,()=>{const f=fixture();mutate(f);assert.throws(()=>combineNativeAdmission(f));});
test('backup monotonic remaining time caps the lease',()=>{const f=fixture();f.after.backupAgeMs=279500;assert.equal(combineNativeAdmission(f).expiresAtMs,now+500);});
test('signed receipt deadline caps the lease',()=>{const f=fixture();f.after.expiresAtMs=now+200;assert.equal(combineNativeAdmission(f).expiresAtMs,now+200);});
for(const [label,mutate]of Object.entries({
  'caller SQL role':f=>{f.input.role='postgres';},
  'caller database':f=>{f.input.binding.database='other';},
  'caller schema':f=>{f.input.binding.schema='public';},
  'caller source':f=>{f.input.descriptor.sourceId='other';},
  'caller role name':f=>{f.input.binding.role='service_role';},
  'unsupported mode':f=>{f.input.mode='arbitrary';},
  'wrong binding hash':f=>{f.input.binding.recoveryBindingSha256='d'.repeat(64);},
}))test('constructor rejects '+label,()=>{const f=fixture();mutate(f);assert.throws(()=>validateVerifierBinding(f.input));});
test('uninstalled production entry stays closed and never queries a fixture SQL client',async()=>{
  const f=fixture();let calls=0;
  const verify=createAdmissionVerifier(f.input);
  await assert.rejects(()=>verify({query:async()=>{calls++;throw Error('must not run');}}),/native_admission_pending/);
  assert.equal(calls,0);
});
test('real Ed25519 signed fixture context combines with the exact native helper result shape',()=>{
  const native={admitted:true,database:'postgres',systemIdentifier:'7700000000000000000',
    databaseStartedAtMs:now-7200000,leaseEpoch:'4',nodeIdentity:'ats-home-primary',
    topologyFingerprint:'c'.repeat(32),captureStartedAtMs:now-60000,leaseIssuedAtMs:now-200,
    expiresAtMs:now+13800,observedAtMs:now};
  const signed=nativeProofIntegrationFixture(native,{nowMs:now,mode:'office'});
  const expected=validateVerifierBinding(signed.input),before=signed.observe(now),after=signed.observe(now+20);
  const proof=combineNativeAdmission({expected,before,native:{...native,observedAtMs:now+10},after,nowMs:now+30});
  assert.equal(signed.syntheticAuthorityOnly,true);assert.equal(proof.admitted,true);
  assert.equal(proof.expiresAtMs,now+13800);assert.equal(proof.backupAgeMs,60030);
});
test('real signed context rejects a different helper capture even within the same static release',()=>{
  const native={admitted:true,database:'postgres',systemIdentifier:'7700000000000000000',
    databaseStartedAtMs:now-7200000,leaseEpoch:'4',nodeIdentity:'ats-home-primary',
    topologyFingerprint:'c'.repeat(32),captureStartedAtMs:now-60000,leaseIssuedAtMs:now-200,
    expiresAtMs:now+13800,observedAtMs:now};
  const signed=nativeProofIntegrationFixture(native,{nowMs:now});
  assert.throws(()=>combineNativeAdmission({expected:validateVerifierBinding(signed.input),
    before:signed.observe(now),native:{...native,captureStartedAtMs:native.captureStartedAtMs+1},
    after:signed.observe(now+20),nowMs:now+30}));
});
