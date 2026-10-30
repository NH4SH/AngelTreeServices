// Transport pieces of an unmodified native PostgreSQL custom archive. No SQL,
// encryption or PostgreSQL archive-header rewriting occurs here.
import assert from 'node:assert/strict';
import {openSync,closeSync,readSync,writeSync,mkdirSync,writeFileSync,readFileSync,existsSync,lstatSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {sha256} from './cloud-policy.mjs';
export const databasePartBytes=65536,databaseMaxBytes=128*1024*1024;
export const isDatabasePart=name=>/^database\.parts\/[0-9]{6}\.part$/.test(name);
const nameFor=n=>'database.parts/'+String(n).padStart(6,'0')+'.part';
export function validateDatabaseParts(d){
 assert.ok([1,2,3].includes(d.version));assert.equal(d.format,'pg-custom-parts');assert.equal(d.partBytes,[0,databasePartBytes,131072,262144][d.version]);
 assert.ok(Number.isSafeInteger(d.size)&&d.size>0&&d.size<=databaseMaxBytes);
 assert.match(d.sha256,/^[a-f0-9]{64}$/);assert.ok(Array.isArray(d.parts));assert.equal(d.parts.length,Math.ceil(d.size/d.partBytes));
 let total=0;for(const[p,n]of d.parts.map((p,n)=>[p,n])){
  assert.equal(p.name,nameFor(n));assert.equal(p.size,Math.min(d.partBytes,d.size-total));assert.match(p.sha256,/^[a-f0-9]{64}$/);total+=p.size;
 }
 assert.equal(total,d.size);assert.equal(d.catalogSha256,sha256(JSON.stringify(d.parts)));return d;
}
export function createDatabaseParts(databasePath,directory,{partBytes=databasePartBytes}={}){
 assert.ok([databasePartBytes,131072,262144].includes(partBytes));
 const stat=lstatSync(databasePath);assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<=databaseMaxBytes);
 assert.equal(existsSync(directory),false);mkdirSync(directory,{mode:0o700});
 const fd=openSync(databasePath,'r'),hash=createHash('sha256'),parts=[];let total=0;
 try{for(let n=0;total<stat.size;n++){
  const bytes=Buffer.alloc(Math.min(partBytes,stat.size-total));let got=0;
  while(got<bytes.length){const count=readSync(fd,bytes,got,bytes.length-got,total+got);assert.ok(count>0,'Archive changed during splitting');got+=count;}
  if(n===0)assert.equal(bytes.subarray(0,5).toString(),'PGDMP','Native custom archive required');
  hash.update(bytes);const name=nameFor(n);writeFileSync(join(directory,name.split('/')[1]),bytes,{flag:'wx',mode:0o600});parts.push({name,size:bytes.length,sha256:sha256(bytes)});total+=bytes.length;
 }}finally{closeSync(fd);}
 assert.equal(lstatSync(databasePath).size,stat.size);
 return validateDatabaseParts({version:[databasePartBytes,131072,262144].indexOf(partBytes)+1,format:'pg-custom-parts',partBytes,size:total,sha256:hash.digest('hex'),parts,catalogSha256:sha256(JSON.stringify(parts))});
}
export function verifyDatabasePartArtifacts(manifest,artifacts){
 const d=validateDatabaseParts(manifest.databaseParts);assert.equal(manifest.databaseSha256,d.sha256);
 const actual=Object.keys(artifacts).filter(isDatabasePart).sort();assert.deepEqual(actual,d.parts.map(p=>p.name));assert.equal(artifacts['database.dump'],undefined);
 for(const p of d.parts){assert.equal(artifacts[p.name].size,p.size);assert.equal(artifacts[p.name].sha256,p.sha256,'Database piece differs from manifest');}return d;
}
export function restoreDatabaseParts(directory,descriptor){
 const d=validateDatabaseParts(descriptor),output=join(directory,'database.dump');
 // An earlier verifier may already have reconstructed it. Never overwrite it.
 if(existsSync(output)){const stat=lstatSync(output);assert.ok(stat.isFile()&&!stat.isSymbolicLink());assert.equal(stat.size,d.size);assert.equal(sha256(readFileSync(output)),d.sha256);return output;}
 const folder=join(directory,'database.parts');assert.ok(lstatSync(folder).isDirectory()&&!lstatSync(folder).isSymbolicLink());
 const fd=openSync(output,'wx',0o600),hash=createHash('sha256');let total=0;
 try{for(const[p,n]of d.parts.map((p,n)=>[p,n])){
  const file=join(directory,p.name),stat=lstatSync(file);assert.ok(stat.isFile()&&!stat.isSymbolicLink());assert.equal(stat.size,p.size);
  const bytes=readFileSync(file);assert.equal(sha256(bytes),p.sha256,'Corrupt database piece');if(n===0)assert.equal(bytes.subarray(0,5).toString(),'PGDMP');
  hash.update(bytes);let wrote=0;while(wrote<bytes.length)wrote+=writeSync(fd,bytes,wrote,bytes.length-wrote);total+=bytes.length;
 }}finally{closeSync(fd);}
 assert.equal(total,d.size);assert.equal(hash.digest('hex'),d.sha256,'Reconstructed archive hash differs');return output;
}
