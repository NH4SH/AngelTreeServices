import {createServer} from 'node:http';
import {handoffAssets} from './assets.mjs';
import {CheckoutError} from '../production/runtime/policy.mjs';
const BASE='/firewood/checkout/',COOKIE='ats_firewood_v2_qa';
const headers={'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
  'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"};
function originOnly(value){let u;try{u=new URL(value);}catch{throw Error('loopback_test_origin_required');}
  if(u.origin!==value||u.protocol!=='http:'||u.hostname!=='127.0.0.1'||!u.port||u.username||u.password)throw Error('loopback_test_origin_required');return u;}
async function body(req){if(Number(req.headers['content-length'])>16384)throw new CheckoutError('Request is too large.',413);const parts=[];let bytes=0;
  for await(const p of req){bytes+=p.length;if(bytes>16384)throw new CheckoutError('Request is too large.',413);parts.push(p);}
  try{const v=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)));if(!v||typeof v!=='object'||Array.isArray(v))throw Error();return v;}
  catch{throw new CheckoutError('The order could not be read.',400);}}
export async function testOrderServer({orders,origin,testOnly}){
  if(testOnly!==true||orders.scope.testOnly!==true)throw Error('isolated_order_server_required');
  const canonical=originOnly(origin),files=await handoffAssets({sandbox:true});
  const server=createServer(async(req,res)=>{
    const send=(status,value,type='application/json; charset=utf-8',extra={})=>{res.writeHead(status,{...headers,'Content-Type':type,...extra});res.end(req.method==='HEAD'?'':type.startsWith('application/json')?JSON.stringify(value):value);};
    try{if(req.socket.remoteAddress!=='127.0.0.1'||req.headers.host!==canonical.host||req.rawHeaders.filter((_,i)=>i%2===0&&req.rawHeaders[i].toLowerCase()==='host').length!==1||req.headers.forwarded||req.headers['x-forwarded-host']||req.headers['x-forwarded-proto'])return send(403,{error:'Use the isolated checkout address.'});
      if(!req.url?.startsWith('/')||req.url.startsWith('//'))return send(400,{error:'Invalid path.'});const url=new URL(req.url,origin);
      if(req.method==='POST'&&req.headers.origin!==origin)return send(403,{error:'Use this checkout to send the request.'});
      if(url.pathname==='/health'&&req.method==='GET')return send(200,{sandbox:true,livePayments:false});
      if(url.pathname==='/robots.txt'&&req.method==='GET')return send(200,'User-agent: *\nDisallow: /\n','text/plain');
      if(url.pathname.startsWith(BASE+'api/')){
        const action=url.pathname.slice((BASE+'api/').length);if(!['GET','POST'].includes(req.method))return send(405,{error:'Method not allowed.'});
        const value=(req.headers.cookie??'').split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
        const session=await orders.session(value,req.method==='GET'&&action==='state'),extra=session.cookie!==value?{'Set-Cookie':`${COOKIE}=${session.cookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`}:{};
        if(req.method==='GET'&&action==='state')return send(200,await orders.state(session),undefined,extra);
        if(req.method==='GET'&&action==='confirmation')return send(200,await orders.confirmation(session));
        if(req.method!=='POST'||req.headers['content-type']!=='application/json')return send(415,{error:'JSON POST required.'});
        const input=await body(req);if(action==='start')return send(200,await orders.start(session,input));if(action==='resume')return send(200,await orders.resume(session,input));return send(404,{error:'Endpoint not found.'});
      }
      if(!['GET','HEAD'].includes(req.method))return send(405,{error:'Method not allowed.'});const file=files.get(url.pathname);if(!file)return send(404,{error:'Page not found.'});
      const html=file.type.startsWith('text/html')&&url.searchParams.get('text')==='200'?file.body.replace('</head>',`<link rel="stylesheet" href="${BASE}enlarged.css"></head>`):file.body;
      send(200,html,file.type);
    }catch(e){if(!res.headersSent)send(e instanceof CheckoutError?e.status:503,{error:e instanceof CheckoutError?e.message:'Your saved order must be checked before continuing. Please try again shortly or call Angel.',field:e instanceof CheckoutError?e.field??null:null});else res.end();}
  });
  server.requestTimeout=20000;server.headersTimeout=10000;server.maxHeadersCount=40;
  return{server,async listen(port=0){await new Promise((yes,no)=>{server.once('error',no);server.listen(port,'127.0.0.1',yes);});return server.address().port;},async close(){server.closeAllConnections();await new Promise(ok=>server.close(ok));}};
}
