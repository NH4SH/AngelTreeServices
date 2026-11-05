// The edge supplies visitor identity, while all CRM state and execution stay
// on the single admitted home primary. There is no fallback or request replay.
const hop=new Set(['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade','expect','host']);
// Preserve only the existing Firewood HMAC headers on their exact signed POST routes.
export const FIREWOOD_POST_PATHS=Object.freeze(["/api/integrations/firewood/live/v1/prepare","/api/integrations/firewood/live/v1/renew","/api/integrations/firewood/live/v1/status","/api/integrations/firewood/live/v2/office/price-request","/api/integrations/firewood/live/v2/office/price-status","/api/integrations/firewood/live/v2/office/order-status"]);
const signedFirewoodPaths=new Set(FIREWOOD_POST_PATHS),signatureHeaders=new Set(['x-ats-key-id','x-ats-timestamp','x-ats-signature']);
export function primaryEdgeProxy({origin,token,canonicalHost='admin.angeltreeservices.org',fetchImpl=fetch}){
 const target=new URL(origin);if(target.protocol!=='https:'||target.pathname!=='/'||target.search||target.hash||target.username||target.password||!target.hostname.endsWith('.angeltreeservices.org'))throw Error('Unapproved home origin');
 if(!/^[a-f0-9]{64}$/.test(token??'')||canonicalHost!=='admin.angeltreeservices.org')throw Error('Invalid edge configuration');
 const unavailable=()=>new Response('CRM temporarily unavailable. Please try again shortly.',{status:503,headers:{'cache-control':'private, no-store','retry-after':'30','x-content-type-options':'nosniff'}});
 return async(request,context)=>{
  const url=new URL(request.url);if(url.hostname!==canonicalHost)return new Response('Request unavailable.',{status:421,headers:{'cache-control':'no-store'}});
  // context.ip is supplied by Netlify, never by the requesting browser.
  if(typeof context.ip!=='string'||!context.ip||context.ip.includes(',')||/[\s\r\n]/.test(context.ip))return unavailable();
  const signedFirewoodPost=request.method==='POST'&&signedFirewoodPaths.has(url.pathname)&&!url.search&&!url.hash;
  const connection=new Set((request.headers.get('connection')??'').split(',').map(v=>v.trim().toLowerCase())),headers=new Headers();
  for(const[key,value]of request.headers)if(!hop.has(key)&&!connection.has(key)&&!key.startsWith('x-forwarded-')&&(!key.startsWith('x-ats-')||(signedFirewoodPost&&signatureHeaders.has(key)))&&!key.startsWith('x-nf-')&&key!=='forwarded')headers.append(key,value);
  headers.set('x-ats-proxy-token',token);headers.set('x-ats-original-client-ip',context.ip);headers.set('x-forwarded-host',canonicalHost);headers.set('x-forwarded-proto','https');
  const upstream=new URL(url.pathname+url.search,target);
  try{
   const options={method:request.method,headers,redirect:'manual',signal:request.signal};if(!['GET','HEAD'].includes(request.method)){options.body=request.body;options.duplex='half';}
   const result=await fetchImpl(upstream,options),out=new Headers(result.headers);for(const name of [...out.keys()])if(hop.has(name)||name.startsWith('x-ats-'))out.delete(name);
   const location=out.get('location');if(location){const resolved=new URL(location,upstream);if(resolved.origin===target.origin)out.set('location','https://'+canonicalHost+resolved.pathname+resolved.search+resolved.hash);}
   // Authenticated CRM/API output is never placed in shared edge caches.
   if(!url.pathname.startsWith('/_next/static/')){out.set('cache-control','private, no-store');out.set('cdn-cache-control','no-store');out.set('netlify-cdn-cache-control','no-store');}
   return new Response(result.body,{status:result.status,statusText:result.statusText,headers:out});
  }catch{return unavailable();}
 };
}
