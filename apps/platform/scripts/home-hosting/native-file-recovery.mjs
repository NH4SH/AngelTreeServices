// Reassembles already-authenticated native file components in a NEW private
// directory. No source connection, file deletion, live volume or writer permit.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {createHash} from 'node:crypto';import {pipeline} from 'node:stream/promises';import {Transform} from 'node:stream';import tar from 'tar-stream';
import {canonicalFileIndex,nativeFileIndexSha256,validateNativeFilePatch} from './native-file-patch.mjs';

async function extractChecked(archive,root,index){
 assert.equal(fs.lstatSync(archive).isSymbolicLink(),false);assert.ok(fs.statSync(archive).isFile());
 assert.equal(fs.existsSync(root),false);fs.mkdirSync(root,{recursive:true,mode:0o700});
 const expected=new Map(index.map(row=>[row.path,row])),seen=new Set(),input=fs.createReadStream(archive),extract=tar.extract({allowUnknownFormat:false});
 const transport=pipeline(input,extract);transport.catch(()=>{});let entries=0;
 try{
  for await(const entry of extract){
   assert.ok(++entries<=8192);const h=entry.header;assert.ok(['file','directory'].includes(h.type));
   if(h.type==='directory'){assert.equal(h.size,0);entry.resume();continue;}
   const name=h.name.replace(/^\.\//,'');const row=expected.get(name);assert.ok(row&&!seen.has(name),'Unexpected file component entry');seen.add(name);assert.equal(h.size,row.size);
   const target=path.join(root,name);assert.ok(target.startsWith(root+'/'));fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});
   let size=0;const sha=createHash('sha256'),md5=createHash('md5');
   const check=new Transform({transform(chunk,encoding,callback){try{size+=chunk.length;assert.ok(size<=row.size);sha.update(chunk);md5.update(chunk);callback(null,chunk);}catch(error){callback(error);}}});
   await pipeline(entry,check,fs.createWriteStream(target,{flags:'wx',mode:0o600}));
   assert.equal(size,row.size);assert.equal(sha.digest('hex'),row.sha256);assert.equal('"'+md5.digest('hex')+'"',row.eTag);
  }
  await transport;assert.equal(seen.size,expected.size,'Missing inherited/new file bytes');
 }catch(error){input.destroy(error);extract.destroy(error);await transport.catch(()=>{});throw error;}
}

export async function assembleNativeFileComponents(components,destination){
 assert.ok(Array.isArray(components)&&components.length>0&&components.length<=2048);
 destination=path.resolve(destination);assert.equal(fs.existsSync(destination),false);fs.mkdirSync(destination,{mode:0o700});
 const ids=new Set();let index=[],locations=new Map();
 for(let n=0;n<components.length;n++){
  const c=components[n];assert.match(c.id,/^[a-f0-9-]{36}$/);assert.ok(!ids.has(c.id));ids.add(c.id);const root=destination+'/components/'+c.id;
  if(n===0){assert.equal(c.kind,'base');index=canonicalFileIndex(c.index);await extractChecked(c.archive,root,index);locations=new Map(index.map(row=>[row.path,{row,root}]));}
  else{
   assert.equal(c.kind,'delta');const patch=validateNativeFilePatch(index,c.patch);await extractChecked(c.archive,root,patch.uploaded);
   const added=new Set(patch.uploaded.map(row=>row.path)),next=new Map();
   for(const row of patch.current){const previous=locations.get(row.path);if(added.has(row.path))next.set(row.path,{row,root});
    else{assert.ok(previous,'Inherited file bytes unavailable');assert.equal(previous.row.sha256,row.sha256);assert.equal(previous.row.size,row.size);assert.equal(previous.row.eTag,row.eTag);next.set(row.path,{row,root:previous.root});}}
   index=patch.current;locations=next;
  }
 }
 const current=destination+'/current';fs.mkdirSync(current,{mode:0o700});
 for(const row of index){const from=locations.get(row.path);assert.ok(from);const target=path.join(current,row.path);fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});
  fs.copyFileSync(path.join(from.root,row.path),target,fs.constants.COPYFILE_EXCL);
  const bytes=fs.readFileSync(target);assert.equal(bytes.length,row.size);assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);assert.equal('"'+createHash('md5').update(bytes).digest('hex')+'"',row.eTag);
 }
 fs.writeFileSync(destination+'/file-index.private.json',JSON.stringify(index),{mode:0o600,flag:'wx'});
 return {files:index.length,fileIndexSha256:nativeFileIndexSha256(index),objectsDirectory:current,attributesFile:destination+'/file-index.private.json',
  priorComponentsPreserved:true,linuxAttributesApplied:false,sourceConnectionUsed:false,writeAdmission:false};
}
