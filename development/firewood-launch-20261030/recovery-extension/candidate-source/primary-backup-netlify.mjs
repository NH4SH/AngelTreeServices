// Independent cloud verifier. No source registration, enable, reset, recovery
// promotion or application-data mutation is exposed to the home request token.
import assert from 'node:assert/strict';import {createPrivateKey,createPublicKey,timingSafeEqual} from 'node:crypto';
import {approvedVerifierRuntime} from './verifier-runtime.mjs';import {backupSourceScope} from './backup-source-scope.mjs';
import {sha256} from './cloud-policy.mjs';import {signProof} from './failover-proof.mjs';import {createNativeComponentVerifier} from './native-component-verifier.mjs';import {createNativeWalAuthority} from './native-wal-checkpoint.mjs';
import{retireNativeBatch}from'./native-chain-retirement.mjs';
const response=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
export function primaryBackupHandler({projectRef,namespace,mode='backup',getEnv=name=>globalThis.Netlify?.env?.get(name)??process.env[name],fetchImpl=fetch}){
 assert.equal(projectRef,'nbsvdzscgfpabbbdwlob');assert.match(namespace,/^ats-home-continuous-[a-f0-9]{12}$/);const origin='https://'+projectRef+'.supabase.co',bucket='crm-native-home-'+namespace.slice(-12);let state;
 assert.ok(['backup','retirement'].includes(mode));
 return async request=>{
  if(request.method!=='POST')return response({error:'Method not allowed'},405);
  if(!approvedVerifierRuntime(process.versions.node,process.platform,process.arch))return response({error:'Runtime review required'},503);
  const token=getEnv('ATS_HOME_REQUEST_TOKEN'),a=Buffer.from(request.headers.get('authorization')??''),b=Buffer.from('Bearer '+token);
  if(typeof token!=='string'||token.length<43||a.length!==b.length||!timingSafeEqual(a,b))return response({error:'Unauthorized'},401);
  let phase='request';try{
   assert.equal(getEnv('ATS_HOME_NAMESPACE'),namespace);assert.equal(getEnv('ATS_HOME_PROJECT_REF'),projectRef);
   const chunks=[];let size=0;for await(const chunk of request.body??[]){size+=chunk.length;assert.ok(size<=65536);chunks.push(chunk);}const body=JSON.parse(Buffer.concat(chunks));
   if(body.operation==='runtime')return response({node:process.versions.node,platform:process.platform,architecture:process.arch,sourceRegistrationAllowed:false});
   assert.ok(mode==='retirement'?body.operation==='retire':body.operation!=='retire','Wrong operation endpoint');
   if(!state){
    const key=getEnv('ATS_HOME_BACKUP_SERVICE_KEY'),claims=JSON.parse(Buffer.from(key.split('.')[1],'base64url'));assert.equal(claims.ref,projectRef);assert.equal(claims.role,'service_role');
    const headers={apikey:key,authorization:'Bearer '+key};
    async function json(route,payload,method='POST'){const r=await fetchImpl(origin+route,{method,headers:{...headers,'content-type':'application/json'},body:JSON.stringify(payload),redirect:'error',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Backup authority operation denied');return r.json();}
    const ledger=p=>json('/rest/v1/rpc/ats_home_native_control',{p:{...p,namespace}}),beginVerification=(id,readOnly)=>json('/rest/v1/rpc/ats_home_native_verification',{p_namespace:namespace,p_job_id:id,p_read_only:readOnly});
    const storage={
     async download(expectedBucket,name,expectedSize){assert.equal(expectedBucket,bucket);const r=await fetchImpl(origin+'/storage/v1/object/authenticated/'+bucket+'/'+name,{headers,redirect:'error',signal:AbortSignal.timeout(15000)});assert.ok(r.ok);let bytes=0;const parts=[];for await(const part of r.body){bytes+=part.length;assert.ok(bytes<=expectedSize);parts.push(part);}assert.equal(bytes,expectedSize);return Buffer.concat(parts);},
     async publicDenied(expectedBucket,name){assert.equal(expectedBucket,bucket);const r=await fetchImpl(origin+'/storage/v1/object/public/'+bucket+'/'+name,{redirect:'error',signal:AbortSignal.timeout(5000)});await r.body?.cancel();return r.status>=400&&r.status<500;},
     async remove({bucket:expectedBucket,prefix,objects}){assert.equal(expectedBucket,bucket);assert.match(prefix,/^[a-f0-9-]{36}\/$/);assert.ok(objects.length>0&&objects.length<=16);await json('/storage/v1/object/'+bucket,{prefixes:objects.map(o=>prefix+o.name)},'DELETE');}
    };
    const privateKey=createPrivateKey({key:Buffer.from(getEnv('ATS_HOME_SIGNING_DER'),'base64'),format:'der',type:'pkcs8'});assert.equal(privateKey.asymmetricKeyType,'ed25519');const publicKey=createPublicKey(privateKey);
    state={ledger,storage,retention:p=>json('/rest/v1/rpc/ats_home_native_retention',{p:{...p,namespace}}),beginVerification,privateKey,verifier:createNativeComponentVerifier({namespace,scratchRoot:'/tmp/'+namespace,restic:process.cwd()+'/restic',resticSha256:'20d4142678d0d95ec11a4759def1b73fd9190abc9ca19e4b62d067c0b387e639',password:getEnv('ATS_HOME_RESTIC_PASSWORD'),storage,ledger,beginVerification}),authority:createNativeWalAuthority({namespace,privateKey,publicKey,ledger}),
     async grant(prefix,name){const route=bucket+'/'+prefix+name,result=await json('/storage/v1/object/upload/sign/'+route,{}),url=new URL(origin+'/storage/v1'+result.url);assert.equal(url.origin,origin);assert.equal(decodeURI(url.pathname),'/storage/v1/object/upload/sign/'+route);assert.ok(url.searchParams.get('token'));return{name,url:url.toString()};}};
   }
   if(body.operation==='retire'){phase='retention';const status=await state.ledger({action:'status'});assert.equal(backupSourceScope(status.binding).syntheticOnly,false);return response(await retireNativeBatch({namespace,expectedBinding:status.binding,ledger:state.retention,storage:state.storage,limit:200}));}
   if(body.operation==='prepare'){
    phase='prepare';assert.equal(body.ticket.namespace,namespace);assert.equal(backupSourceScope(body.ticket.binding).syntheticOnly,false);
    const prepared=await state.ledger({action:'prepare',requestId:body.requestId,bodySha:sha256(JSON.stringify(body)),kind:body.kind,ticket:body.ticket,objects:body.objects});
    if(prepared.completed)return response({jobId:prepared.jobId,verified:true,componentCertificate:signProof(prepared.proof,state.privateKey),report:prepared.report});
    const inventory=await state.ledger({action:'inventory',jobId:prepared.jobId}),byName=new Map(inventory.map(o=>[o.name,o])),grants=[],alreadyPresent=[];
    for(const object of body.objects){if(byName.has(object.name)){assert.equal(byName.get(object.name).size,object.size);alreadyPresent.push(object.name);}else grants.push(await state.grant(prepared.prefix,object.name));}
    return response({jobId:prepared.jobId,prefix:prepared.prefix,grants,alreadyPresent,verified:false});
   }
   if(body.operation==='verify'){phase='verify';const result=await state.verifier(body.jobId);return response({jobId:body.jobId,verified:true,componentCertificate:signProof(result.proof,state.privateKey),report:result.report,replayed:result.replayed});}
   if(body.operation==='verification-status'){phase='status';const result=await state.beginVerification(body.jobId,true);return response({jobId:body.jobId,completed:result.completed,attempted:result.attempted,...(result.completed?{componentCertificate:signProof(result.proof,state.privateKey),report:result.report}:{})});}
   if(body.operation==='admit'){phase='admit';assert.equal(backupSourceScope(body.binding).syntheticOnly,false);return response(await state.authority({requestId:body.requestId,jobId:body.jobId,binding:body.binding}));}
   if(body.operation==='status'){phase='status';return response(await state.ledger({action:'status'}));}
   return response({error:'Unsupported operation'},400);
  }catch(error){return response({error:'Backup operation withheld. No new write permission issued.',phase:error.phase??phase},409);}
 };
}
