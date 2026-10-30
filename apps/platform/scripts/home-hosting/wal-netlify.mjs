// Separate, manual synthetic archive endpoint. No schedule or write authority.
import {createPrivateKey,timingSafeEqual} from 'node:crypto';
import {createWalArchiveVerifier} from './wal-cloud-verifier.mjs';
import {approvedVerifierRuntime} from './verifier-runtime.mjs';
import {cloudLimits} from './cloud-policy.mjs';
const origin='https://gbyhdsuiqeslgjdnbqng.supabase.co',env=n=>process.env[n]??globalThis.Netlify?.env?.get(n);
const reply=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});let verifier;
export default async request=>{
 if(request.method!=='POST')return reply({error:'Method not allowed'},405);
 if(!approvedVerifierRuntime(process.versions.node,process.platform,process.arch))return reply({error:'Runtime review required'},503);
 const expected=env('ATS_LAB_REQUEST_TOKEN'),a=Buffer.from(request.headers.get('authorization')??''),b=Buffer.from('Bearer '+expected);
 if(typeof expected!=='string'||expected.length<43||a.length!==b.length||!timingSafeEqual(a,b))return reply({error:'Unauthorized'},401);
 try{
  let size=0;const chunks=[];for await(const chunk of request.body??[]){size+=chunk.length;if(size>cloudLimits.bodyBytes)throw Error('Body exceeds bound');chunks.push(chunk);}
  const body=JSON.parse(Buffer.concat(chunks));
  if(!verifier){
   const namespace=env('ATS_LAB_NAMESPACE');if(!/^ats-rehearsal-continuous-[a-f0-9]{12}$/.test(namespace))throw Error('Wrong namespace');
   const key=env('ATS_LAB_STAGING_SERVICE_KEY'),bucket='crm-cloud-lab-'+namespace.slice(-12);
   if(JSON.parse(Buffer.from(key.split('.')[1],'base64url')).ref!=='gbyhdsuiqeslgjdnbqng')throw Error('Wrong staging credential');
   const headers={apikey:key,authorization:'Bearer '+key};
   const ledger=async p=>{const r=await fetch(origin+'/rest/v1/rpc/ats_recovery_lab_control',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({p}),redirect:'error',signal:AbortSignal.timeout(7000)});if(!r.ok)throw Error('Ledger denied operation');return r.json();};
   const storage={
    async download(name,expectedSize){const r=await fetch(origin+'/storage/v1/object/authenticated/'+bucket+'/'+name,{headers,redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Storage read failed');
     let size=0;const chunks=[];for await(const chunk of r.body){size+=chunk.length;if(size>expectedSize)throw Error('Object changed');chunks.push(chunk);}if(size!==expectedSize)throw Error('Truncated object');return Buffer.concat(chunks);},
    async publicDenied(){const r=await fetch(origin+'/storage/v1/object/public/'+bucket+'/config',{redirect:'error',signal:AbortSignal.timeout(5000)});await r.body?.cancel();return r.status>=400&&r.status<500;}
   };
   verifier=createWalArchiveVerifier({namespace,scratchRoot:'/tmp/'+namespace,restic:process.cwd()+'/restic',resticSha256:'20d4142678d0d95ec11a4759def1b73fd9190abc9ca19e4b62d067c0b387e639',
    password:env('ATS_LAB_RESTIC_PASSWORD'),privateKey:createPrivateKey({key:Buffer.from(env('ATS_LAB_SIGNING_DER'),'base64'),format:'der',type:'pkcs8'}),storage,ledger});
  }
  return reply(await verifier(body));
 }catch(error){return reply({error:'Native WAL archive verification withheld. No write permission issued.',phase:error.phase??'request'},409);}
};
