// Local review harness: no cloud API, credentials copied from the CRM, or
// production environment. The original developer server remains loopback-only.
import assert from 'node:assert/strict';
import {createServer,request as httpRequest} from 'node:http';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {statSync,readFileSync,mkdtempSync,writeFileSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createCredentials,validateConfig,handleGate} from './gate.mjs';

export function localTarget(value) {
  const url=new URL(value);
  assert.ok(url.protocol==='http:' && url.hostname==='127.0.0.1' && Number(url.port)>=1024 &&
    url.origin===value && !url.username && !url.password && url.pathname==='/' && !url.search && !url.hash,'Only explicit high-port IPv4 loopback origins are supported.');
  return url;
}

export async function initializeLocal() {
  const directory=mkdtempSync(join(tmpdir(),'ats-staging-access-'));chmodSync(directory,0o700);
  const {password,...credentials}=await createCredentials();
  const config={...credentials,local:true,siteId:'d81d923d-6ccf-4c1e-87cc-263f3d51555d',
    origin:'http://127.0.0.1:3110',upstream:'http://127.0.0.1:3102'};
  const configFile=join(directory,'config.private.json'),accessCodeFile=join(directory,'access-code.private.txt');
  writeFileSync(configFile,JSON.stringify(config,null,2)+'\n',{mode:0o600,flag:'wx'});
  writeFileSync(accessCodeFile,password+'\n',{mode:0o600,flag:'wx'});
  return {configFile,accessCodeFile,origin:config.origin,credentialsPrinted:false,cloudRequests:0};
}

function forward(request,upstream,publicOrigin) {
  return new Promise((resolve,reject)=>{
    const incoming=new URL(request.url),target=new URL(incoming.pathname+incoming.search,upstream.origin);
    if(target.origin!==upstream.origin) return reject(Error('target'));
    const headers=Object.fromEntries(request.headers);
    for(const name of ['connection','proxy-authorization','proxy-connection','transfer-encoding','upgrade','keep-alive','trailer','te']) delete headers[name];
    headers.host=upstream.host;headers['x-forwarded-host']=new URL(publicOrigin).host;
    headers['x-forwarded-proto']='http';headers['x-forwarded-for']='127.0.0.1';
    const outgoing=httpRequest(target,{method:request.method,headers,timeout:30000},response=>{
      const resultHeaders=new Headers();
      for(let i=0;i<response.rawHeaders.length;i+=2){
        const key=response.rawHeaders[i];if(!['connection','transfer-encoding','keep-alive'].includes(key.toLowerCase())) resultHeaders.append(key,response.rawHeaders[i+1]);
      }
      const location=resultHeaders.get('location');
      if(location) {const destination=new URL(location,upstream.origin);if(destination.origin===upstream.origin) resultHeaders.set('location',publicOrigin+destination.pathname+destination.search+destination.hash);}
      const empty=request.method==='HEAD' || [204,205,304].includes(response.statusCode);
      if(empty) response.resume();
      resolve(new Response(empty ? null : Readable.toWeb(response),{status:response.statusCode,headers:resultHeaders}));
    });
    outgoing.on('timeout',()=>outgoing.destroy(Error('timeout')));outgoing.on('error',reject);
    if(request.body) pipeline(Readable.fromWeb(request.body),outgoing).catch(reject);else outgoing.end();
  });
}

export function startLocalGateway(config) {
  assert.equal(config.local,true,'This launcher cannot start hosted protection.');
  const bound=validateConfig(config),origin=localTarget(bound.origin),upstream=localTarget(bound.upstream);
  assert.notEqual(origin.port,upstream.port,'A gateway cannot proxy to itself.');
  const server=createServer(async(incoming,outgoing)=>{
    try {
      // Ignore forwarded Host/IP/protocol claims. Bind the actual HTTP Host and
      // reject absolute request targets, including DNS-rebinding/alias attempts.
      if(incoming.headers.host!==origin.host || !incoming.url?.startsWith('/') || incoming.url.startsWith('//')) {
        outgoing.writeHead(421,{'Cache-Control':'no-store'});outgoing.end('Staging address not available.');return;
      }
      const headers=new Headers();
      for(let i=0;i<incoming.rawHeaders.length;i+=2) headers.append(incoming.rawHeaders[i],incoming.rawHeaders[i+1]);
      const method=incoming.method ?? 'GET';
      const request=new Request(origin.origin+incoming.url,{method,headers,
        ...(!['GET','HEAD'].includes(method) ? {body:Readable.toWeb(incoming),duplex:'half'} : {})});
      const response=await handleGate(request,bound,authorized=>forward(authorized,upstream,origin.origin));
      outgoing.statusCode=response.status;
      for(const [name,value] of response.headers) if(name!=='set-cookie') outgoing.setHeader(name,value);
      const cookies=response.headers.getSetCookie();if(cookies.length) outgoing.setHeader('Set-Cookie',cookies);
      if(method==='HEAD' || !response.body) outgoing.end();else await pipeline(Readable.fromWeb(response.body),outgoing);
    } catch { if(!outgoing.headersSent) outgoing.writeHead(503,{'Cache-Control':'no-store'});outgoing.end('Staging access unavailable.'); }
  });
  server.requestTimeout=30000;server.headersTimeout=15000;server.maxHeadersCount=100;
  server.on('upgrade',(_request,socket)=>{socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');});
  return server;
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  try {
    const args=process.argv.slice(2);
    if(args.length===1 && args[0]==='--init') console.log(JSON.stringify(await initializeLocal(),null,2));
    else {
      assert.ok(args.length===2 && args[0]==='--config');
      const stat=statSync(args[1]);assert.ok(stat.isFile() && (stat.mode&0o077)===0 && stat.size<4096,'Use a private config file.');
      const config=JSON.parse(readFileSync(args[1],'utf8')),server=startLocalGateway(config);
      server.on('error',()=>{console.error('Local staging gate could not start. No other server was changed.');process.exitCode=1;});
      server.listen(Number(new URL(config.origin).port),'127.0.0.1',()=>console.log('Local staging gate listening at '+config.origin));
    }
  } catch {console.error('Local staging gate setup failed. Existing files and servers were not replaced.');process.exitCode=1;}
}
