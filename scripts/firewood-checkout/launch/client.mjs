import {HANDOFF_CONTRACT,HANDOFF_SOURCE,SANDBOX_ACCOUNT,PAYMENT_POLICY,PREPARE_PATH,STATUS_PATH,RENEW_PATH,
  canonicalHandoff,handoffDigest,parsePrepareRequest,parseStatusRequest,parseRenewRequest,signHandoff,validatePrepareReceipt,FirewoodHandoffError} from './contract.mjs';
import {validateSettlement} from './settlement.mjs';
import {handoffStagingScope} from './staging-profile.mjs';
import {stagingGateTransport} from './staging-access.mjs';

const fail=(code,retryable=false)=>{throw new FirewoodHandoffError(code,retryable);};
export function handoffTestScope(value){
  if(value?.testOnly!==true||(value.profile!==undefined&&value.profile!=='native')||value.account!==SANDBOX_ACCOUNT||value.source!==HANDOFF_SOURCE||
    !/^[A-Za-z0-9_-]{1,64}$/u.test(value.keyId??'')||!/^[a-f0-9]{64}$/u.test(value.secret??''))fail('isolated_handoff_scope_required');
  for(const key of ['origin','portalOrigin']){
    let u;try{u=new URL(value[key]);}catch{fail('isolated_handoff_scope_required');}
    if(u.origin!==value[key]||u.protocol!=='http:'||u.hostname!=='127.0.0.1'||!u.port||u.username||u.password)fail('isolated_handoff_scope_required');
  }
  return Object.freeze({...value});
}
export function prepareOrderBinding(row){
  const q=row.quote;if(!q||q.officeApproved===true&&!q.officeApproval||q.officeApproved!==true&&q.officeApproval)fail('order_approval_invalid');
  const contact={...row.contact,email:row.contact.email.trim().toLowerCase(),phone:row.contact.phone.replace(/\D/gu,'').slice(-10)};
  const order={quantity:q.quantity,stacking:q.stacking,wood_cents:q.woodCents,delivery_cents:q.deliveryCents,stacking_cents:q.stackingCents,
    principal_cents:q.totalCents,currency:q.currency,tax_cents:0,tax_basis:'va_domestic_use_locality_exempt',terms:row.terms,
    accepted_at_ms:Number(row.created_at),office_approval:q.officeApproval??null,contact,payment_policy:PAYMENT_POLICY};
  return parsePrepareRequest({contract:HANDOFF_CONTRACT,source_id:HANDOFF_SOURCE,account_id:SANDBOX_ACCOUNT,mode:'sandbox',
    order_id:row.id,reference:row.number,snapshot_hash:handoffDigest(order),order});
}
export function handoffClient(input,{fetcher=fetch,now=Date.now}={}){
  return boundClient(handoffTestScope(input),{fetcher,now});
}
export function handoffStagingClient(input,{fetcher=fetch,now=Date.now,gateCookie}={}){
  const scope=handoffStagingScope(input);
  return boundClient(scope,{fetcher:gateCookie===undefined?fetcher:stagingGateTransport(scope,{gateCookie,fetcher,now}),now});
}
export function handoffEnvironmentScope(input){
  return input?.profile==='staging'?handoffStagingScope(input):handoffTestScope(input);
}
function boundClient(scope,{fetcher,now}){
  async function send(path,request){
    const raw=canonicalHandoff(request);if(Buffer.byteLength(raw)>16384)fail('handoff_request_too_large');
    const timestamp=String(Math.floor(now()/1000));let response;
    try{response=await fetcher(scope.origin+path,{method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),
      headers:{'Content-Type':'application/json','X-ATS-Key-Id':scope.keyId,'X-ATS-Timestamp':timestamp,'X-ATS-Signature':signHandoff(raw,timestamp,scope.secret,path)},body:raw});}
    catch(e){if(e instanceof FirewoodHandoffError&&e.code==='staging_access_review')fail('handoff_authorization_review');fail('handoff_connection_unconfirmed',true);}
    if(!response.ok)fail([401,403].includes(response.status)?'handoff_authorization_review':response.status===409?'handoff_identity_review':'handoff_response_unconfirmed',response.status===429||response.status>=500);
    let text='';try{
      if(response.body?.getReader){const reader=response.body.getReader();let bytes=0;const parts=[];
        try{for(;;){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;if(bytes>65536){await reader.cancel();fail('handoff_response_unconfirmed',true);}parts.push(Buffer.from(next.value));}text=Buffer.concat(parts).toString('utf8');}finally{reader.releaseLock();}}
      else{text=await response.text();if(Buffer.byteLength(text)>65536)fail('handoff_response_unconfirmed',true);}
      return JSON.parse(text);
    }catch{fail('handoff_response_unconfirmed',true);}
  }
  const binding=request=>Object.fromEntries(['contract','source_id','account_id','mode','order_id','reference','snapshot_hash'].map(k=>[k,request[k]]));
  return {
    scope,
    async prepare(value){const request=parsePrepareRequest(value);return validatePrepareReceipt(await send(PREPARE_PATH,request),request,{origin:scope.portalOrigin});},
    async renew(request,receipt){
      const value=parseRenewRequest({...binding(request),invoice_id:receipt.invoice_id,expected_capability_version:receipt.capability_version});
      const renewed=validatePrepareReceipt(await send(RENEW_PATH,value),request,{origin:scope.portalOrigin});
      if(renewed.invoice_id!==receipt.invoice_id||renewed.capability_version<receipt.capability_version)fail('handoff_identity_review');
      return renewed;
    },
    async status(request,receipt,previous=null){
      const value=parseStatusRequest({...binding(request),invoice_id:receipt.invoice_id,known_revision:previous?.observation_revision??null});
      return validateSettlement(await send(STATUS_PATH,value),request,receipt,previous);
    }
  };
}
