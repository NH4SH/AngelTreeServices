// Isolated, manual synthetic endpoint. The explicit certify operation uses a
// separate admission authority; archive/incremental results remain non-writable.
import {createPrivateKey,timingSafeEqual} from 'node:crypto';
import {createCloudVerifier} from './cloud-verifier.mjs';import {createIncrementalVerifier,fullCatalogIssuer} from './incremental-verifier.mjs';import {incrementalLimits} from './incremental-policy.mjs';
import {sha256} from './cloud-policy.mjs';
import {createCheckpointAuthority} from './certified-checkpoint.mjs';
import {approvedVerifierRuntime} from './verifier-runtime.mjs';
const origin='https://gbyhdsuiqeslgjdnbqng.supabase.co',env=n=>process.env[n]??globalThis.Netlify?.env?.get(n);
const reply=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});let baseline,incremental,authority;
export default async request=>{
 if(request.method!=='POST')return reply({error:'Method not allowed'},405);
 if(!approvedVerifierRuntime(process.versions.node,process.platform,process.arch))return reply({error:'Runtime review required'},503);
 const expected=env('ATS_LAB_REQUEST_TOKEN'),actual=request.headers.get('authorization'),a=Buffer.from(actual??''),b=Buffer.from('Bearer '+expected);
 if(typeof expected!=='string'||expected.length<43||a.length!==b.length||!timingSafeEqual(a,b))return reply({error:'Unauthorized'},401);
 try{
  if(Number(request.headers.get('content-length')??0)>incrementalLimits.bodyBytes)throw Error('Request too large');
  const chunks=[];let length=0;for await(const chunk of request.body??[]){length+=chunk.length;if(length>incrementalLimits.bodyBytes)throw Error('Request too large');chunks.push(chunk);}const body=JSON.parse(Buffer.concat(chunks));
  if(body.operation==='runtime')return reply({node:process.versions.node,platform:process.platform,architecture:process.arch,authorized:true,productionChanged:false});
  if(!baseline){
   const namespace=env('ATS_LAB_NAMESPACE'),bucket='crm-cloud-lab-'+namespace.slice(-12),key=env('ATS_LAB_STAGING_SERVICE_KEY');
   if(JSON.parse(Buffer.from(key.split('.')[1],'base64url')).ref!=='gbyhdsuiqeslgjdnbqng')throw Error('Staging credential required');
   const headers={apikey:key,authorization:'Bearer '+key};
   const rpc=name=>async payload=>{const r=await fetch(origin+'/rest/v1/rpc/'+name,{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({p:payload}),redirect:'error',signal:AbortSignal.timeout(7000)});if(!r.ok)throw Error('Ledger denied operation');return r.json();};
   const fullReadIdentities=new Map(),storage={
    async read(object,start,end){
     const r=await fetch(origin+'/storage/v1/object/authenticated/'+bucket+'/'+object.name,{headers:{...headers,range:`bytes=${start}-${end}`,'cache-control':'no-cache'},redirect:'error',signal:AbortSignal.timeout(7000)});
     if(r.status!==206||r.headers.get('content-range')!==`bytes ${start}-${end}/${object.size}`){await r.body?.cancel();throw Error('Storage range contract changed');}
     const etag=r.headers.get('etag');if(!etag||etag.startsWith('W/')||etag.length>255){await r.body?.cancel();throw Error('Strong provider identity required');}
     let size=0;const chunks=[];for await(const chunk of r.body){size+=chunk.length;if(size>end-start+1)throw Error('Storage range overflow');chunks.push(chunk);}if(size!==end-start+1)throw Error('Storage truncated range');return {bytes:Buffer.concat(chunks),etag};
    },
    async download(name,size){const r=await storage.read({name,size},0,size-1);fullReadIdentities.set(name,{size:r.bytes.length,sha256:sha256(r.bytes),etag:r.etag});return r.bytes;},
    fullReadIdentity(name){return fullReadIdentities.get(name);},
    async publicDenied(){const r=await fetch(origin+'/storage/v1/object/public/'+bucket+'/config',{redirect:'error',signal:AbortSignal.timeout(5000)});await r.body?.cancel();return r.status>=400&&r.status<500;}
   };
   const privateKey=createPrivateKey({key:Buffer.from(env('ATS_LAB_SIGNING_DER'),'base64'),format:'der',type:'pkcs8'}),common={namespace,restic:process.cwd()+'/restic',resticSha256:'20d4142678d0d95ec11a4759def1b73fd9190abc9ca19e4b62d067c0b387e639',password:env('ATS_LAB_RESTIC_PASSWORD'),privateKey,storage};
   baseline=createCloudVerifier({...common,cacheRoot:'/tmp/full-'+namespace,ledger:rpc('ats_recovery_lab_control'),onVerifiedRepository:fullCatalogIssuer({storage,privateKey})});
   incremental=createIncrementalVerifier({...common,scratchRoot:'/tmp/range-'+namespace,ledger:rpc('ats_recovery_incremental_control'),compactReads:env('ATS_LAB_COMPACT_READS')==='1'});
   authority=createCheckpointAuthority({namespace,privateKey,ledger:rpc('ats_recovery_certify_checkpoint')});
  }
  if(body.operation==='baseline')return reply(await baseline({requestId:body.requestId,mode:'archive',forceRemoteRead:true,ticket:body.ticket}));
  if(body.operation==='incremental')return reply(await incremental(body));
  if(body.operation==='certify')return reply(await authority(body));
  return reply({error:'Unsupported operation'},400);
 }catch(error){return reply({error:'Archive verification withheld. No write permission issued.',phase:error.phase??'request'},409);}
};
