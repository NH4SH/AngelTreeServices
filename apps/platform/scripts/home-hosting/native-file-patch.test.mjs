import {test} from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {buildNativeFilePatch,validateNativeFilePatch,canonicalFileIndex,verifyNativeFilePatchArchive} from './native-file-patch.mjs';
const file=(path,tag='a',size=34)=>({path,size,sha256:tag.repeat(64),eTag:'"'+tag.repeat(32)+'"',xattrs:{'user.supabase.content-type':'dGV4dC9wbGFpbg==','user.supabase.cache-control':'bm8tY2FjaGU='}});
test('a new private file transports only its bytes while retaining the prior inventory',()=>{
  const a=file('tenant/bucket/one/v1'),b=file('tenant/bucket/two/v2','b');const p=buildNativeFilePatch([a],[b,a]);
  assert.equal(p.uploadedBytes,34);assert.deepEqual(p.uploaded,[b]);assert.deepEqual(p.inheritedPaths,[a.path]);assert.equal(p.current.length,2);
  assert.deepEqual(validateNativeFilePatch([a],p),p);assert.equal(p.writeAdmission,false);assert.equal(p.objectDeletionAllowed,false);
});
test('unchanged files, metadata-only changes and removed paths require no repeated file bytes',()=>{
  const a=file('tenant/a'),b=file('tenant/b','b'),changed={...a,xattrs:{'user.supabase.content-type':'dGV4dC9wbGFpbg=='}};
  const p=buildNativeFilePatch([a,b],[changed]);assert.equal(p.uploadedBytes,0);assert.deepEqual(p.metadataOnlyPaths,[a.path]);assert.deepEqual(p.removedPaths,[b.path]);
  assert.deepEqual(buildNativeFilePatch([a],[a]).uploaded,[]);
});
test('byte changes at an existing path require a new verified payload',()=>{
  const a=file('tenant/a'),changed=file('tenant/a','c');const p=buildNativeFilePatch([a],[changed]);
  assert.deepEqual(p.uploaded,[changed]);assert.deepEqual(p.inheritedPaths,[]);
});
test('a wrong parent, forged reuse, hidden upload, changed digest or extra authority claim fails',()=>{
  const a=file('tenant/a'),b=file('tenant/b','b'),p=buildNativeFilePatch([a],[a,b]);
  assert.throws(()=>validateNativeFilePatch([],p));
  for(const mutate of [p=>p.inheritedPaths.push(b.path),p=>p.uploaded=[],p=>p.currentIndexSha256='f'.repeat(64),p=>p.writeAdmission=true,p=>p.extra='unexpected']){
    const bad=structuredClone(p);mutate(bad);assert.throws(()=>validateNativeFilePatch([a],bad));
  }
});
test('unsafe paths, duplicate paths, unsupported attributes and excessive payloads fail before I/O',()=>{
  for(const path of ['/absolute','a/../b','a//b','a/./b','a\\b','a\0b'])assert.throws(()=>canonicalFileIndex([file(path)]));
  assert.throws(()=>canonicalFileIndex([file('a'),file('a')]));
  assert.throws(()=>canonicalFileIndex([{...file('a'),xattrs:{unreviewed:'YQ=='}}]));
  assert.throws(()=>canonicalFileIndex([file('a','a',25*1024*1024+1)]));
});
test('inventory digests are stable across input/key ordering and preserve non-ASCII paths',()=>{
  const a=file('tenant/é'),b=file('tenant/Z','b'),reordered={...a,xattrs:Object.fromEntries(Object.entries(a.xattrs).reverse())};
  assert.equal(buildNativeFilePatch([a,b],[a,b]).currentIndexSha256,buildNativeFilePatch([b,reordered],[b,reordered]).currentIndexSha256);
});
test('the real archive verifier rejects missing, extra and corrupt changed-file payloads',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ats-file-patch-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(path.join(root,'tenant'));fs.writeFileSync(path.join(root,'tenant/a'),'new');fs.writeFileSync(path.join(root,'tenant/extra'),'extra');
  const a={...file('tenant/a'),size:3,sha256:createHash('sha256').update('new').digest('hex'),eTag:'"'+createHash('md5').update('new').digest('hex')+'"'};
  const patch=buildNativeFilePatch([],[a]);
  const archive=names=>{const name=path.join(root,'payload.tar');execFileSync('/usr/bin/tar',['--format=ustar','-cf',name,'-C',root,'--',...names],{env:{...process.env,COPYFILE_DISABLE:'1'}});return fs.createReadStream(name);};
  const passed=await verifyNativeFilePatchArchive(archive(['tenant/a']),[],patch);assert.equal(passed.newFilesVerified,1);assert.equal(passed.newBytesVerified,3);assert.equal(passed.completeRecoveryPackage,false);
  await assert.rejects(verifyNativeFilePatchArchive(archive(['tenant/extra']),[],patch));
  await assert.rejects(verifyNativeFilePatchArchive(archive(['tenant/a','tenant/extra']),[],patch));
  const wrongETag=buildNativeFilePatch([],[{...a,eTag:'"'+'0'.repeat(32)+'"'}]);await assert.rejects(verifyNativeFilePatchArchive(archive(['tenant/a']),[],wrongETag),/ETag differs/);
  fs.writeFileSync(path.join(root,'tenant/a'),'bad');await assert.rejects(verifyNativeFilePatchArchive(archive(['tenant/a']),[],patch));
});
