import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Explicit opt-in for the separate payment stack. Never accepts a hosted target,
// the ordinary development database, arbitrary container names, or arbitrary ports.
export function localPaymentTarget(status,env=process.env){
 if(env.PAYMENT_FRESH_DISPOSABLE!==undefined){
  assert.equal(env.PAYMENT_FRESH_DISPOSABLE,'1');
  assert.equal(env.DOCKER_HOST,'unix:///Users/noelsierra/.lima/pr02-disposable/sock/docker.sock');
  const f=JSON.parse(readFileSync(env.PAYMENT_FRESH_MANIFEST,'utf8'));
  const c=status??JSON.parse(readFileSync(env.PAYMENT_FRESH_STATUS_FILE,'utf8'));
  assert.match(f.projectId,/^ats_payment_[a-f0-9]{12}$/);assert.equal(f.createdThisTask,true);
  assert.equal(f.container,'supabase_db_'+f.projectId);
  assert.equal(f.api,'http://127.0.0.1:57421');assert.equal(f.web,'http://127.0.0.1:3127');
  assert.equal(f.databasePort,57422);assert.equal(c.API_URL,f.api);
  const db=new URL(c.DB_URL);assert.equal(db.protocol,'postgresql:');
  assert.equal(db.hostname,'127.0.0.1');assert.equal(db.port,'57422');assert.equal(db.pathname,'/postgres');
  assert.equal(db.search,'');assert.equal(db.hash,'');
  return{fresh:true,container:f.container,api:f.api,web:f.web};
 }
 if(status)assert.equal(status.API_URL,'http://127.0.0.1:54321');
 return{fresh:false,container:'supabase_db_ats_pr02_disposable',api:'http://127.0.0.1:54321',web:'http://127.0.0.1:3102'};
}

export function guardPaymentFetch(target){
 const original=globalThis.fetch,state={blocked:0};
 if(target.fresh)globalThis.fetch=(input,init={})=>{
  const url=new URL(input instanceof Request?input.url:input);
  if(![target.api,target.web].includes(url.origin)){state.blocked++;throw Error('Non-isolated payment test request blocked');}
  return original(input,{...init,redirect:init.redirect??'error',signal:init.signal??AbortSignal.timeout(30000)});
 };
 return{state,restore(){globalThis.fetch=original;}};
}
