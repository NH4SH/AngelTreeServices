// Copy and verify a NEW synthetic repository. Never prunes, deletes, edits a
// source repository, switches routing or creates a production writer permit.
import assert from 'node:assert/strict';import {readFileSync,writeFileSync,mkdirSync,existsSync,lstatSync,readdirSync,createReadStream} from 'node:fs';import {join} from 'node:path';import {spawnSync} from 'node:child_process';import {verify} from 'node:crypto';
import {sha256,validateInventory,inventoryIdentity} from './cloud-policy.mjs';import {rotationPlan} from './rotation-policy.mjs';import {snapshotArtifactNodes} from './incremental-verifier.mjs';import {artifactFingerprint} from './incremental-policy.mjs';import {restoreDatabaseParts} from './database-parts.mjs';import {verifyPrivateArchive} from './cloud-archive.mjs';
export function nativeExecutor({binary,binarySha256,repo,passwordFile,work}){
 assert.equal(sha256(readFileSync(binary)),binarySha256);return(args,options={})=>{
  const r=spawnSync(binary,['--repo',repo,'--password-file',passwordFile,'--no-cache',...args],{env:{HOME:work,TMPDIR:work,PATH:'/usr/bin:/bin',GOMAXPROCS:'2',GOMEMLIMIT:'256MiB'},encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024,...options});
  assert.equal(r.status,0,'Native rotation operation failed');return r.stdout;
 };
}
export function sourceCatalog(envelope,key,namespace,now=Date.now()){
 const bytes=Buffer.from(envelope.payload,'base64url');assert.ok(bytes.length<=40960&&verify(null,bytes,key,Buffer.from(envelope.signature,'base64url')));const c=JSON.parse(bytes);
 assert.equal(c.kind,'restic-verified-catalog');assert.equal(c.namespace,namespace);assert.equal(c.sourceId,'ats_crm_candidate_20261027');assert.equal(c.writeAdmission,false);assert.ok(Date.parse(c.fullVerifiedAt)<=Date.parse(c.issuedAt)&&Date.parse(c.issuedAt)<=now&&Date.parse(c.expiresAt)>now);assert.equal(Date.parse(c.expiresAt),Date.parse(c.fullVerifiedAt)+86400000);validateInventory(c.objects);return c;
}
export function verifyLocalCiphertext(repo,catalog){
 const paths=[];function walk(folder,prefix=''){for(const e of readdirSync(folder,{withFileTypes:true})){assert.ok(!e.isSymbolicLink());if(e.isDirectory())walk(join(folder,e.name),prefix+e.name+'/');else paths.push(prefix+e.name);}}walk(repo);
 assert.deepEqual(paths.sort(),catalog.objects.map(o=>o.name).sort(),'Local repository has missing or unexpected objects');
 for(const o of catalog.objects){const bytes=readFileSync(join(repo,o.name));assert.equal(bytes.length,o.size);assert.equal(sha256(bytes),o.sha256);}return true;
}
export function copyRotation({binary,binarySha256,sourceRepo,sourcePasswordFile,targetRepo,targetPasswordFile,work,namespace,catalog,certifiedRoots=[],pinned=[]}){
 verifyLocalCiphertext(sourceRepo,catalog);assert.equal(existsSync(targetRepo),false);assert.notEqual(sourceRepo,targetRepo);
 const source=nativeExecutor({binary,binarySha256,repo:sourceRepo,passwordFile:sourcePasswordFile,work});source(['check','--read-data']);const snapshots=JSON.parse(source(['snapshots','--json']));
 const target=nativeExecutor({binary,binarySha256,repo:targetRepo,passwordFile:targetPasswordFile,work});
 target(['init','--repository-version','2','--copy-chunker-params','--from-repo',sourceRepo,'--from-password-file',sourcePasswordFile]);
 const plan=rotationPlan({namespace,sourceRepositoryId:JSON.parse(source(['cat','config'])).id,targetRepositoryId:JSON.parse(target(['cat','config'])).id,sourceInventory:catalog.objects,
  snapshots:snapshots.map(s=>({snapshotId:s.id,captureStartedAt:s.time})),verified:certifiedRoots,pinned});assert.ok(plan.protectedSnapshotIds.length<=8,'Too many retained roots for this bounded rehearsal');
 target(['--pack-size','8','copy','--from-repo',sourceRepo,'--from-password-file',sourcePasswordFile,...plan.protectedSnapshotIds]);target(['check','--read-data']);
 const copied=JSON.parse(target(['snapshots','--json']));assert.equal(copied.length,plan.protectedSnapshotIds.length);const mapping=[];
 for(const id of plan.protectedSnapshotIds){const s=snapshots.find(s=>s.id===id),matches=copied.filter(d=>(d.original??d.id)===(s.original??s.id));assert.equal(matches.length,1,'Ambiguous copied snapshot identity');const d=matches[0];assert.deepEqual(d.paths,s.paths);assert.equal(d.time,s.time);assert.equal(d.hostname,s.hostname);assert.equal(d.tree,s.tree);mapping.push({sourceSnapshotId:id,targetSnapshotId:d.id,capturePath:s.paths[0]});}
 verifyLocalCiphertext(sourceRepo,catalog);return {plan,mapping};
}
export async function verifyRotationRoots({binary,binarySha256,repo,passwordFile,work,namespace,mapping,sourceRepo,sourcePasswordFile,sourceCertificates=[]}){
 const run=nativeExecutor({binary,binarySha256,repo,passwordFile,work}),from=nativeExecutor({binary,binarySha256,repo:sourceRepo,passwordFile:sourcePasswordFile,work});run(['check','--read-data']);
 const certs=new Map(sourceCertificates.map(c=>[c.snapshotId,c])),results=[];
 async function inspect(execute,snapshotId,path,folder){
  assert.match(path,new RegExp('^/home/noelsierra\\.guest/candidate/continuous-'+namespace.slice(-12)+'/capture-[1-9][0-9]*$'));
  const stats=JSON.parse(execute(['stats',snapshotId,'--mode','restore-size','--json']));assert.ok(stats.total_size<=192*1024*1024&&stats.total_file_count<=2048);assert.equal(existsSync(folder),false);mkdirSync(folder,{mode:0o700});execute(['restore',snapshotId+':'+path,'--target',folder,'--verify']);
  const tree=JSON.parse(execute(['cat','tree',snapshotId+':'+path])),parts=tree.nodes.some(n=>n.name==='database.parts')?JSON.parse(execute(['cat','tree',snapshotId+':'+path+'/database.parts'])):undefined,nodes=snapshotArtifactNodes(tree,parts);
  const artifacts=Object.fromEntries(nodes.map(n=>[n.name,{fingerprint:artifactFingerprint(n),size:n.size,sha256:sha256(readFileSync(join(folder,n.name)))}]));
  const m=JSON.parse(readFileSync(join(folder,'manifest.private.json')));assert.equal(m.syntheticOnly,true);assert.equal(m.namespace,namespace);assert.equal(m.sourceMigrationCount,102);assert.equal(m.binding.sourceId,'ats_crm_candidate_20261027');
  for(const name of ['auth.users','public.payments','public.invoices','public.email_events','app_private.outbound_delivery_requests','app_private.outbound_delivery_attempts'])assert.ok(m.database.tables.some(t=>t.name===name));
  if(m.databaseParts)restoreDatabaseParts(folder,m.databaseParts);
  for(const[file,key]of[['database.dump','databaseSha256'],['objects.tar','objectArchiveSha256'],['release-source.tar.gz','releaseSourceSha256']]){assert.ok(lstatSync(join(folder,file)).isFile());assert.equal(sha256(readFileSync(join(folder,file))),m[key]);}
  await verifyPrivateArchive(createReadStream(join(folder,'objects.tar')),m.objects,{deadline:Date.now()+30000});return {artifacts,manifestSha256:sha256(readFileSync(join(folder,'manifest.private.json'))),folder};
 }
 for(let i=0;i<mapping.length;i++){
  const map=mapping[i],target=await inspect(run,map.targetSnapshotId,map.capturePath,join(work,'target-root-'+i));let expected=certs.get(map.sourceSnapshotId)?.artifacts;
  if(!expected)expected=(await inspect(from,map.sourceSnapshotId,map.capturePath,join(work,'source-unknown-root-'+i))).artifacts;
  assert.deepEqual(target.artifacts,expected,'Copied artifact bytes, permissions or ownership differ');
  results.push({...map,manifestSha256:target.manifestSha256,artifactsSha256:sha256(JSON.stringify(Object.entries(target.artifacts).sort(([a],[b])=>a.localeCompare(b)))),sourceArtifactsMatched:true,restoredDirectory:target.folder});
 }
 return results;
}
