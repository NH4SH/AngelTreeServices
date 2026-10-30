import {archiveReferencedPaths} from './bounded-file-archive.mjs';
import assert from 'node:assert/strict';import fs from 'node:fs';import {storageAttributeNames,storageMetadataImage,validateObjectAttributes} from './object-file-metadata.mjs';
import {buildNativeFilePatch,canonicalFileIndex} from './native-file-patch.mjs';
import {backupSourceScope,onlineBackupSourceScope} from './backup-source-scope.mjs';
const utilityImage='node:22.23.4-bookworm-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d';
export function referencedObjectPaths(rows,tenant,{expectedBinding}={}){
 assert.match(tenant,backupSourceScope(expectedBinding).tenant);assert.ok(Array.isArray(rows)&&rows.length<=512);let total=0;const seen=new Set();
 return rows.map(row=>{
  assert.match(row.bucketId,/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/);assert.match(row.version,/^[a-f0-9-]{36}$/);
  assert.equal(typeof row.name,'string');assert.ok(Buffer.byteLength(row.name)<=768&&!/[\u0000-\u001f\\]/.test(row.name)&&!row.name.split('/').some(p=>!p||p==='.'||p==='..'));
  assert.ok(Number.isSafeInteger(row.size)&&row.size>=0&&row.size<=25*1024*1024);total+=row.size;assert.ok(total<=64*1024*1024);
  assert.match(row.eTag,/^"[a-f0-9]{32}"$/,'The reviewed file backend requires its committed MD5 ETag');
  const path=[tenant,tenant,row.bucketId,row.name,row.version].join('/');assert.ok(!seen.has(path));seen.add(path);return {path,size:row.size,eTag:row.eTag};
 }).sort((a,b)=>a.path.localeCompare(b.path));
}
export function captureReferencedObjectFiles(io,destination,rows){
 return captureFiles(io,destination,rows).inventory;
}
export function fileIndexFromInventory(inventory,references){
 const refs=new Map(references.map(r=>[r.path,r]));assert.equal(refs.size,inventory.length);
 return canonicalFileIndex(inventory.map(row=>{const ref=refs.get(row.path);assert.ok(ref);assert.equal(row.size,ref.size);return {...row,eTag:ref.eTag};}));
}
export function captureReferencedObjectFilePatch(io,destination,rows,parent){
 let patch,index;
 const result=captureFiles(io,destination,rows,{archive:'objects.patch.tar',select:(inventory,references)=>{
  index=fileIndexFromInventory(inventory,references);patch=buildNativeFilePatch(parent,index);return patch.uploaded.map(r=>r.path);
 }});
 assert.deepEqual(fileIndexFromInventory(result.inventory,result.references),index);
 return {patch,index};
}
function captureFiles(io,destination,rows,{archive='objects.tar',select}={}){
 onlineBackupSourceScope(io);
 const references=referencedObjectPaths(rows,io.config.id,{expectedBinding:io.productionBinding}),volume=io.project+'_object-data';
 const limits=['--rm','--network','none','--read-only','--user','1000:1000','--cap-drop','ALL','--security-opt','no-new-privileges:true','--memory','128m','--memory-swap','128m','--cpus','0.5','--pids-limit','32','--ulimit','core=0:0','--mount','type=volume,src='+volume+',dst=/input,readonly'];
 const code=`const fs=require('fs'),p=require('path'),c=require('crypto'),x=require('fs-xattr'),assert=require('assert/strict');let input='';process.stdin.on('data',b=>input+=b);process.stdin.on('end',()=>{try{
 const {references,attributes}=JSON.parse(input),rows=[];for(const ref of references){let path='/input';for(const part of ref.path.split('/')){path=p.join(path,part);assert.equal(fs.lstatSync(path).isSymbolicLink(),false);}assert.ok(fs.statSync(path).isFile());
  const b=fs.readFileSync(path);assert.equal(b.length,ref.size);assert.equal('"'+c.createHash('md5').update(b).digest('hex')+'"',ref.eTag);const xattrs={};
  for(const name of attributes){try{const value=x.getAttributeSync(path,name);if(value!==undefined)xattrs[name]=value.toString('base64');}catch(error){if(!['ENODATA','ENOATTR'].includes(error.code))throw error;}}
  rows.push({path:ref.path,size:b.length,sha256:c.createHash('sha256').update(b).digest('hex'),xattrs});
 }console.log(JSON.stringify(rows));}catch(error){console.error(error);process.exitCode=1;}});`;
 const inventory=()=>JSON.parse(io.docker(['run','--interactive',...limits,'--entrypoint','node',storageMetadataImage,'-e',code],{input:JSON.stringify({references,attributes:storageAttributeNames})}));
 const before=inventory();validateObjectAttributes(before);
 const paths=select?select(before,references):references.map(r=>r.path);assert.equal(new Set(paths).size,paths.length);assert.ok(paths.every(p=>references.some(r=>r.path===p)));
 archiveReferencedPaths(io,destination+'/'+archive,paths,limits);
 assert.deepEqual(inventory(),before,'A referenced private file changed during its database barrier');return {inventory:before,references};
}
