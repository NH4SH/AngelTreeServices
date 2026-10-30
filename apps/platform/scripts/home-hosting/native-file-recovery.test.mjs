import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';import {createHash,randomUUID} from 'node:crypto';
import {buildNativeFilePatch} from './native-file-patch.mjs';import {assembleNativeFileComponents} from './native-file-recovery.mjs';
const row=(name,bytes,xattrs={})=>({path:name,size:Buffer.byteLength(bytes),sha256:createHash('sha256').update(bytes).digest('hex'),eTag:'"'+createHash('md5').update(bytes).digest('hex')+'"',xattrs});
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'ats-file-recovery-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));let number=0;
 return {root,archive(files){const folder=root+'/payload-'+(++number);fs.mkdirSync(folder);for(const[name,bytes]of Object.entries(files)){const file=folder+'/'+name;fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);}const archive=folder+'.tar';execFileSync('/usr/bin/tar',['--format=ustar','-cf',archive,'-C',folder,'--',...Object.keys(files)],{env:{...process.env,COPYFILE_DISABLE:'1'}});return archive;}};}
test('base plus changed-file deltas reconstruct the exact current bytes and metadata without deleting history',async t=>{
 const f=fixture(t),a=row('tenant/a','old'),b=row('tenant/b','new'),changed=row('tenant/a','replacement',{'user.supabase.content-type':'dGV4dC9wbGFpbg=='});
 const parts=[{id:randomUUID(),kind:'base',index:[a],archive:f.archive({'tenant/a':'old'})},
  {id:randomUUID(),kind:'delta',patch:buildNativeFilePatch([a],[a,b]),archive:f.archive({'tenant/b':'new'})},
  {id:randomUUID(),kind:'delta',patch:buildNativeFilePatch([a,b],[changed]),archive:f.archive({'tenant/a':'replacement'})}];
 const result=await assembleNativeFileComponents(parts,f.root+'/restored');assert.equal(result.files,1);assert.equal(fs.readFileSync(result.objectsDirectory+'/tenant/a','utf8'),'replacement');assert.equal(fs.existsSync(result.objectsDirectory+'/tenant/b'),false);
 assert.equal(fs.readFileSync(f.root+'/restored/components/'+parts[0].id+'/tenant/a','utf8'),'old');assert.deepEqual(JSON.parse(fs.readFileSync(result.attributesFile)),[changed]);assert.equal(result.writeAdmission,false);
});
test('missing, wrong or corrupted parent/new payloads cannot produce a complete file assembly',async t=>{
 const f=fixture(t),a=row('tenant/a','old'),b=row('tenant/b','new');const base={id:randomUUID(),kind:'base',index:[a],archive:f.archive({'tenant/a':'old'})};
 const delta={id:randomUUID(),kind:'delta',patch:buildNativeFilePatch([a],[a,b]),archive:f.archive({'tenant/b':'bad'})};
 await assert.rejects(assembleNativeFileComponents([base,delta],f.root+'/corrupt'));
 await assert.rejects(assembleNativeFileComponents([{...base,index:[]} ,delta],f.root+'/wrong-parent'));
 await assert.rejects(assembleNativeFileComponents([base,{...delta,archive:f.archive({'tenant/other':'new'})}],f.root+'/missing-new'));
});
