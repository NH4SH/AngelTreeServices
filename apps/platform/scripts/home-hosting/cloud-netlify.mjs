// Packaged independently from the CRM. No schedule, provider calls or uploads.
import {createPrivateKey,timingSafeEqual} from 'node:crypto';
import {createCloudVerifier} from './cloud-verifier.mjs';
import {cloudLimits} from './cloud-policy.mjs';
import {approvedVerifierRuntime} from './verifier-runtime.mjs';
const project='gbyhdsuiqeslgjdnbqng',origin='https://'+project+'.supabase.co';
let verifier;
const response=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
// Node's function environment is authoritative for per-deploy secret overlays.
const env=name=>process.env[name]??globalThis.Netlify?.env?.get(name);
function authorized(actual,expected){if(typeof actual!=='string'||typeof expected!=='string'||expected.length<43)return false;const a=Buffer.from(actual),b=Buffer.from('Bearer '+expected);return a.length===b.length&&timingSafeEqual(a,b);}
async function boundedBody(request){
  if(Number(request.headers.get('content-length')??0)>cloudLimits.bodyBytes)throw Error('Request too large');
  const reader=request.body?.getReader();if(!reader)throw Error('Missing request');let total=0;const parts=[];
  for(;;){const {value,done}=await reader.read();if(done)break;total+=value.length;if(total>cloudLimits.bodyBytes){await reader.cancel();throw Error('Request too large');}parts.push(value);}
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
export default async request=>{
  if(request.method!=='POST')return response({error:'Method not allowed'},405);
  if(!approvedVerifierRuntime(process.versions.node,process.platform,process.arch))return response({error:'Runtime review required'},503);
  if(!authorized(request.headers.get('authorization'),env('ATS_LAB_REQUEST_TOKEN')))return response({error:'Unauthorized'},401);
  try{
    if(!verifier){
      const namespace=env('ATS_LAB_NAMESPACE'),bucket='crm-cloud-lab-'+namespace.slice(-12),service=env('ATS_LAB_STAGING_SERVICE_KEY');
      if(JSON.parse(Buffer.from(service.split('.')[1],'base64url')).ref!==project)throw Error('Wrong staging credential');
      const headers={apikey:service,authorization:'Bearer '+service,'content-type':'application/json'};
      async function rpc(payload){
        const r=await fetch(origin+'/rest/v1/rpc/ats_recovery_lab_control',{method:'POST',headers,body:JSON.stringify({p:payload}),redirect:'error',signal:AbortSignal.timeout(8000)});
        if(!r.ok)throw Error('Ledger denied operation');return r.json();
      }
      verifier=createCloudVerifier({namespace,cacheRoot:'/tmp/'+namespace,restic:process.cwd()+'/restic',
        resticSha256:'20d4142678d0d95ec11a4759def1b73fd9190abc9ca19e4b62d067c0b387e639',
        password:env('ATS_LAB_RESTIC_PASSWORD'),privateKey:createPrivateKey({key:Buffer.from(env('ATS_LAB_SIGNING_DER'),'base64'),format:'der',type:'pkcs8'}),ledger:rpc,
        storage:{
          async download(name,expectedSize){
            const r=await fetch(origin+'/storage/v1/object/authenticated/'+bucket+'/'+name,{headers,redirect:'error',signal:AbortSignal.timeout(10000)});
            if(!r.ok)throw Error('Storage read failed');const chunks=[];let size=0;
            for await(const chunk of r.body){size+=chunk.length;if(size>expectedSize)throw Error('Storage size changed');chunks.push(chunk);}
            return Buffer.concat(chunks);
          },
          async publicDenied(){
            const r=await fetch(origin+'/storage/v1/object/public/'+bucket+'/config',{redirect:'error',signal:AbortSignal.timeout(5000)});
            await r.body?.cancel();return r.status>=400&&r.status<500;
          }
        }});
    }
    return response(await verifier(await boundedBody(request)));
  }catch(error){
    // No raw provider, Restic, database or manifest output in logs/responses.
    return response({error:'Verification withheld; check private ledger and operator evidence. No new write receipt issued.',phase:error.phase??'request'},409);
  }
};
