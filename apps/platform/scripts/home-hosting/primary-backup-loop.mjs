// One serialized producer. The independent watchdog/deadline stays in separate
// systemd units; blocking network I/O here cannot extend write admission.
import assert from 'node:assert/strict';import fs from 'node:fs';import {fileURLToPath} from 'node:url';import {PrimaryIO} from './primary-io.mjs';
import {validateNativeWalReceipt} from './native-wal-checkpoint.mjs';
import{requestPrimaryRetirement}from'./primary-retirement-request.mjs';
const io=new PrimaryIO(),directory=fileURLToPath(new URL('.',import.meta.url)),node=process.execPath;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function invoke(file,args){return io.run(node,[directory+file,...args],{timeout:150000}).stdout;}
for(;;){
 assert.equal(fs.existsSync(io.folder+'/fenced.latch'),false);
 const binding=JSON.parse(fs.readFileSync(io.folder+'/binding.json')),active=JSON.parse(fs.readFileSync(io.folder+'/active.json'));
 const claims=validateNativeWalReceipt(active.envelope,fs.readFileSync(io.folder+'/authority-public.pem'),binding);
 const sequence=claims.sequence+1;let nextAt;
 try{
  if(!fs.existsSync(io.folder+'/ticket-'+sequence+'.json'))invoke('primary-controller.mjs',['capture',io.id,String(sequence)]);
  const ticket=JSON.parse(fs.readFileSync(io.folder+'/ticket-'+sequence+'.json'));nextAt=Date.parse(ticket.captureStartedAt)+120000;
  invoke('publish-primary-checkpoint.mjs',[String(sequence)]);invoke('primary-controller.mjs',['admit',io.id,String(sequence)]);
  fs.writeFileSync(io.folder+'/backup-loop-heartbeat.json',JSON.stringify({at:new Date().toISOString(),sequence}),{mode:0o600});
  const rotationFile=io.folder+'/retirement-request.json',rotation=fs.existsSync(rotationFile)?JSON.parse(fs.readFileSync(rotationFile)):null;
  if(!rotation||Date.now()-Date.parse(rotation.at)>=6*3600000){
   try{const authority=JSON.parse(fs.readFileSync(io.folder+'/cloud-authority.private.json'));await requestPrimaryRetirement(authority);fs.writeFileSync(rotationFile,JSON.stringify({at:new Date().toISOString(),requested:true,writeAdmission:false}),{mode:0o600});}
   catch(error){fs.writeFileSync(io.folder+'/retirement-request-error.private.json',JSON.stringify({at:new Date().toISOString(),error:error.message}),{mode:0o600});}
  }
  await sleep(Math.max(1000,nextAt-Date.now()));
 }catch(error){
  fs.writeFileSync(io.folder+'/backup-loop-error.private.json',JSON.stringify({at:new Date().toISOString(),sequence,error:String(error.message)}),{mode:0o600});
  if(fs.existsSync(io.folder+'/fenced.latch')||Date.now()>=Date.parse(claims.expiresAt))throw error;
  // The same immutable request and admission IDs are retried. A failed verifier
  // attempt never becomes a new receipt and ultimately closes the writer.
  await sleep(5000);
 }
}
