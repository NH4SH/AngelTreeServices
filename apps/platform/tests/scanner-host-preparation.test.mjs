import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { assessHost, socketArgument } from '../scripts/private-scanner/hosting/inspect-host.mjs';

const fixture = () => ({platform:'linux',osId:'ubuntu',osVersion:'24.04',architecture:'amd64',cpus:4,memoryBytes:7.75*1024**3,
  activeSwapDevices:0,dockerOS:'linux',dockerArchitecture:'amd64',dockerCpus:4,dockerMemoryBytes:7.75*1024**3,
  dockerRootless:true,dockerCgroupVersion:'2',dockerCgroupDriver:'systemd'});

test('suitable preliminary facts never approve activation or claim live host evidence',()=>{
  const f=fixture(), copy=structuredClone(f), result=assessHost(f);
  assert.equal(result.preliminaryHostSuitable,true);assert.equal(result.readyForActivation,false);assert.equal(result.changesApplied,false);
  assert.ok(result.pendingEvidence.some(x=>x.includes('Native image')));assert.ok(result.pendingEvidence.some(x=>x.includes('TLS')));
  assert.deepEqual(f,copy);
  const arm=fixture();arm.architecture=arm.dockerArchitecture='arm64';assert.equal(assessHost(arm).preliminaryHostSuitable,true);
});
test('insufficient, incomplete or unknown host and daemon evidence fails screening independently',()=>{
  for (const [key,bad] of Object.entries({platform:'darwin',osId:'debian',osVersion:'26.04',architecture:'unknown',cpus:1,memoryBytes:6*1024**3,
    activeSwapDevices:1,dockerOS:'windows',dockerArchitecture:'arm64',dockerCpus:1,dockerMemoryBytes:6*1024**3,dockerRootless:false,
    dockerCgroupVersion:'1',dockerCgroupDriver:'none'})) {
    assert.equal(assessHost({...fixture(),[key]:bad}).preliminaryHostSuitable,false,key);
  }
  for(const key of Object.keys(fixture())){const f=fixture();delete f[key];assert.equal(assessHost(f).preliminaryHostSuitable,false,key);}
});
test('explicit local sockets prevent inheriting a remote Docker context or endpoint',()=>{
  assert.equal(socketArgument('/run/user/1000/docker.sock'),'unix:///run/user/1000/docker.sock');
  for(const path of ['ssh://server','tcp://server:2375','unix:///run/docker.sock','relative.sock','/run/../run/docker.sock','/run/docker.sock\n','/run/docker']) assert.throws(()=>socketArgument(path));
});
test('unknown flags fail without invoking a Docker executable or exposing environment secrets',()=>{
  const result=spawnSync(process.execPath,[new URL('../scripts/private-scanner/hosting/inspect-host.mjs',import.meta.url).pathname,
    '--apply','--docker-bin','/does/not/exist'],{encoding:'utf8',env:{PATH:'/usr/bin:/bin',DOCUMENT_SCANNER_TOKEN:'synthetic-secret-never-report'}});
  assert.equal(result.status,1);assert.match(result.stderr,/No settings changed/);assert.doesNotMatch(result.stderr,/synthetic-secret|ENOENT/);
});
