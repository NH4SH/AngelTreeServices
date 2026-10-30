import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,writeFileSync,readFileSync,rmSync,copyFileSync,symlinkSync,unlinkSync,statSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomBytes} from 'node:crypto';
import {createDatabaseParts,restoreDatabaseParts,validateDatabaseParts,verifyDatabasePartArtifacts,databasePartBytes} from './database-parts.mjs';import {sha256} from './cloud-policy.mjs';
test('pieces reconstruct every byte, keep credentials private and isolate a one-byte timestamp change',()=>{
 const dir=mkdtempSync(join(tmpdir(),'ats-parts-'));try{
  const original=Buffer.concat([Buffer.from('PGDMP'),randomBytes(databasePartBytes*3+71)]),file=join(dir,'native');writeFileSync(file,original,{mode:0o600});
  const a=createDatabaseParts(file,join(dir,'database.parts'));assert.equal(statSync(join(dir,'database.parts/000000.part')).mode&0o777,0o600);assert.equal(sha256(readFileSync(restoreDatabaseParts(dir,a))),sha256(original));
  original[13]^=1;writeFileSync(file,original);const b=createDatabaseParts(file,join(dir,'changed'));
  assert.equal(a.parts.filter((p,n)=>p.sha256!==b.parts[n].sha256).length,1);assert.equal(a.parts[1].sha256,b.parts[1].sha256);
  const artifacts=Object.fromEntries(a.parts.map(p=>[p.name,{sha256:p.sha256,size:p.size}]));assert.equal(verifyDatabasePartArtifacts({databaseParts:a,databaseSha256:a.sha256},artifacts),a);
  assert.throws(()=>verifyDatabasePartArtifacts({databaseParts:a,databaseSha256:a.sha256},{...artifacts,'database.dump':{sha256:a.sha256}}));
  const reordered=structuredClone(a);reordered.parts.reverse();assert.throws(()=>validateDatabaseParts(reordered));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('missing, corrupted, linked and contradictory pieces cannot produce a valid archive',()=>{
 const dir=mkdtempSync(join(tmpdir(),'ats-bad-parts-'));try{
  const file=join(dir,'native'),bytes=Buffer.concat([Buffer.from('PGDMP'),randomBytes(databasePartBytes+100)]);writeFileSync(file,bytes);const d=createDatabaseParts(file,join(dir,'database.parts'));
  const part=join(dir,'database.parts/000001.part'),saved=readFileSync(part);unlinkSync(part);assert.throws(()=>restoreDatabaseParts(dir,d));unlinkSync(join(dir,'database.dump'));
  writeFileSync(part,Buffer.alloc(saved.length));assert.throws(()=>restoreDatabaseParts(dir,d));unlinkSync(join(dir,'database.dump'));unlinkSync(part);
  symlinkSync(file,part);assert.throws(()=>restoreDatabaseParts(dir,d));unlinkSync(join(dir,'database.dump'));unlinkSync(part);writeFileSync(part,saved);
  const wrong=structuredClone(d);wrong.sha256='0'.repeat(64);assert.throws(()=>restoreDatabaseParts(dir,wrong));
  assert.equal(sha256(readFileSync(restoreDatabaseParts(dir,d))),d.sha256); // A complete, matching file is reusable without an overwrite.
  writeFileSync(join(dir,'database.dump'),Buffer.alloc(d.size));assert.throws(()=>restoreDatabaseParts(dir,d));assert.equal(readFileSync(join(dir,'database.dump'))[0],0);
  const incomplete=structuredClone(d);incomplete.parts.pop();assert.throws(()=>validateDatabaseParts(incomplete));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('explicit 128 KiB layout reduces larger catalogs while preserving the original native archive',()=>{
 const dir=mkdtempSync(join(tmpdir(),'ats-parts-v2-'));try{
  const bytes=Buffer.concat([Buffer.from('PGDMP'),randomBytes(400000)]),file=join(dir,'native');writeFileSync(file,bytes,{mode:0o600});
  const d=createDatabaseParts(file,join(dir,'database.parts'),{partBytes:131072});assert.equal(d.version,2);assert.equal(d.parts.length,4);
  assert.deepEqual(readFileSync(restoreDatabaseParts(dir,d)),bytes);
  assert.throws(()=>validateDatabaseParts({...d,version:1}));assert.throws(()=>validateDatabaseParts({...d,partBytes:262144}));
  assert.throws(()=>createDatabaseParts(file,join(dir,'bad'),{partBytes:524288}));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('256 KiB layout fits larger native database catalogs without changing bytes or accepting unknown formats',()=>{
 const dir=mkdtempSync(join(tmpdir(),'ats-parts-v3-'));try{
  const bytes=Buffer.concat([Buffer.from('PGDMP'),randomBytes(900000)]),file=join(dir,'native');writeFileSync(file,bytes,{mode:0o600});
  const d=createDatabaseParts(file,join(dir,'database.parts'),{partBytes:262144});assert.equal(d.version,3);assert.equal(d.parts.length,4);
  assert.deepEqual(readFileSync(restoreDatabaseParts(dir,d)),bytes);assert.throws(()=>validateDatabaseParts({...d,version:2}));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
