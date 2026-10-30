// Closed synthetic source only. Restore private file bytes AND Linux metadata to
// a fresh volume, then read both through the actual pinned Storage backend.
import assert from 'node:assert/strict';import fs from 'node:fs';import {CandidateIO,digest} from './candidate-io.mjs';
import {captureWalPair,verifyWalPair} from './wal-pairing.mjs';import {storageMetadataImage,storageAttributeNames} from './object-file-metadata.mjs';
assert.equal(process.env.ATS_FILE_METADATA_REHEARSAL,'1');const [id]=process.argv.slice(2);assert.match(id,/^[a-f0-9]{12}$/);
process.env.HOME_FAILOVER_REHEARSAL='1';process.env.ATS_FAILOVER_RUN_ID=id;const io=new CandidateIO();io.folder=io.root+'/file-metadata-'+id;fs.mkdirSync(io.folder,{mode:0o700});
const image='node:22.23.4-bookworm-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d';
let started=false;try{
 assert.equal(io.inspect(io.db).State.Running,false);io.docker(['start',io.db]);started=true;await io.ready();io.assertSource();
 const capture=io.folder+'/capture';fs.mkdirSync(capture,{mode:0o700});
 const pair=captureWalPair(io,capture,process.env.HOME+'/runtime-source.tar.gz');assert.equal(pair.version,2);await verifyWalPair(capture,pair);
 io.json('pair.private.json',pair);const volume='ats_file_metadata_'+id;
 assert.notEqual(io.run('/usr/bin/docker',['volume','inspect',volume],{allowFailure:true}).status,0);io.docker(['volume','create','--label','ats-purpose=synthetic-file-metadata-recovery',volume]);
 const limits=['--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true','--memory','128m','--memory-swap','128m','--cpus','0.5','--pids-limit','32','--ulimit','core=0:0'];
 io.docker(['run','--rm',...limits,'--user','0:0','--cap-add','CHOWN','--mount','type=volume,src='+volume+',dst=/out','--mount','type=bind,src='+capture+',dst=/read,readonly','--entrypoint','sh',image,'-c','set -eu; tar -xf /read/objects.tar -C /out --no-same-owner; chown -R 1000:1000 /out']);
 const program=`const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict'),xattr=require('fs-xattr');
const {FileBackend}=require('./dist/storage/backend/file');let input='';process.stdin.on('data',c=>input+=c);process.stdin.on('end',async()=>{try{
 const {rows,apply,names}=JSON.parse(input),backend=new FileBackend(),result=[];
 for(const row of rows){const file='/input/'+row.path;assert.ok(fs.realpathSync(file).startsWith('/input/'));assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),row.sha256);
  if(apply)for(const name of names){if(Object.hasOwn(row.xattrs,name))xattr.setAttributeSync(file,name,Buffer.from(row.xattrs[name],'base64'));}
  const attrs={};for(const name of names){try{const value=xattr.getAttributeSync(file,name);if(value!==undefined)attrs[name]=value.toString('base64');}catch(error){if(!['ENODATA','ENOATTR'].includes(error.code))throw error;}}
  assert.deepEqual(attrs,row.xattrs);const parts=row.path.split('/'),version=parts.pop(),bucket=parts.shift();
  const head=await backend.headObject(bucket,parts.join('/'),version);result.push({path:row.path,size:head.size,mimetype:head.mimetype,cacheControl:head.cacheControl,contentEncoding:head.contentEncoding,eTag:head.eTag});
 }console.log(JSON.stringify(result));}catch(error){console.error(error);process.exitCode=1;}});`;
 // Offline library initialization only; these synthetic placeholders cannot
 // reach a database and are never written to an application environment file.
 const read=(name,apply)=>JSON.parse(io.docker(['run','--rm','--interactive',...limits,'--user','1000:1000','--env','FILE_STORAGE_BACKEND_PATH=/input','--env','AUTH_JWT_SECRET=synthetic-file-metadata-offline-only','--env','DATABASE_URL=postgresql://unused:unused@127.0.0.1/unused','--mount','type=volume,src='+name+',dst=/input'+(apply?'':',readonly'),'--entrypoint','node',storageMetadataImage,'-e',program],{input:JSON.stringify({rows:pair.collections.objects,apply,names:storageAttributeNames})}));
 const source=read(io.project+'_object-data',false),restored=read(volume,true);assert.deepEqual(restored,source);assert.ok(source.length>=4);
 const count=pair.collections.objects.reduce((n,o)=>n+Object.keys(o.xattrs).length,0);assert.ok(count>0,'Exercise real file metadata, not just attribute-free objects');
 const report={passed:true,syntheticOnly:true,productionChanged:false,sourceFiles:source.length,extendedAttributesMatched:count,backendHeadersMatched:true,allFileHashesMatched:true,storageNode:'24.22.1',applicationServicesStarted:false,sourceArchiveSha256:digest(fs.readFileSync(process.env.HOME+'/runtime-source.tar.gz'))};io.json('result.json',report);console.log(JSON.stringify(report));
}finally{if(started)io.docker(['stop','--time','3',io.db]);}
