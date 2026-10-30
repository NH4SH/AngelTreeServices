// Compare already-held candidates inside the trusted runtime. This endpoint
// cannot return secret values, hashes, lengths, or arbitrary environment keys.
// Never use it to export write-only production secrets.
import{createHash,timingSafeEqual}from'node:crypto';
export function credentialCandidateCheck({keys,notAfter,getEnv=name=>globalThis.Netlify?.env?.get(name)??process.env[name],runtime=()=>({node:process.versions.node,platform:process.platform,arch:process.arch})}){
 if(!Array.isArray(keys)||keys.length>32||new Set(keys).size!==keys.length||!keys.every(k=>/^[A-Z][A-Z0-9_]{1,79}$/.test(k)))throw Error('Invalid key allowlist');
 const allowed=new Set(keys),reply=(value,status=200)=>Response.json(value,{status,headers:{'cache-control':'private, no-store'}}),digest=v=>createHash('sha256').update(v).digest();
 return async request=>{
  if(Date.now()>=notAfter)return reply({error:'Verification window closed'},410);
  const rt=runtime(),v=rt.node.match(/^(\d+)\.(\d+)\.(\d+)$/);if(!v||rt.platform!=='linux'||rt.arch!=='x64'||Number(v[1])!==22||Number(v[2])<23||(Number(v[2])===23&&Number(v[3])<4))return reply({error:'Runtime review required'},503);
  const token=getEnv('ATS_HOME_COMPARE_TOKEN');if(request.method!=='POST'||typeof token!=='string'||token.length<64)return reply({error:'Unavailable'},405);
  if(!timingSafeEqual(digest(request.headers.get('authorization')??''),digest('Bearer '+token)))return reply({error:'Unauthorized'},401);
  if(getEnv('SITE_ID')!=='6fe7a9ca-878e-4b7b-bb4a-966efdc4d1a0')return reply({error:'Wrong scope'},503);
  try{
   const chunks=[];let size=0;for await(const c of request.body??[]){size+=c.length;if(size>65536)return reply({error:'Request too large'},413);chunks.push(c);}const body=JSON.parse(Buffer.concat(chunks));
   if(body.operation==='runtime')return reply({...rt,secretExportAllowed:false});
   if(body.operation!=='compare'||!body.candidates||Array.isArray(body.candidates)||typeof body.candidates!=='object')return reply({error:'Invalid comparison'},400);
   const checks={};for(const[key,candidate]of Object.entries(body.candidates)){
    if(!allowed.has(key)||typeof candidate!=='string'||candidate.length>5000)return reply({error:'Invalid comparison'},400);
    const actual=getEnv(key);checks[key]={configured:typeof actual==='string'&&actual.length>0,matches:typeof actual==='string'&&candidate.length>0&&timingSafeEqual(digest(actual),digest(candidate))};
   }
   return reply({checks,secretExportAllowed:false});
  }catch{return reply({error:'Comparison withheld'},400);}
 };
}
