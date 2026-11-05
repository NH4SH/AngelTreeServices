import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { brotliCompressSync, brotliDecompressSync } from 'node:zlib';
import { assessNodeRuntime, logNodeRuntimeOnce } from '../src/lib/security/node-runtime.ts';

test('advisory thresholds reject affected releases and accept fixed supported releases', () => {
 for (const version of ['v22.23.3','v22.22.9','v24.4.0','v24.22.0','v26.12.0','v20.20.0','v27.0.0','','garbage','v22.23.4-rc.1']) {
  assert.equal(assessNodeRuntime(version).patched,false,version);
  assert.equal(assessNodeRuntime(version).supportedForBuild,false,version);
 }
 for (const version of ['v22.23.4','22.23.5','v22.24.0','v24.22.1','v24.23.0']) {
  assert.equal(assessNodeRuntime(version).patched,true,version);
  assert.equal(assessNodeRuntime(version).supportedForBuild,true,version);
 }
 assert.equal(assessNodeRuntime('v26.12.1').patched,true);
 assert.equal(assessNodeRuntime('v26.12.1').supportedForBuild,false,'Node 26 is not a tested build lane');
});

test('actual benign Brotli compression and decoding preserves a synthetic document', () => {
 const bytes=Buffer.from('Angel Tree synthetic runtime check.\n'.repeat(2048));
 assert.deepEqual(brotliDecompressSync(brotliCompressSync(bytes)),bytes);
 assert.equal(assessNodeRuntime(process.version).supportedForBuild,true);
});

test('runtime log uses a fixed field allowlist and logs once without customer or credential data', () => {
 const previous=console.info,deploy=process.env.DEPLOY_ID,secret=process.env.STRIPE_SECRET_KEY,logs=[];
 console.info=value=>logs.push(JSON.parse(value));
 process.env.DEPLOY_ID='a'.repeat(24);process.env.STRIPE_SECRET_KEY='SYNTHETIC_PRIVATE_CANARY';
 try {
  logNodeRuntimeOnce('crm-server');logNodeRuntimeOnce('crm-server');
  assert.equal(logs.length,1);assert.equal(logs[0].deployId,'a'.repeat(24));
  assert.equal(logs[0].nodeVersion,process.version);assert.equal(logs[0].patched,true);
  assert.deepEqual(Object.keys(logs[0]).sort(),['event','component','advisory','nodeVersion','patched','supportedForBuild','architecture','platform','deployId'].sort());
  process.env.DEPLOY_ID='https://user:PRIVATE@example.invalid';
  logNodeRuntimeOnce('PRIVATE_COMPONENT_CANARY');
  assert.equal(logs[1].component,'crm-worker');assert.equal('deployId' in logs[1],false);
  assert.doesNotMatch(JSON.stringify(logs),/PRIVATE|SECRET|https:/);
 } finally {
  console.info=previous;
  if(deploy===undefined)delete process.env.DEPLOY_ID;else process.env.DEPLOY_ID=deploy;
  if(secret===undefined)delete process.env.STRIPE_SECRET_KEY;else process.env.STRIPE_SECRET_KEY=secret;
 }
});

test('logging failure cannot fail an existing worker or cause its work to replay', () => {
 const previous=console.info;console.info=()=>{throw Error('Synthetic logger unavailable');};
 try { assert.doesNotThrow(()=>logNodeRuntimeOnce('System health monitoring')); }
 finally { console.info=previous; }
});

test('build guard succeeds on the executing fixed runtime and runtime facts are not added to public liveness', () => {
 const result=spawnSync(process.execPath,['--experimental-strip-types','scripts/check-node-runtime.mjs'],{encoding:'utf8'});
 assert.equal(result.status,0);assert.match(result.stdout,/fix present/);
 const source=readFileSync(new URL('../src/app/api/health/live/route.ts',import.meta.url),'utf8');
 assert.doesNotMatch(source,/process\.version|runtime_security|assessNodeRuntime|logNodeRuntime/);
});
