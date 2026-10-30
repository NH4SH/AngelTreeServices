// Candidate format prototype only. It has no uploader, delete client or writer
// authority. An executor must independently verify uploaded bytes and retain all
// referenced parent components before this can replace full paired captures.
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {validateObjectAttributes} from './object-file-metadata.mjs';
import {verifyPrivateArchive} from './cloud-archive.mjs';
import {recoveryArtifactNames,recoveryProfileFor} from './recovery-profile-context.mjs';
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const compare=(a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b));
export const nativeFileIndexSha256=index=>sha(canonicalFileIndex(index));
export function nativeFileStaticIdentity(pair,databaseRuntimeSha256,{expectedBinding,verifiedProfile}={}){
  assert.match(databaseRuntimeSha256,/^[a-f0-9]{64}$/);assert.match(pair.runtimeSha256,/^[a-f0-9]{64}$/);
  const profile=recoveryProfileFor(expectedBinding,verifiedProfile);
  const names=profile?recoveryArtifactNames(expectedBinding,profile).sort():['app.private.env','core.private.env','db-config.tar','release-source.tar.gz','runtime.private.json'];
  if(profile)assert.deepEqual(Object.keys(pair.artifacts).sort(),[...names,...(Object.hasOwn(pair.artifacts,'objects.tar')?['objects.tar']:[])].sort());
  const artifacts=Object.fromEntries(names.map(n=>{const a=pair.artifacts[n];assert.ok(a);assert.match(a.sha256,/^[a-f0-9]{64}$/);assert.ok(Number.isSafeInteger(a.size)&&a.size>=0);return[n,a];}));
  assert.ok(Array.isArray(pair.collections['db-config']));
  return sha({kind:profile?'native-file-statics-live25-v1':'native-file-statics-v1',databaseRuntimeSha256,runtimeSha256:pair.runtimeSha256,dbConfig:pair.collections['db-config'],artifacts,...(profile?{installationOverlaySha256:profile.installationOverlaySha256,operationalPolicySha256:profile.operationalPolicySha256}:{})});
}
export function nativeFileRecoveryIdentity(staticSha256,index){
  assert.match(staticSha256,/^[a-f0-9]{64}$/);
  return sha({kind:'native-wal-file-state-v1',staticSha256,fileIndexSha256:nativeFileIndexSha256(index)});
}

export function canonicalFileIndex(input) {
  assert.ok(Array.isArray(input)&&input.length<=512);
  const rows=[],seen=new Set();let total=0;
  for(const row of input) {
    assert.deepEqual(Object.keys(row).sort(),['eTag','path','sha256','size','xattrs']);
    assert.equal(typeof row.path,'string');assert.ok(Buffer.byteLength(row.path)>0&&Buffer.byteLength(row.path)<=1024);
    assert.ok(!/[\u0000-\u001f\\]/.test(row.path)&&!row.path.startsWith('/')&&!row.path.split('/').some(x=>!x||x==='.'||x==='..'));
    assert.ok(!seen.has(row.path),'Duplicate private-file path');seen.add(row.path);
    assert.ok(Number.isSafeInteger(row.size)&&row.size>=0&&row.size<=25*1024*1024);
    total+=row.size;assert.ok(total<=1024*1024*1024);
    assert.match(row.sha256,/^[a-f0-9]{64}$/);assert.match(row.eTag,/^"[a-f0-9]{32}"$/);
    validateObjectAttributes([row]);
    rows.push({path:row.path,size:row.size,sha256:row.sha256,eTag:row.eTag,
      xattrs:Object.fromEntries(Object.entries(row.xattrs).sort(([a],[b])=>compare(a,b)))});
  }
  validateObjectAttributes(rows);rows.sort((a,b)=>compare(a.path,b.path));
  assert.ok(Buffer.byteLength(JSON.stringify(rows))<=65536,'Private-file index exceeds the bounded format');
  return rows;
}

export function buildNativeFilePatch(parent,current) {
  const before=canonicalFileIndex(parent),after=canonicalFileIndex(current);
  const old=new Map(before.map(row=>[row.path,row])),paths=new Set(after.map(row=>row.path));
  const uploaded=[],inherited=[],metadataOnly=[];
  for(const row of after) {
    const prior=old.get(row.path);
    if(prior&&prior.size===row.size&&prior.sha256===row.sha256&&prior.eTag===row.eTag) {
      inherited.push(row.path);
      if(JSON.stringify(prior.xattrs)!==JSON.stringify(row.xattrs))metadataOnly.push(row.path);
    } else uploaded.push(row);
  }
  return {version:1,kind:'native-private-file-patch',parentIndexSha256:sha(before),currentIndexSha256:sha(after),
    current:after,uploaded,inheritedPaths:inherited,metadataOnlyPaths:metadataOnly,
    removedPaths:before.filter(row=>!paths.has(row.path)).map(row=>row.path),
    uploadedBytes:uploaded.reduce((n,row)=>n+row.size,0),writeAdmission:false,objectDeletionAllowed:false};
}

export function validateNativeFilePatch(parent,patch) {
  assert.ok(patch&&typeof patch==='object');
  const expected=buildNativeFilePatch(parent,patch.current);
  assert.deepEqual(patch,expected,'Changed file inventory, reuse or payload claims');
  return expected;
}

export async function verifyNativeFilePatchArchive(stream,parent,patch,options={}) {
  const checked=validateNativeFilePatch(parent,patch);
  // This verifies only the new payload. A complete restore still needs the
  // independently certified ancestor bytes for every inherited path.
  await verifyPrivateArchive(stream,checked.uploaded,options);
  return {newFilesVerified:checked.uploaded.length,newBytesVerified:checked.uploadedBytes,
    inheritedFiles:checked.inheritedPaths.length,completeRecoveryPackage:false,writeAdmission:false};
}
