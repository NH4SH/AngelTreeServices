import assert from'node:assert/strict';
export async function requestPrimaryRetirement({endpoint,requestToken,fetchImpl=fetch}){
 const url=new URL(endpoint);assert.equal(url.protocol,'https:');assert.match(url.hostname,/^[a-f0-9]{24}--ats-recovery-verifier-lab\.netlify\.app$/);assert.equal(url.pathname,'/.netlify/functions/home-native-backup');assert.equal(url.search,'');assert.match(requestToken,/^[A-Za-z0-9_-]{43,100}$/);url.pathname='/.netlify/functions/home-native-retire-background';
 const r=await fetchImpl(url,{method:'POST',headers:{authorization:'Bearer '+requestToken,'content-type':'application/json'},body:JSON.stringify({operation:'retire'}),redirect:'error',signal:AbortSignal.timeout(10000)});await r.body?.cancel();assert.equal(r.status,202,'Background retirement was not accepted');return{requested:true,writeAdmission:false};
}
