// Self-contained loopback servers with synthetic bytes. No DB/provider calls,
// environment keys or existing app mutation. Run explicitly, not in the unit suite.
import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer,request as httpRequest} from 'node:http';
import {once} from 'node:events';
import {gzipSync} from 'node:zlib';
import {createCredentials,LOGIN_PATH,LOGOUT_PATH} from '../staging/access/gate.mjs';
import {startLocalGateway} from '../staging/access/local.mjs';

async function port(){const s=createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const p=s.address().port;await new Promise(resolve=>s.close(resolve));return p;}
test('real loopback gateway protects pages, APIs, assets, uploads and session lifecycle',async t=>{
  const calls=[];let validCookie;
  const upstream=createServer(async(req,res)=>{
    const chunks=[];for await(const chunk of req) chunks.push(chunk);const bytes=Buffer.concat(chunks);
    calls.push({path:req.url,method:req.method,headers:req.headers,bytes});
    if(req.url==='/redirect'){res.writeHead(302,{Location:`http://127.0.0.1:${upstream.address().port}/admin`});res.end();return;}
    if(req.url==='/compressed'){const body=gzipSync('synthetic compressed asset');res.writeHead(200,{'Content-Encoding':'gzip','Content-Length':String(body.length)});res.end(body);return;}
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'public, max-age=3600','Set-Cookie':['sb-a=one; Path=/','sb-b=two; Path=/']});res.end(JSON.stringify({path:req.url,length:bytes.length}));
  });
  upstream.listen(0,'127.0.0.1');await once(upstream,'listening');t.after(()=>{upstream.closeAllConnections();upstream.close();});
  const {password,...keys}=await createCredentials(),origin=`http://127.0.0.1:${await port()}`;
  const gateway=startLocalGateway({...keys,local:true,siteId:'d81d923d-6ccf-4c1e-87cc-263f3d51555d',origin,upstream:`http://127.0.0.1:${upstream.address().port}`});
  gateway.listen(Number(new URL(origin).port),'127.0.0.1');await once(gateway,'listening');t.after(()=>{gateway.closeAllConnections();gateway.close();});
  const access=async code=>fetch(origin+LOGIN_PATH,{method:'POST',redirect:'manual',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({password:code,returnTo:'/admin'})});
  await t.test('no upstream request occurs for denied route classes, spoofed bypass headers or wrong codes',async()=>{
    for(const path of ['/admin','/api/health/live','/_next/static/asset.js','/.netlify/functions/test','/.netlify/images?url=x']){
      const r=await fetch(origin+path,{headers:{'x-nf-ats-access':'true'}});assert.equal(r.status,401);await r.arrayBuffer();
    }
    const wrong=await access('wrong-code');assert.equal(wrong.status,401);await wrong.arrayBuffer();assert.equal(calls.length,0);
  });
  await t.test('successful access preserves upstream cookies and Bearer authorization',async()=>{
    const r=await access(password);assert.equal(r.status,303);validCookie=r.headers.get('set-cookie').split(';',1)[0];
    assert.doesNotMatch(r.headers.get('set-cookie'),/; Secure/);assert.match(r.headers.get('set-cookie'),/HttpOnly/);
    const content=await fetch(origin+'/api/test',{headers:{cookie:validCookie+'; sb-session=keep',authorization:'Bearer synthetic-api-token'}});
    assert.equal(content.status,200);assert.equal(content.headers.getSetCookie().length,2);assert.match(content.headers.get('cache-control'),/no-store/);await content.arrayBuffer();
    const call=calls.at(-1);assert.equal(call.headers.cookie,'sb-session=keep');assert.equal(call.headers.authorization,'Bearer synthetic-api-token');assert.equal(call.headers['x-forwarded-host'],new URL(origin).host);
  });
  await t.test('binary and 25 MiB uploads stream unchanged; compression and redirects remain usable',async()=>{
    const body=Buffer.alloc(25*1024*1024,0xa7),r=await fetch(origin+'/api/upload',{method:'POST',headers:{origin,cookie:validCookie,'content-type':'application/octet-stream'},body});
    assert.equal(r.status,200);assert.equal((await r.json()).length,body.length);assert.deepEqual(calls.at(-1).bytes,body);
    const compressed=await fetch(origin+'/compressed',{headers:{cookie:validCookie}});assert.equal(await compressed.text(),'synthetic compressed asset');
    const redirect=await fetch(origin+'/redirect',{redirect:'manual',headers:{cookie:validCookie}});assert.equal(redirect.headers.get('location'),origin+'/admin');await redirect.arrayBuffer();
  });
  await t.test('aliases, cross-site writes, HTTP upgrades and logout do not bypass the boundary',async()=>{
    const before=calls.length;
    await new Promise((resolve,reject)=>{
      // Fetch normalizes Host. Use the raw HTTP client to actually send a forged
      // Host header and test the server's binding rather than the client's filter.
      const r=httpRequest(origin+'/admin',{headers:{Host:'evil.invalid',Cookie:validCookie}},res=>{try{assert.equal(res.statusCode,421);res.resume();resolve();}catch(error){reject(error);}});r.on('error',reject);r.end();
    });
    const cross=await fetch(origin+'/api/test',{method:'POST',headers:{origin:'https://evil.invalid',cookie:validCookie}});assert.equal(cross.status,403);await cross.arrayBuffer();
    const status=await fetch(origin+LOGIN_PATH,{headers:{cookie:validCookie}});assert.equal(status.status,200);assert.match(await status.text(),/End preview access/);
    const logout=await fetch(origin+LOGOUT_PATH,{method:'POST',redirect:'manual',headers:{origin,cookie:validCookie}});assert.equal(logout.status,303);assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);await logout.arrayBuffer();
    const denied=await fetch(origin+'/admin');assert.equal(denied.status,401);await denied.arrayBuffer();assert.equal(calls.length,before);
    await new Promise((resolve,reject)=>{
      const r=httpRequest(origin,{headers:{Connection:'Upgrade',Upgrade:'websocket',Cookie:validCookie}},res=>{assert.equal(res.statusCode,403);res.resume();resolve();});r.on('upgrade',()=>reject(Error('Unexpected upgrade')));r.on('error',reject);r.end();
    });
  });
});
