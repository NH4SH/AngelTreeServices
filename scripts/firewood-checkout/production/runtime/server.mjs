import {createServer,request as httpsRequest} from 'node:https';
import {CheckoutError} from './policy.mjs';
import {assets as buildAssets} from './assets.mjs';
import {digest} from './checkout.mjs';
import {checkServerIdentity} from 'node:tls';
export const BASE='/firewood/checkout/';
export const headers={'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin',
  'Strict-Transport-Security':'max-age=86400','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"};
const accessCookie='__Host-ats_firewood_candidate_access',orderCookie='__Host-ats_firewood_customer';
export {accessCookie,orderCookie};
const cookie=(name,value,age)=>`${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${age}`;
function cookies(req){const result={};for(const v of (req.headers.cookie??'').split(';')){const m=/^\s*([^=\s]+)=([a-f0-9]{48})$/u.exec(v);if(m)result[m[1]]=m[2];}return result;}
async function body(req,max){if(Number(req.headers['content-length'])>max)throw new CheckoutError('Request is too large.',413);const parts=[];let n=0;for await(const p of req){n+=p.length;if(n>max)throw new CheckoutError('Request is too large.',413);parts.push(p);}return Buffer.concat(parts);}
function send(res,status,value,type='application/json; charset=utf-8',extra={}){res.writeHead(status,{...headers,'Content-Type':type,...extra});res.end(type.startsWith('application/json')?JSON.stringify(value):value);}
const pin=s=>(s??'').replaceAll(':','').toLowerCase();
function tlsOptions(tls,client=false){if(!tls.key||!tls.cert||!tls.ca)throw Error('private_tls_material_required');return {key:tls.key,cert:tls.cert,ca:tls.ca,minVersion:'TLSv1.2',rejectUnauthorized:true,...(!client?{requestCert:true}:{})};}
export async function backendServer(app,tls){const {checkout,worker,config}=app,canonical=new URL(config.origin),files=await buildAssets(config);
  if(!/^[a-f0-9]{64}$/u.test(pin(tls.relayFingerprint))||! /^[a-f0-9]{64}$/u.test(pin(tls.ownerFingerprint))||pin(tls.relayFingerprint)===pin(tls.ownerFingerprint))throw Error('distinct_private_peer_pins_required');
  const server=createServer(tlsOptions(tls),async(req,res)=>{try{
    const cert=pin(req.socket.getPeerCertificate().fingerprint256),owner=cert===pin(tls.ownerFingerprint),relay=cert===pin(tls.relayFingerprint);
    if(!req.socket.authorized||(!owner&&!relay)||req.socket.remoteAddress!=='127.0.0.1'||req.rawHeaders.filter((v,i)=>i%2===0&&v.toLowerCase()==='host').length!==1||req.headers.host!==canonical.host||req.headers.forwarded||req.headers['x-forwarded-host']||req.headers['x-forwarded-proto'])return send(res,403,{error:'Private authenticated connection required.'});
    if(!req.url?.startsWith('/')||req.url.startsWith('//'))return send(res,400,{error:'Invalid path.'});const url=new URL(req.url,config.origin);
    if(url.pathname.startsWith('/owner/')){if(!owner)return send(res,404,{error:'Page not found.'});if(req.method!=='POST'||req.headers['content-type']!=='application/json')return send(res,405,{error:'JSON POST required.'});
      const input=JSON.parse((await body(req,16000)).toString());return send(res,200,await checkout.owner(url.pathname.slice('/owner/'.length),input));}
    if(owner)return send(res,404,{error:'Page not found.'});
    if(req.url==='/health'&&req.method==='GET'){await checkout.db.query('SELECT 1');return send(res,200,{ready:true,sandbox:config.sandbox});}
    if(url.pathname===BASE+'webhook'){if(req.method!=='POST')return send(res,405,{error:'POST required.'});return send(res,200,await worker.ingest(await body(req,256000),req.headers['stripe-signature']));}
    if(req.method==='POST'&&req.headers.origin!==config.origin)return send(res,403,{error:'Use the configured checkout to send this request.'});
    if(url.pathname==='/robots.txt')return send(res,200,'User-agent: *\nDisallow: /\n','text/plain; charset=utf-8');
    if(url.pathname===BASE+'access'&&config.sandbox&&req.method==='POST'){
      if(req.headers['content-type']!=='application/x-www-form-urlencoded')return send(res,415,{error:'Form data required.'});const token=await checkout.login(new URLSearchParams((await body(req,1024)).toString()).get('code'));
      return send(res,303,'','text/plain',{'Set-Cookie':cookie(accessCookie,token,14400),Location:BASE});}
    const values=cookies(req),publicStyle=url.pathname===BASE+'checkout.css'||url.pathname===BASE+'fonts.css'||url.pathname.startsWith(BASE+'fonts/');
    if(!publicStyle&&!await checkout.authorized(values[accessCookie])){
      if(req.method!=='GET'||url.pathname.includes('/api/'))return send(res,401,{error:'Sandbox access required.'});
      return send(res,401,`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Firewood sandbox access</title><link rel="stylesheet" href="${BASE}checkout.css"></head><body><main><h1>Firewood sandbox</h1><p>Use made-up details. No real payment or delivery.</p><form method="post" action="${BASE}access"><label>Sandbox access code<input name="code" type="password" required maxlength="64" autocomplete="off"></label><button class="primary">Open sandbox</button></form></main></body></html>`,'text/html; charset=utf-8');}
    if(url.pathname.startsWith(BASE+'api/')){
      const action=url.pathname.slice((BASE+'api/').length);if(!['GET','POST'].includes(req.method))return send(res,405,{error:'Method not allowed.'});
      const s=await checkout.session(values[orderCookie],req.method==='GET'&&action==='state');const extra=s.cookie!==values[orderCookie]?{'Set-Cookie':cookie(orderCookie,s.cookie,86400)}:{};
      if(req.method==='GET'&&action==='state'){const state=await checkout.state(s),quote=url.searchParams.get('quote');
        if(quote&&/^[a-f0-9]{48}$/u.test(quote)){const row=await checkout.one('SELECT quote,expires,used_by FROM fw_quotes WHERE id=$1',[digest(quote)]);if(row&&Number(row.expires)>checkout.now()&&(!row.used_by||row.used_by===s.order_id))state.assistedQuote=row.quote;}
        return send(res,200,state,undefined,extra);}
      if(req.method==='GET'&&action==='confirmation')return send(res,200,await checkout.confirmation(s));
      if(req.method!=='POST'||req.headers['content-type']!=='application/json')return send(res,415,{error:'JSON POST required.'});let input;
      try{input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await body(req,16000)));}catch(e){if(e instanceof CheckoutError)throw e;throw new CheckoutError('The order could not be read.');}
      if(!input||typeof input!=='object'||Array.isArray(input))throw new CheckoutError('The order could not be read.');
      if(action==='start')return send(res,200,await checkout.start(s,input));
      if(action==='reset'){await checkout.reset(s,input.csrf);return send(res,200,{ok:true},undefined,{'Set-Cookie':cookie(orderCookie,'',0)});}
      return send(res,404,{error:'Endpoint not found.'});}
    if(!['GET','HEAD'].includes(req.method))return send(res,405,{error:'Method not allowed.'});const file=files.get(url.pathname);if(!file)return send(res,404,{error:'Page not found.'});
    let value=file.body;if(file.type.startsWith('text/html')&&config.sandbox&&url.searchParams.get('text')==='200')value=value.replace('</head>','<link rel="stylesheet" href="'+BASE+'enlarged.css"></head>');send(res,200,req.method==='HEAD'?'':value,file.type);
  }catch(e){if(!res.headersSent)send(res,e instanceof CheckoutError?e.status:503,{error:e instanceof CheckoutError?e.message:'This step is pending. Your saved payment must be checked before trying again.',field:e.field??null});else res.end();}});
  server.requestTimeout=20000;server.headersTimeout=10000;server.maxHeadersCount=40;return managed(server);
}
export function relayServer(config,tls,{backendPort}){if(!tls.backendFingerprint)throw Error('pinned_backend_required');const host=new URL(config.origin).host;
  const server=createServer({key:tls.key,cert:tls.cert,minVersion:'TLSv1.2'},(req,res)=>{
    if(req.socket.remoteAddress!=='127.0.0.1'||req.rawHeaders.filter((v,i)=>i%2===0&&v.toLowerCase()==='host').length!==1||req.headers.host!==host||req.headers.forwarded||
      req.headers['x-forwarded-host']&&req.headers['x-forwarded-host']!==host||req.headers['x-forwarded-proto']&&req.headers['x-forwarded-proto']!=='https'||req.url.startsWith('/owner/'))return send(res,403,{error:'Use the configured checkout address.'});
    const headers={...req.headers,host};for(const name of ['forwarded','x-forwarded-host','x-forwarded-proto','x-owner','x-firewood-owner'])delete headers[name];
    // A fresh mutual-TLS handshake preserves the explicit peer proof. Resumed
    // TLS sessions may omit the peer certificate from getPeerCertificate().
    const upstream=httpsRequest({hostname:'127.0.0.1',port:backendPort,path:req.url,method:req.method,headers,agent:false,...tlsOptions({key:tls.clientKey,cert:tls.clientCert,ca:tls.ca},true),servername:'firewood-candidate-backend.invalid',timeout:18000,
      checkServerIdentity(name,cert){return checkServerIdentity(name,cert)||(pin(cert.fingerprint256)!==pin(tls.backendFingerprint)?Error('private_peer_pin_mismatch'):undefined);}},response=>{
      const peer=response.socket.getPeerCertificate();if(pin(peer.fingerprint256)!==pin(tls.backendFingerprint)){upstream.destroy();return send(res,502,{error:'Private checkout connection is unavailable.'});}
      res.writeHead(response.statusCode,response.headers);response.pipe(res);});
    upstream.on('timeout',()=>upstream.destroy());upstream.on('error',()=>{if(!res.headersSent)send(res,503,{error:'Checkout is temporarily unavailable. Please check a pending payment before trying again.'});else res.end();});req.pipe(upstream);
  });server.requestTimeout=20000;server.headersTimeout=10000;server.maxHeadersCount=40;return managed(server);}
function managed(server){return {server,async listen(port=0){await new Promise((yes,no)=>{server.once('error',no);server.listen(port,'127.0.0.1',yes);});return server.address().port;},async close(){server.closeAllConnections();await new Promise(yes=>server.close(yes));}};}
