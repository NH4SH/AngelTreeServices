import{createCipheriv,createDecipheriv,createHash,randomBytes,timingSafeEqual}from'node:crypto';
import{FirewoodHandoffError,HANDOFF_CONTRACT,HANDOFF_SOURCE,SANDBOX_ACCOUNT,PREPARE_PATH,STATUS_PATH,RENEW_PATH,parsePrepareRequest,parseStatusRequest,parseRenewRequest,signHandoff,validatePrepareReceipt}from'./contract.mjs';
import{reduceSettlement}from'./settlement.mjs';
import{FIREWOOD_STAGING}from'./staging-profile.mjs';
const digest=v=>createHash('sha256').update(v).digest('hex');
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer',...(status===503?{'Retry-After':'5'}:{})}});
export function makeCapability(key,now=Date.now()){
 const raw=randomBytes(32).toString('base64url'),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv),encrypted=Buffer.concat([cipher.update(raw,'utf8'),cipher.final()]);
 return{token_hash:digest(raw),token_hint:raw.slice(-6),token_encrypted:['v1',iv.toString('base64url'),encrypted.toString('base64url'),cipher.getAuthTag().toString('base64url')].join('.'),expires_at:new Date(now+30*60000).toISOString()};
}
export function decryptCapability(value,key){const[version,iv,ciphertext,tag]=value.split('.');if(version!=='v1')throw new FirewoodHandoffError('capability_unconfirmed',true);const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'base64url'));decipher.setAuthTag(Buffer.from(tag,'base64url'));const raw=Buffer.concat([decipher.update(Buffer.from(ciphertext,'base64url')),decipher.final()]).toString('utf8');if(!/^[A-Za-z0-9_-]{40,200}$/.test(raw))throw new FirewoodHandoffError('capability_unconfirmed',true);return raw;}
async function rawBody(request){if(request.headers.get('content-type')?.split(';')[0]!=='application/json'||!request.body)throw new FirewoodHandoffError('invalid_request',false,422);const reader=request.body.getReader(),chunks=[];let bytes=0;try{for(;;){const n=await reader.read();if(n.done)break;bytes+=n.value.length;if(bytes>16384){await reader.cancel();throw new FirewoodHandoffError('request_too_large',false,413);}chunks.push(n.value);}}finally{reader.releaseLock();}try{return new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));}catch{throw new FirewoodHandoffError('invalid_request',false,422);}}
export async function handleHandoff(request,{config,db,now=Date.now}){
 try{
  const staging=config.profile==='staging';
  const environment=staging?config.environmentId===FIREWOOD_STAGING.environmentId&&config.portalOrigin===FIREWOOD_STAGING.portalOrigin:(config.profile===undefined||config.profile==='native')&&/^ats_fwhandoff_(home_)?[a-f0-9]{12}$/.test(config.environmentId);
  if(config.enabled!==true||config.accountId!==SANDBOX_ACCOUNT||config.sourceId!==HANDOFF_SOURCE||!environment||!Buffer.isBuffer(config.encryptionKey)||config.encryptionKey.length!==32)throw new FirewoodHandoffError('handoff_unavailable',false,503);
  const url=new URL(request.url),path=url.pathname;
  // Next's native server constructs internal URLs with localhost. Require the
  // original Host to remain the exact configured loopback origin in that case.
  const loopback=url.hostname==='127.0.0.1'||url.hostname==='localhost'&&request.headers.get('host')===new URL(config.portalOrigin).host;
  const hosted=staging&&((url.origin===FIREWOOD_STAGING.portalOrigin&&(!request.headers.has('host')||request.headers.get('host')===new URL(FIREWOOD_STAGING.portalOrigin).host))||(['localhost','127.0.0.1'].includes(url.hostname)&&request.headers.get('host')===new URL(FIREWOOD_STAGING.portalOrigin).host));
  if(request.method!=='POST'||!(staging?hosted:loopback)||url.search||![PREPARE_PATH,STATUS_PATH,RENEW_PATH].includes(path))return json({code:'invalid_request',retryable:false},400);
  const timestamp=request.headers.get('x-ats-timestamp'),signature=request.headers.get('x-ats-signature');
  if(request.headers.get('x-ats-key-id')!==config.keyId||!/^\d{10}$/.test(timestamp??'')||Math.abs(now()/1000-Number(timestamp))>300||!/^v1=[a-f0-9]{64}$/.test(signature??''))return json({code:'unauthorized',retryable:false},401);
  const raw=await rawBody(request),expected=signHandoff(raw,timestamp,config.signingSecret,path);if(!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return json({code:'unauthorized',retryable:false},401);
  let input;try{const parsed=JSON.parse(raw);input=path===PREPARE_PATH?parsePrepareRequest(parsed):path===STATUS_PATH?parseStatusRequest(parsed):parseRenewRequest(parsed);}catch(error){if(error instanceof FirewoodHandoffError)throw error;throw new FirewoodHandoffError('invalid_request',false,422);}
  const scope=await db.call('get_firewood_handoff_context',{p_source:config.sourceId});if(scope?.environment_id!==config.environmentId||scope.account_id!==config.accountId||scope.livemode!==false)throw new FirewoodHandoffError('isolation_unconfirmed',true);
  if(path===PREPARE_PATH||path===RENEW_PATH){
   const capability=makeCapability(config.encryptionKey,now()),data=path===PREPARE_PATH?await db.call('prepare_firewood_handoff',{p_source:config.sourceId,p_request:input,p_capability:capability}):await db.call('renew_firewood_handoff',{p_source:config.sourceId,p_order:input.order_id,p_invoice:input.invoice_id,p_hash:input.snapshot_hash,p_version:input.expected_capability_version,p_capability:capability});
   const {token_encrypted,...receipt}=data??{};if(receipt.payment_execution_ready&&!config.collectorReady){receipt.payment_execution_ready=false;receipt.execution_blockers=["collector_runtime_not_enabled"];}receipt.portal_url=token_encrypted?config.portalOrigin+'/portal/invoice/'+decryptCapability(token_encrypted,config.encryptionKey):null;
   const valid=validatePrepareReceipt(receipt,{...input,order:input.order??{principal_cents:receipt.principal_cents}},{origin:config.portalOrigin});if(path===RENEW_PATH&&valid.invoice_id!==input.invoice_id)throw new FirewoodHandoffError('binding_unconfirmed',true);
   return json(valid,valid.replayed?200:path===PREPARE_PATH?201:200);
  }
  const args={p_source:config.sourceId,p_order:input.order_id,p_invoice:input.invoice_id,p_hash:input.snapshot_hash},ledger=await db.call('read_firewood_handoff',args);
  if(!ledger||!/^[a-f0-9]{64}$/.test(ledger.ledger_hash??''))throw new FirewoodHandoffError('settlement_unconfirmed',true);
  const financial=reduceSettlement({principal:ledger.invoice?.total_cents,invoice:ledger.invoice,payments:ledger.payments,attempts:ledger.attempts,refunds:ledger.refunds,preference:ledger.invoice?.payment_preference,originalPaidEvidence:ledger.original_paid_evidence});
  const result=await db.call('record_firewood_handoff_observation',{...args,p_ledger_hash:ledger.ledger_hash,p_financial:financial});if(!Number.isSafeInteger(result?.observation_revision)||result.observation_revision<1||JSON.stringify(result.financial)!==JSON.stringify(financial)){
   // Native JSONB key order differs. Compare canonical values below instead.
   const {canonicalHandoff}=await import('./contract.mjs');if(!Number.isSafeInteger(result?.observation_revision)||result.observation_revision<1||canonicalHandoff(result.financial)!==canonicalHandoff(financial))throw new FirewoodHandoffError('settlement_unconfirmed',true);
  }
  if(input.known_revision!==null&&input.known_revision>result.observation_revision)throw new FirewoodHandoffError('settlement_version_conflict');
  return json({...input,known_revision:undefined,...financial,observation_revision:result.observation_revision,verification_source:'crm_ledger'});
 }catch(error){const e=error instanceof FirewoodHandoffError?error:new FirewoodHandoffError('handoff_unconfirmed',true);return json({contract:HANDOFF_CONTRACT,code:e.code,retryable:e.retryable,payment_retry_required:false},e.httpStatus);}
}
