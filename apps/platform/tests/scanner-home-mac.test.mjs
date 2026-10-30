import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, unlinkSync, symlinkSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { realpathSync } from 'node:fs';
import { assessMac, PACKET_FILES, writePacket, verifyPacket } from '../scripts/private-scanner/home-mac/prepare.mjs';

const facts = () => ({ platform:'darwin', architecture:'arm64', macOSVersion:'15.7.1',
  memoryBytes:16*1024**3, cpus:8, freeDiskBytes:100*1024**3 });
const temp = t => {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'ats-mac-packet-'));
  t.after(() => rmSync(root, {recursive:true, force:true})); return root;
};
const source = { sourceCommit:'a'.repeat(40), readSource:path => Buffer.from(`synthetic source ${path}\n`) };
const packet = t => { const path=join(temp(t),'packet'); writePacket(path,source); return path; };
const editManifest = (path,edit) => {
  const file=join(path,'PACKET_MANIFEST.json'), manifest=JSON.parse(readFileSync(file)); edit(manifest);
  writeFileSync(file,JSON.stringify(manifest));
};

test('Mac screening is read-only, preliminary, and never activation approval',()=>{
  const f=facts(), copy=structuredClone(f), r=assessMac(f);
  assert.equal(r.preliminaryMacSuitable,true); assert.equal(r.readyForActivation,false); assert.equal(r.settingsChanged,false);
  assert.deepEqual(f,copy); assert.equal(r.plannedGuest.memoryGiB,8);
  assert.equal(assessMac({...f,macOSVersion:'13.5'}).preliminaryMacSuitable,true);
  assert.ok(r.pending.some(x=>x.includes('ISP')));
});
test('unknown, non-Mac, Intel, low-memory, old-OS and full-disk candidates fail independently',()=>{
  for(const [key,bad] of Object.entries({platform:'linux',architecture:'x64',macOSVersion:'13.4',memoryBytes:8*1024**3,cpus:2,freeDiskBytes:79*1024**3})) {
    assert.equal(assessMac({...facts(),[key]:bad}).preliminaryMacSuitable,false,key);
  }
  for(const key of Object.keys(facts())) {const f=facts();delete f[key];assert.equal(assessMac(f).preliminaryMacSuitable,false,key);}
  for(const macOSVersion of ['unknown','13','13.5beta',null]) assert.equal(assessMac({...facts(),macOSVersion}).preliminaryMacSuitable,false);
});
test('packet exports only explicit files into a new private destination and verifies digests',t=>{
  const root=temp(t), path=join(root,'packet'), reads=[];
  writeFileSync(join(root,'.env'),'synthetic-private-do-not-copy');
  const result=writePacket(path,{...source,readSource:p=>{reads.push(p);return source.readSource(p);}});
  assert.deepEqual(reads,PACKET_FILES); assert.equal(result.fileCount,PACKET_FILES.length);
  assert.equal(result.integrityVerified,true); assert.equal(result.readyForActivation,false);
  assert.equal(result.credentialsIncluded,false); assert.equal(statSync(path).mode & 0o777,0o700);
  assert.equal(statSync(join(path,'PACKET_MANIFEST.json')).mode & 0o777,0o600);
  assert.doesNotMatch(readFileSync(join(path,'PACKET_MANIFEST.json'),'utf8'),/synthetic-private/);
  assert.throws(()=>writePacket(path,source),/EEXIST/);
  assert.deepEqual(verifyPacket(path),result);
});
test('missing committed source fails before creating a destination',t=>{
  const path=join(temp(t),'packet');
  assert.throws(()=>writePacket(path,{...source,readSource:()=>{throw Error('missing source');}}),/missing source/);
  assert.throws(()=>statSync(path),/ENOENT/);
  assert.throws(()=>writePacket(path,{...source,sourceCommit:'HEAD'}));
});
test('unexpected secret files, altered bytes and missing files invalidate packet integrity',t=>{
  const path=packet(t), target=join(path,PACKET_FILES[0]), original=readFileSync(target);
  writeFileSync(join(path,'.env'),'synthetic-only'); assert.throws(()=>verifyPacket(path),/unexpected/);
  rmSync(join(path,'.env')); writeFileSync(target,'tampered'); assert.throws(()=>verifyPacket(path),/content/);
  writeFileSync(target,original); rmSync(target); assert.throws(()=>verifyPacket(path),/Missing/);
});
test('symlinks and unlisted directories are refused without following them',t=>{
  const path=packet(t), external=join(dirname(path),'external');mkdirSync(external);
  symlinkSync(external,join(path,'linked')); assert.throws(()=>verifyPacket(path),/symlinks/);unlinkSync(join(path,'linked'));
  mkdirSync(join(path,'unlisted'));assert.throws(()=>verifyPacket(path),/Unexpected/);rmSync(join(path,'unlisted'),{recursive:true});
  symlinkSync(path,join(dirname(path),'alias'));assert.throws(()=>verifyPacket(join(dirname(path),'alias')));
});
test('manifest cannot authorize readiness, assign a host, use traversal, duplicate files or omit digests',t=>{
  const path=packet(t), original=readFileSync(join(path,'PACKET_MANIFEST.json'));
  for(const edit of [m=>{m.readyForActivation=true;},m=>{m.credentialsIncluded=true;},m=>{m.host='some-host';},
    m=>{m.origin='https://scanner.invalid';},m=>{m.unexpected=true;},m=>{m.files[0].path='../escape';},
    m=>{m.files[0].sha256='bad';},m=>{m.files[0]=m.files[1];},m=>{m.files.pop();}]) {
    editManifest(path,edit);assert.throws(()=>verifyPacket(path));writeFileSync(join(path,'PACKET_MANIFEST.json'),original);
  }
});
test('profile pins ARM Ubuntu24.04 without inherited mounts, provisioning or public forwards',()=>{
  const text=readFileSync(new URL('../scripts/private-scanner/home-mac/lima.yaml',import.meta.url),'utf8');
  assert.match(text,/ubuntu-24\.04-server-cloudimg-arm64\.img/);assert.match(text,/digest: sha256:[a-f0-9]{64}/);
  assert.match(text,/mounts: \[\]/);assert.match(text,/networks: \[\]/);assert.match(text,/guestIPMustBeZero: false/);
  assert.match(text,/hostIP: 127\.0\.0\.1/);assert.match(text,/ignore: true/);
  assert.doesNotMatch(text,/^base:|^provision:|^\s*hostIP: 0\.0\.0\.0|vzNAT: true/m);
});
test('unknown activation flags fail without starting services or leaking environment values',()=>{
  const result=spawnSync(process.execPath,[new URL('../scripts/private-scanner/home-mac/prepare.mjs',import.meta.url).pathname,'--start'],
    {encoding:'utf8',env:{PATH:'/usr/bin:/bin',DOCUMENT_SCANNER_TOKEN:'synthetic-never-print'}});
  assert.equal(result.status,1);assert.match(result.stderr,/No services or settings/);
  assert.doesNotMatch(result.stdout+result.stderr,/synthetic-never-print/);
});
