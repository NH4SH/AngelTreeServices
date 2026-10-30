import { createServer } from 'node:http';
import { CheckoutError } from '../model.mjs';
import { browserAssets } from './assets.mjs';

export const ACCESS_COOKIE = '__Secure-ats_firewood_qa_access';
export const SESSION_COOKIE = '__Secure-ats_firewood_qa_order';
const path = '/firewood/checkout/';
export const headers = {
  'Cache-Control':'no-store', 'X-Robots-Tag':'noindex, nofollow', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer',
  'Strict-Transport-Security':'max-age=86400',
  'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};
function cookies(req) {
  const values = {};
  for (const item of (req.headers.cookie ?? '').split(';')) {
    const match = /^\s*([^=\s]+)=([a-f0-9]{48})$/u.exec(item);
    if (match) values[match[1]]=match[2];
  }
  return values;
}
async function rawBody(req,limit) {
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared>limit) throw new CheckoutError('Request is too large.',413);
  const parts=[];let size=0;
  for await (const chunk of req) { size+=chunk.length;if(size>limit)throw new CheckoutError('Request is too large.',413);parts.push(chunk); }
  return Buffer.concat(parts);
}
const loginHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="same-origin"><title>Firewood QA access</title><link rel="stylesheet" href="/firewood/checkout/checkout.css"></head><body><main><h1>Firewood QA access</h1><p>Private test checkout. Use made-up details only.</p><form action="/firewood/checkout/access" method="post"><label>Owner QA access code <input name="code" type="password" autocomplete="off" required maxlength="64"></label><button class="primary" type="submit">Open test checkout</button></form></main></body></html>`;

export async function createHostedServer({checkout,worker,config,assets = null}) {
  return createQaServer({checkout,worker,config,assets},false);
}

// A separate entry point for private MacBook tests. Render keeps its original
// HTTPS/proxy checks and Secure cookies; no environment flag relaxes them.
export async function createPrivateMacbookServer(options) {
  if(options.config.origin!=='http://127.0.0.1:56381')throw new Error('private_macbook_origin_required');
  return createQaServer(options,true);
}

async function createQaServer({checkout,worker,config,assets = null},privateLoopback) {
  assets ??= await browserAssets();
  const canonical = new URL(config.origin);
  const accessCookie=privateLoopback?'ats_firewood_mac_qa_access':ACCESS_COOKIE;
  const sessionCookie=privateLoopback?'ats_firewood_mac_qa_order':SESSION_COOKIE;
  const cookie=(name,value,seconds)=>`${name}=${value}; Path=${path}; ${privateLoopback?'':'Secure; '}HttpOnly; SameSite=Lax; Max-Age=${seconds}`;
  const responseHeaders={...headers};
  if(privateLoopback){
    delete responseHeaders['Strict-Transport-Security'];
    // Keep same-origin form POSTs attributable on the private HTTP preview;
    // cross-origin payment navigations still receive no referrer.
    responseHeaders['Referrer-Policy']='same-origin';
  }
  function send(res,status,data,type = 'application/json; charset=utf-8',extra = {}) {
    res.writeHead(status,{...responseHeaders,'Content-Type':type,...extra});
    res.end(type.startsWith('application/json')?JSON.stringify(data):data);
  }
  const server = createServer(async (req,res) => {
    try {
      if(privateLoopback && (req.socket.remoteAddress!=='127.0.0.1'||req.headers.host!==canonical.host||
          req.headers['x-forwarded-proto']||req.headers['x-forwarded-host']||req.headers.forwarded))return send(res,403,{error:'Use the private loopback QA address.'});
      // Provider-internal probes need not traverse its public HTTPS proxy.
      // This exact public path returns no order, account or credential details.
      if (req.url === '/health' && req.method === 'GET') {
        await checkout.db.query('SELECT 1'); return send(res,200,{testOnly:true,ready:true});
      }
      // Never construct origins or payment returns from Host/forwarded headers.
      if (!privateLoopback && (req.headers.host !== canonical.host || req.headers['x-forwarded-proto'] !== 'https')) return send(res,403,{error:'Use the configured HTTPS QA address.'});
      if (!req.url?.startsWith('/') || req.url.startsWith('//')) return send(res,400,{error:'Invalid path.'});
      const url = new URL(req.url,config.origin);
      if (url.origin !== config.origin) return send(res,400,{error:'Invalid path.'});
      if (url.pathname === '/robots.txt' && req.method === 'GET') return send(res,200,'User-agent: *\nDisallow: /\n','text/plain; charset=utf-8');
      if (url.pathname === `${path}webhook`) {
        if (req.method !== 'POST') return send(res,405,{error:'POST required.'});
        const body = await rawBody(req,256000);
        return send(res,200,await worker.ingest(body,req.headers['stripe-signature']));
      }
      if (req.method === 'POST' && req.headers.origin !== config.origin) return send(res,403,{error:'Use the QA checkout to send this request.'});
      if (url.pathname === `${path}access` && req.method === 'POST') {
        if (req.headers['content-type'] !== 'application/x-www-form-urlencoded') return send(res,415,{error:'Form data required.'});
        const body = new URLSearchParams((await rawBody(req,1024)).toString('utf8'));
        const access = await checkout.login(body.get('code'));
        return send(res,303,'','text/plain; charset=utf-8',{'Set-Cookie':cookie(accessCookie,access,14400),Location:path});
      }
      // The login form can load its reviewed local stylesheet without a session.
      if ([`${path}checkout.css`,`${path}fonts.css`,...Array.from(assets.keys()).filter(key=>key.startsWith(`${path}fonts/`))].includes(url.pathname) && ['GET','HEAD'].includes(req.method)) {
        const item=assets.get(url.pathname);return send(res,200,req.method==='HEAD'?'':item.body,item.type);
      }
      const values = cookies(req);
      if (!await checkout.authorized(values[accessCookie])) {
        if (!['GET','HEAD'].includes(req.method) || url.pathname.includes('/api/')) return send(res,401,{error:'Owner QA access is required.'});
        return send(res,401,req.method==='HEAD'?'':loginHtml,'text/html; charset=utf-8');
      }
      if (url.pathname.startsWith(`${path}api/`)) {
        if (!['GET','POST'].includes(req.method)) return send(res,405,{error:'Method not allowed.'});
        const saved=await checkout.session(values[sessionCookie],req.method==='GET' && url.pathname===`${path}api/state`);
        const extra = saved.id!==values[sessionCookie]?{'Set-Cookie':cookie(sessionCookie,saved.id,1800)}:{};
        if (req.method==='GET' && url.pathname===`${path}api/state`) return send(res,200,await checkout.state(saved.id,url.searchParams.get('verify')==='1'),undefined,extra);
        if (req.method==='GET' && url.pathname===`${path}api/confirmation`) return send(res,200,await checkout.confirmation(saved.id));
        if (req.method!=='POST') return send(res,405,{error:'POST required.'});
        if (req.headers['content-type']!=='application/json') return send(res,415,{error:'JSON required.'});
        let input;
        try { input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await rawBody(req,16000))); }
        catch (error) { if(error instanceof CheckoutError)throw error;throw new CheckoutError('The test order could not be read.'); }
        if (!input || typeof input!=='object' || Array.isArray(input)) throw new CheckoutError('The test order could not be read.');
        if (url.pathname===`${path}api/start`) return send(res,200,await checkout.start(saved.id,input));
        if (url.pathname===`${path}api/reset`) { await checkout.reset(saved.id,input.csrf);return send(res,200,{ok:true},undefined,{'Set-Cookie':cookie(sessionCookie,'',0)}); }
        return send(res,404,{error:'Endpoint not found.'});
      }
      if (!['GET','HEAD'].includes(req.method)) return send(res,405,{error:'Method not allowed.'});
      const item=assets.get(url.pathname);
      if (!item) return send(res,404,{error:'Page not found.'});
      let body=item.body;
      if (item.type.startsWith('text/html') && url.searchParams.get('text')==='200') body=body.replace('</head>','<link rel="stylesheet" href="/firewood/checkout/enlarged.css"></head>');
      return send(res,200,req.method==='HEAD'?'':body,item.type);
    } catch (error) {
      if (!res.headersSent) send(res,error instanceof CheckoutError?error.status:503,{error:error instanceof CheckoutError?error.message:'The QA step is pending. Check the saved payment before trying again.',field:error instanceof CheckoutError?error.field:null});
      else res.end();
    }
  });
  server.requestTimeout=20000;server.headersTimeout=10000;server.maxHeadersCount=40;
  return {server,async listen(port=0,host='127.0.0.1') {
    if(privateLoopback && host!=='127.0.0.1')throw new Error('loopback_bind_required');
    await new Promise((yes,no)=>{server.once('error',no);server.listen(port,host,yes);});return server.address().port;
  },async close(){server.closeAllConnections();await new Promise(yes=>server.close(yes));}};
}
