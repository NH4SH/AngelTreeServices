import {request} from 'node:https';
import {checkServerIdentity} from 'node:tls';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {privateFile} from '../../macbook/ops/files.mjs';
import {loadConfiguration,HTTPS_PORT} from './config.mjs';
export async function ownerRequest(env,action,input={}){if(!['status','details','pause','schedule','cancel','delivered','quote'].includes(action))throw Error('explicit_owner_action_required');
 const cfg=await loadConfiguration(env),bundle=JSON.parse((await privateFile(env.FIREWOOD_CANDIDATE_TLS_BUNDLE)).toString()),ca=await privateFile(bundle.ca),key=await privateFile(bundle.ownerKey),cert=await privateFile(bundle.ownerCert),data=JSON.stringify(input);
 return new Promise((yes,no)=>{const req=request({hostname:'127.0.0.1',port:HTTPS_PORT,servername:'firewood-candidate-backend.invalid',ca,key,cert,rejectUnauthorized:true,
  checkServerIdentity(name,c){return checkServerIdentity(name,c)||(c.fingerprint256.replaceAll(':','').toLowerCase()!==bundle.backendFingerprint.replaceAll(':','').toLowerCase()?Error('private_backend_pin_mismatch'):undefined);},
  path:'/owner/'+action,method:'POST',headers:{Host:new URL(cfg.origin).host,'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}},res=>{const chunks=[];res.on('data',p=>chunks.push(p));res.on('end',()=>{try{const value=JSON.parse(Buffer.concat(chunks));if(res.statusCode!==200)throw Error(value.error??'owner_action_failed');yes(value);}catch(e){no(e);}});});req.on('error',no);req.end(data);});}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{const input=process.argv[3]?JSON.parse((await privateFile(process.argv[3])).toString()):{};console.log(JSON.stringify(await ownerRequest(process.env,process.argv[2],input)));}catch{console.error('Private owner action failed; review the order and version before retrying.');process.exitCode=1;}}
