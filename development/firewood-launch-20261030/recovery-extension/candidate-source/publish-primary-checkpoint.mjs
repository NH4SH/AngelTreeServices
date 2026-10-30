// Home credential is a single verifier request token, never a managed service
// key or signing key. Lost replies reuse the recorded request identities.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {randomUUID,verify} from 'node:crypto';import {pathToFileURL} from 'node:url';
import {sha256} from './cloud-policy.mjs';import {backupSourceScope} from './backup-source-scope.mjs';import {validateNativeWalReceipt} from './native-wal-checkpoint.mjs';
export function encryptedComponentObjects(repository){
 const objects=[];function walk(folder,prefix=''){for(const e of fs.readdirSync(folder,{withFileTypes:true})){assert.ok(!e.isSymbolicLink());const name=prefix+e.name,p=path.join(folder,e.name);if(e.isDirectory())walk(p,name+'/');else{assert.ok(e.isFile());assert.match(name,/^(config|keys\/[a-f0-9]{64}|index\/[a-f0-9]{64}|snapshots\/[a-f0-9]{64}|data\/[a-f0-9]{2}\/[a-f0-9]{64})$/);const bytes=fs.readFileSync(p);assert.ok(bytes.length>0&&bytes.length<=33554432);objects.push({name,size:bytes.length,sha256:sha256(bytes)});}}}walk(repository);assert.ok(objects.length>0&&objects.length<=64);assert.ok(objects.some(o=>o.name==='config'));assert.ok(objects.reduce((n,o)=>n+o.size,0)<=134217728);return objects.sort((a,b)=>a.name.localeCompare(b.name));
}
export async function publishPrimaryCheckpoint({folder,sequence,endpoint,requestToken,publicKey,admit=true,fetchImpl=fetch}){
 assert.ok(Number.isSafeInteger(sequence)&&sequence>0);const ticket=JSON.parse(fs.readFileSync(folder+'/ticket-'+sequence+'.json'));assert.equal(backupSourceScope(ticket.binding).syntheticOnly,false);assert.equal(ticket.namespace,ticket.binding.namespace);
 assert.equal(ticket.capturePath,folder+'/capture-'+sequence);const repository=folder+'/repository-'+sequence,objects=encryptedComponentObjects(repository);
 const artifact=folder+'/capture-'+sequence,kind=fs.existsSync(artifact+'/base')?'base':'delta';assert.equal(sha256(fs.readFileSync(artifact+(kind==='base'?'/checkpoint.private.json':'/manifest.private.json'))),ticket.manifestSha256);
 const url=new URL(endpoint);assert.equal(url.protocol,'https:');assert.match(url.hostname,/^[a-f0-9]{24}--ats-recovery-verifier-lab\.netlify\.app$/);assert.equal(url.pathname,'/.netlify/functions/home-native-backup');assert.equal(url.search,'');assert.ok(typeof requestToken==='string'&&/^[A-Za-z0-9_-]{43,100}$/.test(requestToken),'Invalid verifier request credential');
 const atomic=(file,value)=>{fs.writeFileSync(file+'.new',JSON.stringify(value),{mode:0o600});fs.renameSync(file+'.new',file);};
 async function call(body){const r=await fetchImpl(endpoint,{method:'POST',headers:{authorization:'Bearer '+requestToken,'content-type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(65000)});let bytes=0;const chunks=[];for await(const c of r.body){bytes+=c.length;assert.ok(bytes<=262144);chunks.push(c);}const result=JSON.parse(Buffer.concat(chunks));if(!r.ok)throw Object.assign(Error('Independent backup operation withheld'),{phase:result.phase});return result;}
 const requestFile=folder+'/cloud-request-'+sequence+'.private.json';let preparedRequest;
 if(fs.existsSync(requestFile)){preparedRequest=JSON.parse(fs.readFileSync(requestFile));assert.deepEqual(preparedRequest.ticket,ticket);assert.deepEqual(preparedRequest.objects,objects);assert.equal(preparedRequest.kind,kind);}
 else{preparedRequest={operation:'prepare',requestId:randomUUID(),kind,ticket,objects};atomic(requestFile,preparedRequest);}
 const prepared=await call(preparedRequest);assert.equal(prepared.jobId,preparedRequest.requestId);
 if(!prepared.verified){
  assert.equal(prepared.prefix,prepared.jobId+'/');assert.ok(Array.isArray(prepared.grants)&&Array.isArray(prepared.alreadyPresent));
  assert.deepEqual([...prepared.grants.map(g=>g.name),...prepared.alreadyPresent].sort(),objects.map(o=>o.name).sort());
  const byName=new Map(objects.map(o=>[o.name,o]));
  for(let n=0;n<prepared.grants.length;n+=2){const results=await Promise.allSettled(prepared.grants.slice(n,n+2).map(async grant=>{
   const expected=byName.get(grant.name);assert.ok(expected);const target=new URL(grant.url);assert.equal(target.origin,'https://nbsvdzscgfpabbbdwlob.supabase.co');assert.equal(decodeURI(target.pathname),'/storage/v1/object/upload/sign/crm-native-home-'+ticket.namespace.slice(-12)+'/'+prepared.prefix+grant.name);assert.ok(target.searchParams.get('token'));
   const bytes=fs.readFileSync(repository+'/'+grant.name);assert.equal(bytes.length,expected.size);assert.equal(sha256(bytes),expected.sha256);const r=await fetchImpl(target,{method:'PUT',headers:{'content-type':'application/octet-stream','x-upsert':'false'},body:bytes,redirect:'error',signal:AbortSignal.timeout(30000)});await r.body?.cancel();assert.ok(r.ok,'Immutable backup upload withheld');
  }));for(const result of results)if(result.status==='rejected')throw result.reason;}
 }
 let checked=prepared;
 if(!prepared.verified){try{checked=await call({operation:'verify',jobId:prepared.jobId});}catch(error){const status=await call({operation:'verification-status',jobId:prepared.jobId});if(!status.completed)throw error;checked=status;}}
 const cert=checked.componentCertificate,payload=Buffer.from(cert.payload,'base64url');assert.ok(payload.length<=131072);assert.equal(verify(null,payload,publicKey,Buffer.from(cert.signature,'base64url')),true);
 const proof=JSON.parse(payload);assert.equal(proof.jobId,prepared.jobId);assert.equal(proof.manifestSha256,ticket.manifestSha256);assert.equal(proof.snapshotId,ticket.snapshotId);assert.deepEqual(proof.binding,ticket.binding);assert.equal(proof.writeAdmission,false);
 atomic(folder+'/verified-'+sequence+'.private.json',checked);
 if(!admit)return {verified:true,sequence,jobId:prepared.jobId,admitted:false};
 const admissionFile=folder+'/admission-request-'+sequence+'.private.json';let admission;
 if(fs.existsSync(admissionFile)){admission=JSON.parse(fs.readFileSync(admissionFile));assert.equal(admission.jobId,prepared.jobId);assert.deepEqual(admission.binding,ticket.binding);}
 else{admission={operation:'admit',requestId:randomUUID(),jobId:prepared.jobId,binding:ticket.binding};atomic(admissionFile,admission);}
 let admitted;try{admitted=await call(admission);}catch{admitted=await call(admission);}
 const claims=validateNativeWalReceipt(admitted.envelope,publicKey,ticket.binding);assert.equal(claims.sequence,sequence);assert.equal(claims.jobId,prepared.jobId);
 atomic(folder+'/receipt-'+sequence+'.json',admitted.envelope);atomic(folder+'/chain-'+sequence+'.private.json',admitted.chainCertificate);
 return {verified:true,sequence,jobId:prepared.jobId,admittedByCloud:true,expiresAt:claims.expiresAt};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const{PrimaryIO}=await import('./primary-io.mjs');const io=new PrimaryIO(),[sequence,mode]=process.argv.slice(2);assert.ok(mode===undefined||mode==='--verify-only');io.assertSource();const c=JSON.parse(fs.readFileSync(io.folder+'/cloud-authority.private.json'));assert.equal(c.namespace,io.namespace);
 console.log(JSON.stringify(await publishPrimaryCheckpoint({folder:io.folder,sequence:Number(sequence),endpoint:c.endpoint,requestToken:c.requestToken,publicKey:fs.readFileSync(io.folder+'/authority-public.pem'),admit:mode!=='--verify-only'})));
}
