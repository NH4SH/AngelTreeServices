// Manual, source-bound staging rehearsal only. This endpoint cannot configure a
// source, enable it, delete backups, update objects, or change application data.
import assert from 'node:assert/strict';import {createPrivateKey,createPublicKey,timingSafeEqual} from 'node:crypto';
import {approvedVerifierRuntime} from './verifier-runtime.mjs';import {sha256} from './cloud-policy.mjs';import {signProof} from './failover-proof.mjs';
import {createNativeComponentVerifier} from './native-component-verifier.mjs';import {createNativeWalAuthority} from './native-wal-checkpoint.mjs';
const origin='https://gbyhdsuiqeslgjdnbqng.supabase.co',env=n=>process.env[n]??globalThis.Netlify?.env?.get(n);
const reply=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});let state;
export default async request=>{
 if(request.method!=='POST')return reply({error:'Method not allowed'},405);
 if(!approvedVerifierRuntime(process.versions.node,process.platform,process.arch))return reply({error:'Runtime review required'},503);
 const expected=env('ATS_LAB_REQUEST_TOKEN'),a=Buffer.from(request.headers.get('authorization')??''),b=Buffer.from('Bearer '+expected);
 if(typeof expected!=='string'||expected.length<43||a.length!==b.length||!timingSafeEqual(a,b))return reply({error:'Unauthorized'},401);
 let phase='request';
 try{
  const chunks=[];let size=0;for await(const chunk of request.body??[]){size+=chunk.length;assert.ok(size<=65536);chunks.push(chunk);}const body=JSON.parse(Buffer.concat(chunks));
  if(body.operation==='runtime')return reply({node:process.versions.node,platform:process.platform,architecture:process.arch,syntheticOnly:true,productionChanged:false});
  if(!state){
   const namespace=env('ATS_LAB_NAMESPACE');assert.match(namespace,/^ats-rehearsal-continuous-[a-f0-9]{12}$/);const bucket='crm-native-lab-'+namespace.slice(-12);
   const key=env('ATS_LAB_STAGING_SERVICE_KEY'),jwt=JSON.parse(Buffer.from(key.split('.')[1],'base64url'));assert.equal(jwt.ref,'gbyhdsuiqeslgjdnbqng');assert.equal(jwt.role,'service_role');
   const headers={apikey:key,authorization:'Bearer '+key};
   async function json(path,payload){const r=await fetch(origin+path,{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify(payload),redirect:'error',signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('Staging operation denied');return r.json();}
   const ledger=p=>json('/rest/v1/rpc/ats_recovery_native_control',{p:{...p,namespace}});
   const beginVerification=(id,readOnly)=>json('/rest/v1/rpc/ats_recovery_native_verification',{p_namespace:namespace,p_job_id:id,p_read_only:readOnly});
   const storage={
    async download(expectedBucket,name,expectedSize){assert.equal(expectedBucket,bucket);const r=await fetch(origin+'/storage/v1/object/authenticated/'+bucket+'/'+name,{headers,redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Storage denied read');
     let size=0;const chunks=[];for await(const chunk of r.body){size+=chunk.length;assert.ok(size<=expectedSize);chunks.push(chunk);}assert.equal(size,expectedSize);return Buffer.concat(chunks);},
    async publicDenied(expectedBucket,name){assert.equal(expectedBucket,bucket);const r=await fetch(origin+'/storage/v1/object/public/'+bucket+'/'+name,{redirect:'error',signal:AbortSignal.timeout(5000)});await r.body?.cancel();return r.status>=400&&r.status<500;}
   };
   const privateKey=createPrivateKey({key:Buffer.from(env('ATS_LAB_SIGNING_DER'),'base64'),format:'der',type:'pkcs8'}),publicKey=createPublicKey(privateKey);
   const verifier=createNativeComponentVerifier({namespace,scratchRoot:'/tmp/'+namespace,restic:process.cwd()+'/restic',resticSha256:'20d4142678d0d95ec11a4759def1b73fd9190abc9ca19e4b62d067c0b387e639',
    password:env('ATS_LAB_RESTIC_PASSWORD'),storage,ledger,beginVerification});
   state={namespace,bucket,ledger,beginVerification,privateKey,verifier,authority:createNativeWalAuthority({namespace,privateKey,publicKey,ledger}),
    async grant(prefix,name){const path=bucket+'/'+prefix+name;const data=await json('/storage/v1/object/upload/sign/'+path,{});
     const url=new URL(origin+'/storage/v1'+data.url);assert.equal(url.origin,origin);assert.equal(decodeURI(url.pathname),'/storage/v1/object/upload/sign/'+path);assert.ok(url.searchParams.get('token'));
     return {name,url:url.toString()};}
   };
  }
  const {namespace,ledger}=state;
  if(body.operation==='prepare'){
   phase='prepare';assert.equal(body.ticket.namespace,namespace);
   const prepared=await ledger({action:'prepare',requestId:body.requestId,bodySha:sha256(JSON.stringify(body)),kind:body.kind,ticket:body.ticket,objects:body.objects});
   if(prepared.completed)return reply({jobId:prepared.jobId,verified:true,componentCertificate:signProof(prepared.proof,state.privateKey),report:prepared.report});
   const current=await ledger({action:'inventory',jobId:prepared.jobId}),byName=new Map(current.map(o=>[o.name,o]));const grants=[],alreadyPresent=[];
   for(const object of body.objects){if(byName.has(object.name)){assert.equal(byName.get(object.name).size,object.size);alreadyPresent.push(object.name);}else grants.push(await state.grant(prepared.prefix,object.name));}
   return reply({jobId:prepared.jobId,prefix:prepared.prefix,grants,alreadyPresent,verified:false});
  }
  if(body.operation==='verify'){
   phase='verify';const result=await state.verifier(body.jobId);
   return reply({jobId:body.jobId,verified:true,componentCertificate:signProof(result.proof,state.privateKey),report:result.report,replayed:result.replayed});
  }
  if(body.operation==='verification-status'){
   phase='status';const result=await state.beginVerification(body.jobId,true);
   return reply({jobId:body.jobId,completed:result.completed,attempted:result.attempted,...(result.completed?{componentCertificate:signProof(result.proof,state.privateKey),report:result.report}:{})});
  }
  if(body.operation==='admit'){phase='admit';return reply(await state.authority({requestId:body.requestId,jobId:body.jobId,binding:body.binding}));}
  if(body.operation==='status'){phase='status';return reply(await ledger({action:'status'}));}
  return reply({error:'Unsupported operation'},400);
 }catch(error){return reply({error:'Native recovery operation withheld. No new write permission issued.',phase:error.phase??phase},409);}
};
