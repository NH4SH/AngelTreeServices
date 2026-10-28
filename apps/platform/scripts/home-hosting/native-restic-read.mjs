import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {readFileSync} from 'node:fs';import {sha256} from './cloud-policy.mjs';
export function nativeResticReader({binary,expectedSha256,repo,passwordFile,scratch,deadline}){
 assert.equal(sha256(readFileSync(binary)),expectedSha256);
 return async(args,{maxBytes=4*1024*1024,binaryOutput=false}={})=>{
  const remaining=deadline-Date.now();assert.ok(remaining>0,'Native deadline exceeded');
  return new Promise((resolve,reject)=>{
   const child=spawn(binary,['--repo',repo,'--password-file',passwordFile,'--no-cache','--no-lock','--retry-lock','0s',...args],{
    env:{HOME:scratch,TMPDIR:scratch,PATH:'/usr/bin:/bin',GOMAXPROCS:'2',GOMEMLIMIT:'256MiB'},stdio:['ignore','pipe','pipe']});
   let size=0,failed=false;const chunks=[];const timer=setTimeout(()=>{failed=true;child.kill('SIGKILL');},Math.min(remaining,20000));
   child.stdout.on('data',b=>{size+=b.length;if(size>maxBytes){failed=true;child.kill('SIGKILL');}else chunks.push(b);});child.stderr.resume();
   child.once('error',()=>{failed=true;});child.once('close',code=>{clearTimeout(timer);if(code!==0||failed)reject(Error('Native verification failed'));else{const b=Buffer.concat(chunks);resolve(binaryOutput?b:b.toString('utf8'));}});
  });
 };
}
