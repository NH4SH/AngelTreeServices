// Actual Edge source with explicit synthetic Web API/platform bindings.
// This is not a Deno, CDN or platform-route emulator.
import assert from 'node:assert/strict';
import {load} from './pr10-test-helpers.mjs';
import {stagingFixture} from './staging-fixture.mjs';
import * as gate from '../staging/access/gate.mjs';
export async function edgeFixture(){
 const fixture=stagingFixture(),credentials=await gate.createCredentials();
 const env={...fixture.env,STAGING_GATE_KEY:credentials.sessionKey,STAGING_GATE_VERIFIER:credentials.passwordVerifier};
 const adapter=load('../staging/access/edge/staging-access.js',{'../../targets.json':fixture.manifest,'../gate.mjs':gate});
 async function invoke(request,next=()=>assert.fail('Denied request reached next'),options={}){
  const previous=Object.getOwnPropertyDescriptor(globalThis,'Netlify');
  try{
   if(options.absent)delete globalThis.Netlify;
   else Object.defineProperty(globalThis,'Netlify',{configurable:true,value:{env:{get:name=>{if(options.throwEnv)throw Error('PRIVATE_ENV_CANARY');return(options.env??env)[name];}}}});
   return await adapter.default(request,{site:{id:options.siteId??fixture.manifest.staging.netlifySiteId},next});
  }finally{if(previous)Object.defineProperty(globalThis,'Netlify',previous);else delete globalThis.Netlify;}
 }
 const request=(path,options={})=>new Request(fixture.env.APP_BASE_URL+path,options);
 async function login(){const r=await invoke(request(gate.LOGIN_PATH,{method:'POST',headers:{origin:fixture.env.APP_BASE_URL,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({password:credentials.password,returnTo:'/admin'})}));assert.equal(r.status,303);return{response:r,cookie:r.headers.get('set-cookie').split(';',1)[0]};}
 return{...fixture,env,credentials,invoke,request,login,config:adapter.config};
}
export function privateHeaders(response){
 for(const name of ['cache-control','cdn-cache-control','netlify-cdn-cache-control','surrogate-control'])assert.match(response.headers.get(name)??'',/private, no-store/);
 assert.equal(response.headers.get('etag'),null);assert.equal(response.headers.get('last-modified'),null);
 assert.match(response.headers.get('vary')??'',/cookie/i);assert.match(response.headers.get('x-robots-tag')??'',/noindex/);
}
