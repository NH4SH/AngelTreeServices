import {PREPARE_PATH,STATUS_PATH,RENEW_PATH,FirewoodHandoffError} from './contract.mjs';
import {handoffStagingScope} from './staging-profile.mjs';

// Backend-only transport. The existing staging perimeter still verifies the
// cookie signature; the API independently verifies the canonical HMAC.
export function stagingGateTransport(input,{gateCookie,fetcher=fetch,now=Date.now}){
  const scope=handoffStagingScope(input),fail=()=>{throw new FirewoodHandoffError('staging_access_review');};
  const match=/^__Host-ats-stage-access=(v1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43}))$/u.exec(gateCookie??'');
  if(!match||gateCookie.length>2048)fail();
  let session;try{session=JSON.parse(Buffer.from(match[2],'base64url').toString('utf8'));}catch{fail();}
  const valid=()=>session&&Object.keys(session).sort().join(',')==='aud,exp,iat,nonce,v'&&session.v===1&&
    session.aud===scope.siteId+'|'+scope.origin&&Number.isSafeInteger(session.iat)&&Number.isSafeInteger(session.exp)&&
    session.iat<=Math.floor(now()/1000)+30&&session.exp>Math.floor(now()/1000)+30&&session.exp-session.iat===14400&&
    typeof session.nonce==='string'&&/^[A-Za-z0-9_-]{22}$/u.test(session.nonce);
  if(!valid())fail();
  const allowed=new Set([PREPARE_PATH,STATUS_PATH,RENEW_PATH].map(path=>scope.origin+path));
  return async(url,init)=>{
    if(!valid()||!allowed.has(url)||init?.method!=='POST'||init.redirect!=='error'||typeof init.body!=='string'||Buffer.byteLength(init.body)>16384)fail();
    const headers=new Headers(init.headers);
    for(const name of ['cookie','authorization','origin','host','forwarded','x-forwarded-host'])if(headers.has(name))fail();
    headers.set('Cookie',gateCookie);
    return fetcher(url,{...init,headers,redirect:'error',credentials:'omit',referrerPolicy:'no-referrer'});
  };
}
