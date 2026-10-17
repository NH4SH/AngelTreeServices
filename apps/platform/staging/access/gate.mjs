// Staging-only perimeter. Web APIs only: the same handler runs in local tests
// and the isolated staging Edge adapter. No database, provider or log calls.
import { accessPage } from './page.mjs';

export const SESSION_SECONDS = 4 * 60 * 60;
export const LOGIN_PATH = '/__staging-gate/login';
export const LOGOUT_PATH = '/__staging-gate/logout';
const hostedCookie = '__Host-ats-stage-access';
const localCookie = 'ats-stage-access-local';
const encoder = new TextEncoder();
const passwordDomain = 'ats-stage-password-v1\0';
const sessionDomain = 'ats-stage-session-v1\0';
const forbiddenIds = new Set(['6fe7a9ca-878e-4b7b-bb4a-966efdc4d1a0','86c48a95-ead4-4b15-8e57-fa827558b2f0']);
const productionHost = host => /^(?:admin\.|www\.)?angeltreeservices?\.org\.?$/i.test(host);
const b64 = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
function unb64(text, max=1024) {
  if (typeof text!=='string' || !/^[A-Za-z0-9_-]+$/.test(text) || text.length>max) throw Error('encoding');
  const value=Uint8Array.from(atob(text.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
  if (b64(value)!==text) throw Error('encoding'); return value;
}
const keyFor = secret => crypto.subtle.importKey('raw',unb64(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
const sign = async (key,domain,value) => new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(domain+value)));
const verify = (key,domain,value,signature) => crypto.subtle.verify('HMAC',key,signature,encoder.encode(domain+value));

export async function createCredentials() {
  const password=b64(crypto.getRandomValues(new Uint8Array(32)));
  const sessionKey=b64(crypto.getRandomValues(new Uint8Array(32)));
  const passwordVerifier=b64(await sign(await keyFor(sessionKey),passwordDomain,password));
  return {password,sessionKey,passwordVerifier};
}

export function validateConfig(config) {
  const origin=new URL(config.origin);
  if (origin.origin!==config.origin || origin.username || origin.password || origin.pathname!=='/' || origin.search || origin.hash ||
    productionHost(origin.hostname) || forbiddenIds.has(config.siteId?.toLowerCase()) ||
    !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(config.siteId ?? '') ||
    unb64(config.sessionKey).length!==32 || unb64(config.passwordVerifier).length!==32) throw Error('config');
  if (config.local===true) {
    if (origin.protocol!=='http:' || origin.hostname!=='127.0.0.1' || !origin.port) throw Error('local binding');
  } else if (config.local!==false || origin.protocol!=='https:' || origin.port ||
    !/^[a-z\d](?:[a-z\d.-]*[a-z\d])?\.[a-z]{2,}$/i.test(origin.hostname) || origin.hostname.endsWith('.localhost')) throw Error('hosted binding');
  return { ...config, cookieName:config.local ? localCookie : hostedCookie };
}

export function hostedConfig(manifest,env,siteId) {
  const staging=manifest?.staging;
  if(env.APP_ENV!=='staging' || env.STAGING_MODE!=='core-no-providers' || siteId!==staging?.netlifySiteId ||
    env.APP_BASE_URL!==staging?.appOrigin || Object.keys(env).some(k=>/^(?:NEXT_PUBLIC_|PUBLIC_|VITE_)STAGING_GATE_/.test(k) && env[k])) throw Error('binding');
  return validateConfig({origin:staging.appOrigin,siteId:staging.netlifySiteId,local:false,
    sessionKey:env.STAGING_GATE_KEY,passwordVerifier:env.STAGING_GATE_VERIFIER});
}

function privateResponse(response) {
  const headers=new Headers(response.headers);
  for (const name of ['Cache-Control','CDN-Cache-Control','Netlify-CDN-Cache-Control','Surrogate-Control']) headers.set(name,'private, no-store, max-age=0');
  headers.delete('etag'); headers.delete('last-modified');
  const vary=headers.get('vary'); if (!vary?.split(',').some(v=>v.trim().toLowerCase()==='cookie')) headers.set('vary',vary ? vary+', Cookie' : 'Cookie');
  // no-referrer can turn a browser form POST's Origin into null. Preserve the
  // CRM's policy; gate pages use same-origin (no cross-origin referrer leakage).
  if(!headers.has('Referrer-Policy')) headers.set('Referrer-Policy','same-origin');
  headers.set('X-Robots-Tag','noindex, nofollow, noarchive');
  headers.set('X-Content-Type-Options','nosniff');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
const text = (message,status) => new Response(message,{status,headers:{'Content-Type':'text/plain; charset=utf-8'}});
const redirect = location => new Response(null,{status:303,headers:{Location:location}});

export function returnPath(value) {
  if (typeof value!=='string' || value.length>2048 || !value.startsWith('/') || value.startsWith('//') || /[\\\x00-\x20\x7f]/.test(value)) return '/admin';
  try {
    const decoded=decodeURIComponent(value);
    if (decoded.startsWith('//') || /[\\\x00-\x1f\x7f]/.test(decoded)) return '/admin';
    const url=new URL(value,'https://gate.example.invalid');
    if (url.origin!=='https://gate.example.invalid' || url.pathname.startsWith('//') || url.pathname.startsWith('/__staging-gate')) return '/admin';
    return url.pathname+url.search;
  } catch { return '/admin'; }
}

function readCookie(request,name) {
  const raw=request.headers.get('cookie') ?? ''; if (raw.length>16384) throw Error('cookies');
  const values=raw.split(';').map(x=>x.trim()).filter(x=>x.split('=',1)[0]===name);
  if (values.length>1) throw Error('cookies'); return values[0]?.slice(name.length+1) ?? null;
}

async function validSession(value,config,key,now) {
  if (!value || value.length>2048) return false;
  try {
    const [version,payload,signature,...extra]=value.split('.');
    if (version!=='v1' || extra.length || unb64(signature).length!==32 || !await verify(key,sessionDomain,payload,unb64(signature))) return false;
    const session=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(unb64(payload)));
    return Object.keys(session).sort().join(',')==='aud,exp,iat,nonce,v' && session.v===1 &&
      session.aud===config.siteId+'|'+config.origin && Number.isSafeInteger(session.iat) && Number.isSafeInteger(session.exp) &&
      session.iat<=now+30 && session.exp>now && session.exp-session.iat===SESSION_SECONDS &&
      typeof session.nonce==='string' && unb64(session.nonce).length===16;
  } catch { return false; }
}

const cookie = (config,value,maxAge) => `${config.cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${config.local ? '' : '; Secure'}`;
function sameOrigin(request,origin) {
  const site=request.headers.get('sec-fetch-site');
  return request.headers.get('origin')===origin && (!site || site==='same-origin' || site==='none');
}
async function loginBody(request) {
  if (!/^application\/x-www-form-urlencoded(?:\s*;.*)?$/i.test(request.headers.get('content-type') ?? '')) throw Error('form');
  if (request.headers.has('content-encoding') || Number(request.headers.get('content-length') ?? 0)>2048) throw Error('form');
  const reader=request.body?.getReader(); if (!reader) throw Error('form'); let length=0; const parts=[];
  try { while(true) {const {done,value}=await reader.read(); if(done) break; length+=value.length;if(length>2048) throw Error('form');parts.push(value);} }
  finally {await reader.cancel().catch(()=>{});}
  const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
  const form=new URLSearchParams(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if (form.getAll('password').length!==1 || form.getAll('returnTo').length>1) throw Error('form');
  return form;
}
function page(path,error=false,active=false) {
  return new Response(accessPage(returnPath(path),error,active),{status:active ? 200 : 401,headers:{
    'Content-Type':'text/html; charset=utf-8',
    'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    'X-Frame-Options':'DENY',
  }});
}

export async function handleGate(request,rawConfig,next,{now=Math.floor(Date.now()/1000)}={}) {
  try {
    const config=validateConfig(rawConfig),url=new URL(request.url);
    if (url.origin!==config.origin || request.headers.has('x-middleware-subrequest')) return privateResponse(text('Staging address not available.',421));
    const key=await keyFor(config.sessionKey);
    if (url.pathname===LOGIN_PATH) {
      if (request.method==='GET' || request.method==='HEAD') {
        const active=await validSession(readCookie(request,config.cookieName),config,key,now);
        const result=page('/admin',false,active); return privateResponse(request.method==='HEAD' ? new Response(null,{status:result.status,headers:result.headers}) : result);
      }
      if (request.method!=='POST') return privateResponse(text('Method not allowed.',405));
      if (!sameOrigin(request,config.origin)) return privateResponse(text('Access request not allowed.',403));
      let form;try {form=await loginBody(request);}catch{return privateResponse(text('Access request not valid.',400));}
      const password=form.get('password');
      if (!password || password.length>256 || !await verify(key,passwordDomain,password,unb64(config.passwordVerifier))) return privateResponse(page(form.get('returnTo'),true));
      const payload=b64(encoder.encode(JSON.stringify({v:1,aud:config.siteId+'|'+config.origin,iat:now,exp:now+SESSION_SECONDS,nonce:b64(crypto.getRandomValues(new Uint8Array(16)))})));
      const value='v1.'+payload+'.'+b64(await sign(key,sessionDomain,payload));
      const response=redirect(returnPath(form.get('returnTo')));response.headers.append('set-cookie',cookie(config,value,SESSION_SECONDS));return privateResponse(response);
    }
    if (url.pathname===LOGOUT_PATH) {
      if (request.method!=='POST') return privateResponse(text('Method not allowed.',405));
      if (!sameOrigin(request,config.origin)) return privateResponse(text('Access request not allowed.',403));
      const response=redirect(LOGIN_PATH); response.headers.append('set-cookie',cookie(config,'',0));return privateResponse(response);
    }
    if (!await validSession(readCookie(request,config.cookieName),config,key,now)) {
      const document=request.method==='GET' && request.headers.get('accept')?.includes('text/html') &&
        (!request.headers.has('sec-fetch-dest') || request.headers.get('sec-fetch-dest')==='document');
      return privateResponse(document ? page(url.pathname+url.search) : text('Staging access required.',401));
    }
    if (!['GET','HEAD','OPTIONS'].includes(request.method) && request.headers.has('origin') && !sameOrigin(request,config.origin)) return privateResponse(text('Access request not allowed.',403));
    const headers=new Headers(request.headers);
    const remaining=(headers.get('cookie') ?? '').split(';').map(x=>x.trim()).filter(x=>x && x.split('=',1)[0]!==config.cookieName).join('; ');
    if(remaining) headers.set('cookie',remaining);else headers.delete('cookie');
    const response=await next(new Request(request,{headers}));
    return privateResponse(response);
  } catch { return privateResponse(text('Staging access is unavailable. Contact the person who set up this preview.',503)); }
}
