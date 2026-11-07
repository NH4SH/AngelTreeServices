import {lstat,mkdir,readFile,writeFile,rename,unlink,open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {homedir} from 'node:os';
import {verifyHost} from './host-identity.mjs';
import {resolve} from 'node:path';

export const ROOT=resolve(homedir(),'.local/share/ats-firewood-native-qa-20261026');
export const OPS=resolve(ROOT,'ops');
export const CODE=resolve(ROOT,'app/scripts/firewood-checkout/macbook/ops');
export async function privateFile(path){
  const s=await lstat(path);
  if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o077)!==0||s.uid!==process.getuid())throw new Error('private_file_required');
  return readFile(path);
}
export async function privateDir(path){
  await mkdir(path,{recursive:true,mode:0o700});const s=await lstat(path);
  if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o077)!==0||s.uid!==process.getuid())throw new Error('private_directory_required');
}
export async function guardRoot(){
  await verifyHost();
  await privateDir(ROOT);
}
export async function atomicJson(path,value){
  const temporary=path+'.'+randomUUID()+'.partial';
  try{
    await writeFile(temporary,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
    const f=await open(temporary,'r');try{await f.sync();}finally{await f.close();}
    await rename(temporary,path);
  }finally{await unlink(temporary).catch(()=>{});}
}
export async function jsonFile(path,fallback=null){
  try{return JSON.parse((await privateFile(path)).toString());}catch(e){if(e.code==='ENOENT')return fallback;throw e;}
}
export async function lease(path,operation){
  const f=await open(path,constants.O_CREAT|constants.O_RDWR|constants.O_NOFOLLOW,0o600);
  try{
    const s=await f.stat();
    if(!s.isFile()||(s.mode&0o077)!==0||s.uid!==process.getuid())throw new Error('private_lock_required');
    // macOS lockf locks the inherited open-file description. The parent keeps
    // that descriptor until the operation ends; kernel cleanup also covers a
    // killed owner. Never unlink this inode or reclaim it using a stale PID.
    const code=await new Promise((resolve,reject)=>{
      const child=spawn('/usr/bin/lockf',['-s','-t','0','3'],{stdio:['ignore','ignore','ignore',f.fd],env:{PATH:'/usr/bin:/bin'},timeout:5000,killSignal:'SIGKILL'});
      child.once('error',reject);child.once('close',(code,signal)=>signal?reject(new Error('lock_command_failed')):resolve(code));
    });
    if(code===75)return {busy:true};
    if(code!==0)throw new Error('lock_command_failed');
    return await operation();
  }finally{
    await f.close();
  }
}
