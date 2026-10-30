import assert from 'node:assert/strict';import http from 'node:http';import {isIP} from 'node:net';import {timingSafeEqual} from 'node:crypto';import {Transform} from 'node:stream';
const hop=new Set(['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade','expect']);
export function createPrimaryGateway({canonicalHost,proxyToken,admission,workerDispatchAllowed=()=>true,appPort=3251,backendHost='api-gw',backendPort=8000}){
 assert.equal(canonicalHost,'admin.angeltreeservices.org');assert.ok(typeof proxyToken==='string'&&/^[a-f0-9]{64}$/.test(proxyToken),'Invalid configured proxy secret');
 const fixed=(res,status)=>{if(res.headersSent)return res.destroy();res.writeHead(status,{'content-type':'text/plain; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff','retry-after':'30'});res.end(status===413?'Request too large.':status===503?'CRM temporarily unavailable. Please try again shortly.':'Request unavailable.');};
 const server=http.createServer({maxHeaderSize:16*1024},(req,res)=>{
  if(![canonicalHost,canonicalHost+':443'].includes(req.headers.host))return fixed(res,421);
  const received=Buffer.from(req.headers['x-ats-proxy-token']??''),expected=Buffer.from(proxyToken);
  if(received.length!==expected.length||!timingSafeEqual(received,expected))return fixed(res,403);
  const client=req.headers['x-ats-original-client-ip'];if(typeof client!=='string'||!isIP(client))return fixed(res,403);
  if(!req.url?.startsWith('/')||req.url.startsWith('//'))return fixed(res,400);if(['CONNECT','TRACE'].includes(req.method))return fixed(res,405);
  try{assert.equal(admission(),true);}catch{return fixed(res,503);}
  let pathname;try{const decoded=decodeURIComponent(req.url.split('?')[0]);assert.ok(!/[\u0000-\u001f\\]/.test(decoded));pathname=new URL('https://'+canonicalHost+decoded.replace(/\/{2,}/g,'/')).pathname;}catch{return fixed(res,400);}
  if(pathname==='/api/internal'||pathname.startsWith('/api/internal/')){
    try{assert.equal(workerDispatchAllowed(),true);}catch{return fixed(res,503);}
  }
  const extra=new Set((req.headers.connection??'').split(',').map(x=>x.trim().toLowerCase()));
  const headers=Object.fromEntries(Object.entries(req.headers).filter(([key])=>!hop.has(key)&&!extra.has(key)&&!key.startsWith('x-forwarded-')&&!key.startsWith('x-ats-')&&key!=='forwarded'&&key!=='x-nf-client-connection-ip'));
  Object.assign(headers,{host:canonicalHost,'x-forwarded-host':canonicalHost,'x-forwarded-proto':'https','x-forwarded-for':client,'x-nf-client-connection-ip':client});
  const backend=req.url.startsWith('/backend/');
  const upstream=http.request({hostname:backend?backendHost:'127.0.0.1',port:backend?backendPort:appPort,path:backend?req.url.slice('/backend'.length):req.url,method:req.method,headers,timeout:35000},incoming=>{
   const connectionTokens=new Set((incoming.headers.connection??'').split(',').map(x=>x.trim().toLowerCase()));
   const outbound=Object.fromEntries(Object.entries(incoming.headers).filter(([key])=>!hop.has(key)&&!connectionTokens.has(key)));
   if(backend)outbound['cache-control']='private, no-store';res.writeHead(incoming.statusCode??502,outbound);incoming.on('error',()=>res.destroy());incoming.pipe(res);
  });
  // Never replay a partial/failed POST. Provider/webhook retry semantics remain
  // with the existing durable application commands.
  upstream.on('error',()=>fixed(res,503));upstream.on('timeout',()=>upstream.destroy());req.on('aborted',()=>upstream.destroy());res.on('close',()=>upstream.destroy());
  let bytes=0;const bounded=new Transform({transform(chunk,encoding,callback){bytes+=chunk.length;if(bytes>26*1024*1024){fixed(res,413);upstream.destroy();callback(Error('body_limit'));}else callback(null,chunk);}});
  bounded.on('error',()=>req.unpipe(bounded));req.on('error',()=>upstream.destroy());req.pipe(bounded).pipe(upstream);
 });
 server.requestTimeout=120000;server.headersTimeout=10000;server.keepAliveTimeout=5000;server.on('clientError',(_,socket)=>socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'));return server;
}
