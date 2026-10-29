// Local rehearsal inputs only. A stopped API boundary is required: this helper
// does not claim that two independently changing stores form an online snapshot.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,copyFileSync,createReadStream} from 'node:fs';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runtimeBlueprint,validateRuntimeBlueprint,restoreRuntimeBlueprint} from './runtime-blueprint.mjs';
import {verifyPrivateArchive} from './cloud-archive.mjs';
import {digest} from './candidate-io.mjs';
import {readRecoveryFile} from './recovery-files.mjs';
import {storageAttributeNames,validateObjectAttributes,storageMetadataImage} from './object-file-metadata.mjs';
import {captureReferencedObjectFiles} from './referenced-object-files.mjs';
import {canonicalFileIndex} from './native-file-patch.mjs';
import {backupSourceScope,onlineBackupSourceScope} from './backup-source-scope.mjs';

const image='node:22.23.4-bookworm-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d';
const inventoryCode=(withAttributes=false)=>`const fs=require('fs'),p=require('path'),c=require('crypto'),rows=[];
const attributes=${withAttributes?JSON.stringify(storageAttributeNames):'null'},xattr=attributes?require('fs-xattr'):null;let total=0;
function walk(dir){
 for(const e of fs.readdirSync(dir,{withFileTypes:true})){
  const path=p.join(dir,e.name);if(e.isSymbolicLink())throw Error('Links forbidden');
  if(e.isDirectory()){walk(path);continue;}
  if(!e.isFile())throw Error('Special files forbidden');const s=fs.statSync(path);
  if(s.size>33554432||rows.length>=512||(total+=s.size)>67108864)throw Error('Bound exceeded');
  const b=fs.readFileSync(path),xattrs={};
  if(attributes)for(const name of attributes){try{const value=xattr.getAttributeSync(path,name);if(value!==undefined)xattrs[name]=value.toString('base64');}catch(error){if(!['ENODATA','ENOATTR'].includes(error.code))throw error;}}
  rows.push({path:p.relative('/input',path),size:b.length,sha256:c.createHash('sha256').update(b).digest('hex'),...(attributes?{xattrs}:{})});
 }
}walk('/input');console.log(JSON.stringify(rows.sort((a,b)=>a.path.localeCompare(b.path))));`;


export function assertClosedWalSource(io){
  io.assertSource();
  for(const service of ['app','api-gw','auth','rest','storage','imgproxy'])assert.equal(io.inspect(io.project+'-'+service+'-1').State.Running,false);
  assert.equal(Number(io.sql("select count(*) from pg_roles where rolcanlogin and rolname not in('postgres','supabase_admin');")),0);
  assert.equal(Number(io.sql("select count(*) from pg_stat_activity where datname=current_database() and usename not in('postgres','supabase_admin');")),0);
}

export function captureWalPair(io,destination,releaseSource){
  assertClosedWalSource(io);
  const collections={objects:captureCollection(io,destination,'objects',io.project+'_object-data','1000:1000')};
  const runtimeSha256=captureWalStatic(io,destination,releaseSource,collections);
  assertClosedWalSource(io);return assemblePair(destination,collections,runtimeSha256,2);
}

function captureCollection(io,destination,name,volume,user){
    const args=['run','--rm','--network','none','--read-only','--user',user,'--cap-drop','ALL','--security-opt','no-new-privileges:true',
      '--pids-limit','32','--memory','128m','--memory-swap','128m','--ulimit','core=0:0','--mount','type=volume,src='+volume+',dst=/input,readonly'];
    const code=inventoryCode(name==='objects');
    const inventoryImage=name==='objects'?storageMetadataImage:image;
    const before=JSON.parse(io.docker([...args,inventoryImage,'node','-e',code]));
    io.binary([...args,'--entrypoint','tar',image,'-C','/input','-cf','-','.'],destination+'/'+name+'.tar');
    const after=JSON.parse(io.docker([...args,inventoryImage,'node','-e',code]));
    assert.deepEqual(after,before,'Recovery files changed while copying');return before;
}

export function captureWalStatic(io,destination,releaseSource,collections={}){
  io.assertSource();collections['db-config']=captureCollection(io,destination,'db-config',io.project+'_db-config','100:101');
  // pgsodium's root key lives outside PGDATA. Preserve it, without reading or
  // printing its value in the coordinator, report, command line or Git.
  assert.ok(collections['db-config'].some(o=>o.path==='pgsodium_root.key'&&o.size===64),'Database key volume incomplete');
  for(const name of ['core.private.env','app.private.env'])copyFileSync(io.root+'/selfhost/'+name,destination+'/'+name);
  copyFileSync(releaseSource,destination+'/release-source.tar.gz');
  const runtime=runtimeBlueprint(io.root+'/selfhost',dirname(fileURLToPath(import.meta.url)));
  validateRuntimeBlueprint(runtime.blueprint,{complete:true,expectedBinding:io.productionBinding});
  writeFileSync(destination+'/runtime.private.json',JSON.stringify(runtime.blueprint),{mode:0o600});
  return runtime.sha256;
}

export function captureOnlineWalPair(io,destination,references,staticState){
  const scope=onlineBackupSourceScope(io);
  const collections={...staticState.collections,objects:captureReferencedObjectFiles(io,destination,references)};
  return assemblePair(destination,collections,staticState.runtimeSha256,3,scope.syntheticOnly);
}

function assemblePair(destination,collections,runtimeSha256,version,syntheticOnly=true){
  const artifacts={};for(const name of ['objects.tar','db-config.tar','core.private.env','app.private.env','release-source.tar.gz','runtime.private.json']){
    const bytes=readFileSync(destination+'/'+name);artifacts[name]={size:bytes.length,sha256:digest(bytes)};
  }
  validateObjectAttributes(collections.objects);
  return {version,syntheticOnly,captureMode:version===3?'transaction-barrier':'quiesced-source',collections,artifacts,runtimeSha256,
    pairingSha256:digest(JSON.stringify({collections,artifacts})),servicesStarted:false};
}

export function walStaticDescriptor(destination,collections,runtimeSha256){
 const artifacts={};for(const name of ['db-config.tar','core.private.env','app.private.env','release-source.tar.gz','runtime.private.json']){
  const bytes=readFileSync(destination+'/'+name);artifacts[name]={size:bytes.length,sha256:digest(bytes)};
 }
 return {collections,artifacts,runtimeSha256};
}

export async function verifyWalPair(folder,pair,{restoreRuntimeTo,objectsIndex,expectedBinding}={}){
  assert.ok([1,2,3].includes(pair.version));assert.equal(pair.syntheticOnly,backupSourceScope(expectedBinding).syntheticOnly);assert.equal(pair.captureMode,pair.version===3?'transaction-barrier':'quiesced-source');
  const names=['app.private.env','core.private.env','db-config.tar','objects.tar','release-source.tar.gz','runtime.private.json'];
  assert.deepEqual(Object.keys(pair.artifacts).sort(),names);
  assert.deepEqual(Object.keys(pair.collections).sort(),['db-config','objects']);
  if(pair.version>=2)validateObjectAttributes(pair.collections.objects);
  assert.equal(pair.pairingSha256,digest(JSON.stringify({collections:pair.collections,artifacts:pair.artifacts})));
  for(const name of names){const bytes=readRecoveryFile(folder,name);assert.equal(bytes.length,pair.artifacts[name].size);assert.equal(digest(bytes),pair.artifacts[name].sha256);}
  if(objectsIndex){
   objectsIndex=canonicalFileIndex(objectsIndex);
   const compare=(a,b)=>Buffer.compare(Buffer.from(a.path),Buffer.from(b.path));
   assert.deepEqual(objectsIndex.map(({eTag,...row})=>row).sort(compare),[...pair.collections.objects].sort(compare));
  }
  for(const name of ['objects','db-config'])await verifyPrivateArchive(createReadStream(folder+'/'+name+'.tar'),name==='objects'&&objectsIndex?objectsIndex:pair.collections[name]);
  const runtime=JSON.parse(readRecoveryFile(folder,'runtime.private.json'));assert.equal(validateRuntimeBlueprint(runtime,{complete:true,expectedBinding}),pair.runtimeSha256);
  if(restoreRuntimeTo)restoreRuntimeBlueprint(runtime,restoreRuntimeTo);
  return {privateFiles:pair.collections.objects.length,databaseConfigurationFiles:pair.collections['db-config'].length,
    exactRuntimeVerified:true,servicesStarted:false};
}
