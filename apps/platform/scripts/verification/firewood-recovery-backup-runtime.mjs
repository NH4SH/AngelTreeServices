// Fresh rootless, network-none fixture volume only; never mounts a CRM volume.
import fs from 'node:fs';import assert from 'node:assert/strict';import {spawnSync}from'node:child_process';import{fileURLToPath}from'node:url';
import{archiveReferencedPaths,fileUtilityImage}from'./firewood-recovery-backup-utility.mjs';
assert.equal(process.env.ATS_FIREWOOD_BACKUP_CONTROL,'1');assert.equal(process.platform,'linux');assert.equal(process.getuid(),501);process.umask(0o077);
const root=fileURLToPath(new URL('.',import.meta.url)).replace(/\/$/,''),id=root.slice(-12);assert.match(root,/^\/home\/noelsierra\.guest\/ats-firewood-backup-control-20261029-[a-f0-9]{12}$/);const project='ats_crm_recovery_'+id,volume=project+'_object-data',env={HOME:process.env.HOME,PATH:'/usr/bin:/bin',DOCKER_HOST:'unix:///run/user/501/docker.sock'};let step=0;
function command(bin,args,{input,timeout=10000,allowFailure=false,file}={}){let out;const p=spawnSync(bin,args,{env,input,encoding:file?undefined:'utf8',stdio:file?['ignore',(out=fs.openSync(file,'wx',0o600)),'pipe']:['pipe','pipe','pipe'],timeout,maxBuffer:2**20});if(out!==undefined)fs.closeSync(out);fs.writeFileSync(root+'/runtime-'+(++step)+'.private.log',String(file?'archive bytes withheld':p.stdout??'')+'\n'+String(p.stderr??''),{mode:0o600});if(!allowFailure)assert.equal(p.status,0,'Owned utility fixture failed; inspect private log '+step);return p;}
const docker=(args,o)=>command('/usr/bin/docker',args,o);
assert.notEqual(docker(['volume','inspect',volume],{allowFailure:true}).status,0);docker(['image','inspect',fileUtilityImage]);
const inventory={version:1,id,project,volume,purpose:'backup-control-rehearsal',createdAt:new Date().toISOString(),productionMounts:false,network:'none'};fs.writeFileSync(root+'/creation-inventory.json',JSON.stringify(inventory,null,2),{mode:0o600});
docker(['volume','create','--label','ats-purpose=backup-control-rehearsal','--label','ats-test='+id,volume]);
let proof;
try{
 const base=['run','--rm','--network','none','--read-only','--cap-drop','ALL','--pids-limit','32','--memory','128m','--memory-swap','128m','--cpus','0.5','--label','ats-purpose=backup-control-rehearsal','--label','ats-test='+id,'--mount','type=volume,src='+volume+',dst=/input'];
 docker([...base,'--cap-add','CHOWN','--user','0:0',fileUtilityImage,'node','-e','require("fs").chownSync("/input",1000,1000)']);
 const content='Synthetic backup archive only; no customer or provider information.';
 docker([...base,'--user','1000:1000',fileUtilityImage,'node','-e','const f=require("fs");f.mkdirSync("/input/synthetic/object",{recursive:true});f.writeFileSync("/input/synthetic/object/version",'+JSON.stringify(content)+')']);
 const limits=['--rm','--network','none','--read-only','--user','1000:1000','--cap-drop','ALL','--security-opt','no-new-privileges:true','--memory','128m','--memory-swap','128m','--cpus','0.5','--pids-limit','32','--ulimit','core=0:0','--mount','type=volume,src='+volume+',dst=/input,readonly'];
 const io={folder:root,id,project,run:command,binary(args,file,options){return docker(args,{...options,file});}};
 const started=Date.now();for(let i=0;i<20;i++){archiveReferencedPaths(io,root+'/empty-'+i+'.tar',[],limits);assert.equal(command('/usr/bin/tar',['-tf',root+'/empty-'+i+'.tar']).stdout,'');}
 archiveReferencedPaths(io,root+'/nonempty.tar',['synthetic/object/version'],limits);assert.equal(command('/usr/bin/tar',['-xOf',root+'/nonempty.tar','synthetic/object/version']).stdout,content);
 let blockedName;
 const fault={...io,binary(args){const source=args.find(v=>v.startsWith('type=bind,src=')).slice('type=bind,src='.length).split(',')[0];fs.unlinkSync(source);command('/usr/bin/mkfifo',[source]);fs.chmodSync(source,0o644);blockedName=args[args.indexOf('--name')+1];docker([args[0],'--detach',...args.slice(1)]);throw Error('Synthetic stalled file-list reader');}};
 assert.throws(()=>archiveReferencedPaths(fault,root+'/blocked.tar',['synthetic/object/version'],limits),/Synthetic stalled file-list reader/);
 const absent=docker(['inspect',blockedName],{allowFailure:true});assert.notEqual(absent.status,0);assert.match(absent.stderr,/No such (?:object|container)/i);
 proof={passed:true,id,emptyArchivesVerified:20,nonemptyArchiveBytesMatched:true,interactiveDockerStdinUsed:false,realBlockedReaderKilledByExactIdentity:true,ownedUtilityAbsent:true,elapsedMs:Date.now()-started,productionChanged:false,existingVolumesMounted:false,providerCalls:0,at:new Date().toISOString()};
}finally{
 const v=JSON.parse(docker(['volume','inspect',volume]).stdout)[0];assert.equal(v.Name,volume);assert.equal(v.Labels['ats-test'],id);assert.equal(v.Labels['ats-purpose'],'backup-control-rehearsal');docker(['volume','rm',volume]);
}
assert.ok(proof);proof.ownedVolumeRemoved=true;fs.writeFileSync(root+'/runtime-proof.json',JSON.stringify(proof,null,2),{mode:0o600});console.log(proof);
