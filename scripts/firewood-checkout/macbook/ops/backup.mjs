import {spawn} from 'node:child_process';
import {createReadStream,createWriteStream} from 'node:fs';
import {readFile,writeFile,readdir,stat,open,appendFile,rename,unlink,statfs} from 'node:fs/promises';
import {createCipheriv,createDecipheriv,randomBytes,randomUUID,createHash} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {Writable} from 'node:stream';
import {resolve} from 'node:path';
import {privateDir,privateFile,atomicJson,jsonFile,lease} from './files.mjs';

const MAGIC=Buffer.from('ATSFWBK1');
export const backupName=/^firewood-qa-\d{8}T\d{9}Z-[a-f0-9-]{36}\.fwb$/u;
export async function authenticate(file,key){
  if(key.length!==32)throw new Error('backup_key_required');
  const f=await open(file,'r');let size,head,tag;
  try{size=(await f.stat()).size;if(size<36)throw new Error('invalid_backup');head=Buffer.alloc(20);tag=Buffer.alloc(16);await f.read(head,0,20,0);await f.read(tag,0,16,size-16);}finally{await f.close();}
  if(!head.subarray(0,8).equals(MAGIC))throw new Error('invalid_backup');
  const decipher=createDecipheriv('aes-256-gcm',key,head.subarray(8));decipher.setAuthTag(tag);
  await pipeline(createReadStream(file,{start:20,end:size-17}),decipher,new Writable({write(_chunk,_encoding,next){next();}}));
}
export function retainedNames(items){
  const sorted=[...items].sort((a,b)=>b.createdAt-a.createdAt),keep=new Set(sorted.slice(0,24).map(x=>x.name)),days=new Set();
  for(const item of sorted){const day=new Date(item.createdAt).toISOString().slice(0,10);if(days.has(day))continue;if(days.size===7)break;days.add(day);keep.add(item.name);}
  return keep;
}
export async function prune(folder,latest,ack){
  if(!ack||!backupName.test(ack.name)||!/^[a-f0-9]{64}$/u.test(ack.sha256??''))return;
  const items=[];
  for(const name of await readdir(folder))if(backupName.test(name)){
    const meta=await jsonFile(resolve(folder,name+'.json'));
    if(meta?.name===name&&Number.isFinite(meta.createdAt))items.push(meta);
  }
  const acknowledged=items.find(x=>x.name===ack.name&&x.sha256===ack.sha256);if(!acknowledged)return;
  const keep=retainedNames(items);keep.add(latest.name);keep.add(ack.name);
  for(const item of items)if(!keep.has(item.name)&&item.createdAt<=acknowledged.createdAt){await unlink(resolve(folder,item.name));await unlink(resolve(folder,item.name+'.json'));}
}
export async function encryptedDump({folder,key,command,args,env,now=Date.now,timeoutMs=120000}){
  await privateDir(folder);if(key.length!==32)throw new Error('backup_key_required');
  if((await statfs(folder)).bavail*(await statfs(folder)).bsize<2*1024**3)throw new Error('backup_disk_space_low');
  const createdAt=now(),name='firewood-qa-'+new Date(createdAt).toISOString().replaceAll(/[-:.]/gu,'')+'-'+randomUUID()+'.fwb';
  const final=resolve(folder,name),partial=final+'.partial',iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  let child,alarm,exit;
  try{
    await writeFile(partial,Buffer.concat([MAGIC,iv]),{flag:'wx',mode:0o600});
    child=spawn(command,args,{env,stdio:['ignore','pipe','pipe']});
    // pg_dump errors stay generic; never log connection strings or order data.
    child.stderr.resume();
    exit=new Promise((yes,no)=>{child.once('error',no);child.once('exit',(code,signal)=>code===0?yes():no(new Error('backup_dump_failed')));});
    exit.catch(()=>{});
    alarm=setTimeout(()=>child.kill('SIGKILL'),timeoutMs);alarm.unref();
    await Promise.all([pipeline(child.stdout,cipher,createWriteStream(partial,{flags:'a',mode:0o600})),exit]);
    await appendFile(partial,cipher.getAuthTag());
    const f=await open(partial,'r');try{await f.sync();}finally{await f.close();}
    await authenticate(partial,key);await rename(partial,final);
    const hash=createHash('sha256');for await(const chunk of createReadStream(final))hash.update(chunk);
    const meta={version:1,testOnly:true,name,createdAt,sha256:hash.digest('hex'),bytes:(await stat(final)).size};
    await atomicJson(final+'.json',meta);await atomicJson(resolve(folder,'latest.json'),meta);return meta;
  }finally{
    clearTimeout(alarm);if(child&&child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');
    if(exit)await exit.catch(()=>{});await unlink(partial).catch(()=>{});
  }
}
export async function backup(root,databaseUrl){
  const folder=resolve(root,'ops/backups');
  return lease(resolve(root,'ops/state/backup.lock'),async()=>{
    const latest=await jsonFile(resolve(folder,'latest.json'));
    if(latest)await prune(folder,latest,await jsonFile(resolve(folder,'ack.json')));
    if((await readdir(folder)).filter(x=>backupName.test(x)).length>=128)throw new Error('backup_retention_needs_review');
    const key=await privateFile(resolve(root,'backup-key.private')),url=new URL(databaseUrl);
    const meta=await encryptedDump({folder,key,command:resolve(root,'postgres/bin/pg_dump'),
      args:['-h','127.0.0.1','-p','56382','-U','firewood_macbook_worker','-d','firewood_macbook_qa','--format=custom','--no-owner','--no-acl'],
      env:{PATH:'/usr/bin:/bin',PGPASSWORD:decodeURIComponent(url.password),PGOPTIONS:'-c default_transaction_read_only=on'}});
    await prune(folder,meta,await jsonFile(resolve(folder,'ack.json')));
    return {backup:meta.name,bytes:meta.bytes};
  });
}
