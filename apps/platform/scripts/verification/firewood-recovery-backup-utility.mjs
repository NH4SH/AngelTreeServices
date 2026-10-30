// Proposed backup-runtime helper. Preparation only; no production installation.
import assert from 'node:assert/strict';import fs from 'node:fs';import {randomBytes} from 'node:crypto';
export const fileUtilityImage='node:22.23.4-bookworm-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d';
export function assertUtilityIdentity(info,{name,source,backup,attempt,volume,list}){
 assert.equal(info.Name,'/'+name);assert.match(info.Id,/^[a-f0-9]{64}$/);
 assert.equal(info.Config.Image,fileUtilityImage);assert.equal(info.Config.Labels?.['ats-purpose'],'backup-file-archive');assert.equal(info.Config.Labels?.['ats-source'],source);assert.equal(info.Config.Labels?.['ats-backup-id'],backup);assert.equal(info.Config.Labels?.['ats-attempt'],attempt);
 assert.equal(info.HostConfig.NetworkMode,'none');assert.equal(info.Config.User,'1000:1000');
 assert.deepEqual(info.Config.Entrypoint,['tar']);assert.deepEqual(info.Config.Cmd,['-C','/input','-cf','-','--null','--verbatim-files-from','-T','/names.private']);
 assert.equal(info.Mounts.length,2);const data=info.Mounts.find(m=>m.Destination==='/input'),names=info.Mounts.find(m=>m.Destination==='/names.private');assert.ok(data&&names);assert.equal(data.Name,volume);assert.equal(data.RW,false);assert.equal(names.Source,list);assert.equal(names.RW,false);
}
export function archiveReferencedPaths(io,destination,paths,limits){
 assert.ok(Array.isArray(paths));assert.ok(paths.every(p=>typeof p==='string'&&!p.includes('\0')));
 // Two zero records are a complete empty POSIX tar, without an interactive
 // Docker client or daemon-owned stdin stream to hang on an unchanged delta.
 if(paths.length===0){fs.writeFileSync(destination,Buffer.alloc(1024),{mode:0o600,flag:'wx'});return {empty:true,utilityStarted:false};}
 assert.match(io.id,/^[a-f0-9]{12}$/);assert.match(io.project,/^ats_crm_(?:primary_20261029|candidate_20261027|recovery_[a-f0-9]{12})$/);
 const dir=fs.mkdtempSync(io.folder+'/object-list-');assert.equal(fs.statSync(dir).mode&0o077,0);
 // Parent directory remains private; this list is readable by the unprivileged
 // archive UID only through its explicitly mounted, read-only file.
 const list=dir+'/names.private';fs.writeFileSync(list,paths.map(p=>p+'\0').join(''),{mode:0o600,flag:'wx'});fs.chmodSync(list,0o644);
 const attempt=randomBytes(6).toString('hex'),name='ats_backup_files_'+io.id+'_'+attempt,binding={name,source:io.project,backup:io.id,attempt,volume:io.project+'_object-data',list};
 const absent=p=>p.status!==0&&/No such (?:object|container)/i.test(p.stderr??'');
 const inspect=()=>io.run('/usr/bin/docker',['inspect',name],{timeout:3000,allowFailure:true});
 function clean(){
  let r=inspect();if(absent(r))return;
  assert.equal(r.status,0,'Cannot establish archive utility identity for cleanup');let info=JSON.parse(r.stdout)[0];assertUtilityIdentity(info,binding);
  if(info.State.Running){io.run('/usr/bin/docker',['kill','--signal','KILL',info.Id],{timeout:3000,allowFailure:true});r=inspect();if(absent(r))return;assert.equal(r.status,0);info=JSON.parse(r.stdout)[0];assertUtilityIdentity(info,binding);assert.equal(info.State.Running,false,'Owned archive utility still running');}
  const removed=io.run('/usr/bin/docker',['rm',info.Id],{timeout:3000,allowFailure:true});if(removed.status!==0)assert.ok(absent(removed));
  assert.ok(absent(inspect()),'Owned archive utility cleanup not confirmed');
 }
 try{
  io.binary(['run','--name',name,'--label','ats-purpose=backup-file-archive','--label','ats-source='+io.project,'--label','ats-backup-id='+io.id,'--label','ats-attempt='+attempt,...limits,'--mount','type=bind,src='+list+',dst=/names.private,readonly','--entrypoint','tar',fileUtilityImage,'-C','/input','-cf','-','--null','--verbatim-files-from','-T','/names.private'],destination,{timeout:10000});
 }finally{
  try{clean();}catch(cause){const error=new Error('Archive utility cleanup is unconfirmed; retain capture lock',{cause});error.archiveCleanupUnconfirmed=true;throw error;}
 }
 return {empty:false,utilityStarted:true,cleanupConfirmed:true};
}
