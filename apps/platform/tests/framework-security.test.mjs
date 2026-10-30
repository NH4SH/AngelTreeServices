import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync}from'node:fs';
import {verifyFramework,isPatchedNext,isPatchedReact,appRoot}from'../scripts/release/verify-framework-security.mjs';
const read=p=>JSON.parse(readFileSync(new URL(p,appRoot)));
const manifest=read('package.json'),lock=read('package-lock.json');
function fixture(){return {m:structuredClone(manifest),l:structuredClone(lock)};}
test('framework lock and declarations meet the reviewed upstream security floors',()=>{assert.equal(verifyFramework(manifest,lock).october2026SecurityFloorsMet,true);});
test('affected Next releases fail even if the direct React pair is patched',()=>{
 for(const version of ['13.5.0','15.5.27','16.3.8','16.4.0','17.0.0'])assert.equal(isPatchedNext(version),false);
 for(const version of ['16.4.1','16.4.2'])assert.equal(isPatchedNext(version),true);
 const {m,l}=fixture();m.dependencies.next='16.3.8';assert.throws(()=>verifyFramework(m,l));
});
test('React security floors cover the upstream backports and refuse affected or unreviewed lines',()=>{
 for(const version of ['19.0.8','19.1.9','19.2.8','19.3.0','18.3.1','19.4.0'])assert.equal(isPatchedReact(version),false);
 for(const version of ['19.0.9','19.1.10','19.2.9','19.3.1'])assert.equal(isPatchedReact(version),true);
});
test('ranges, prereleases and malformed versions cannot masquerade as stable security fixes',()=>{
 for(const version of ['^16.4.2','16.4.2-canary.1','16.4','16.4.02','v16.4.2','Infinity.0.0',''])assert.throws(()=>isPatchedNext(version));
 for(const version of ['~19.2.9','19.3.1-canary.1',null])assert.throws(()=>isPatchedReact(version));
});
test('framework verification rejects declaration, lock, integrity and React-pair mismatches',()=>{
 for(const change of [({l})=>l.lockfileVersion=2,({l})=>l.packages[''].dependencies.next='16.4.1',({l})=>l.packages['node_modules/next'].version='16.3.8',({l})=>delete l.packages['node_modules/react'].integrity,({m,l})=>{m.dependencies['react-dom']='19.3.1';l.packages[''].dependencies['react-dom']='19.3.1';l.packages['node_modules/react-dom'].version='19.3.1';}]){
  const f=fixture();change(f);assert.throws(()=>verifyFramework(f.m,f.l));
 }
});
test('an affected standalone or nested RSC package cannot hide behind a patched Next declaration',()=>{
 for(const path of ['node_modules/react-server-dom-webpack','node_modules/example/node_modules/react-server-dom-parcel','node_modules/react-server-dom-turbopack']){const {m,l}=fixture();l.packages[path]={version:'19.2.8'};assert.throws(()=>verifyFramework(m,l));l.packages[path].version='19.2.9';assert.equal(verifyFramework(m,l).october2026SecurityFloorsMet,true);}
});
test('installed-package verification refuses stale cached dependencies despite a patched lockfile',()=>{
 for(const stale of ['next','react','react-dom'])assert.throws(()=>verifyFramework(manifest,lock,name=>({version:name===stale?'0.0.0':manifest.dependencies[name]})));
 assert.equal(verifyFramework(manifest,lock,name=>({version:manifest.dependencies[name]})).installedPackagesChecked,true);
});
