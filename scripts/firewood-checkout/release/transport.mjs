// Production-only CRM channel. Sandbox uses its own reviewed contract/channel;
// no account/contract alias or fallback can be selected by a customer request.
import { LIVE_PORTAL_ORIGIN, LIVE_PREPARE_PATH, LIVE_RENEW_PATH, canonicalLiveHandoff,
  parseLivePrepareRequest, parseLiveRenewRequest, signLiveHandoff } from '../live/live-contract.mjs';
import { OFFICE_PRICE_REQUEST_PATH, OFFICE_PRICE_STATUS_PATH, OFFICE_ORDER_STATUS_PATH,
  parseOfficePriceRequest, parseOfficePriceStatusRequest, parseOfficeOrderStatusRequest, signOfficeRequest } from '../office-v2/office-contract.mjs';
const transports = new WeakMap();
const parsers = new Map([[LIVE_PREPARE_PATH,parseLivePrepareRequest],[LIVE_RENEW_PATH,parseLiveRenewRequest],
  [OFFICE_PRICE_REQUEST_PATH,parseOfficePriceRequest],[OFFICE_PRICE_STATUS_PATH,parseOfficePriceStatusRequest],[OFFICE_ORDER_STATUS_PATH,parseOfficeOrderStatusRequest]]);
const livePaths = new Set([LIVE_PREPARE_PATH,LIVE_RENEW_PATH]);
export function assertProductionTransport(value,kind) {
  const scope=transports.get(value);if(!scope||scope.kind!==kind)throw Error('bound_production_transport_required');return scope;
}
export function createProductionTransport({ kind,keyId,secret,admitted,now=Date.now,fetcher=fetch,timeoutMs=12000 }) {
  if(!['live','office'].includes(kind)||!/^[A-Za-z0-9_-]{8,128}$/u.test(keyId??'')||!/^[A-Za-z0-9_-]{32,256}$/u.test(secret??'')
    ||typeof admitted!=='function'||typeof now!=='function'||typeof fetcher!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<10||timeoutMs>12000)
    throw Error('bound_production_transport_required');
  const transport=Object.freeze({async handle(request) {
    const url=new URL(request.url),parse=parsers.get(url.pathname);
    if(request.method!=='POST'||url.origin!==LIVE_PORTAL_ORIGIN||url.username||url.password||url.search||url.hash||!parse
      ||livePaths.has(url.pathname)!==(kind==='live'))throw Error('fixed_crm_operation_required');
    const raw=await request.text();if(Buffer.byteLength(raw)>16384)throw Error('bounded_crm_request_required');
    let value;try{value=parse(JSON.parse(raw));}catch{throw Error('canonical_production_request_required');}
    if(canonicalLiveHandoff(value)!==raw)throw Error('canonical_production_request_required');
    const admissionMode=kind==='office'?'office':url.pathname===LIVE_PREPARE_PATH?'preparation':'collection';
    if(!await admitted(admissionMode))throw Error('crm_admission_pending');
    const timestamp=String(Math.floor(now()/1000)),sign=kind==='live'?signLiveHandoff:signOfficeRequest;
    const controller=new AbortController();let timer,reader;
    const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('bounded_crm_exchange'));},timeoutMs);});
    try{
      const response=await Promise.race([fetcher(url.href,{method:'POST',redirect:'error',signal:controller.signal,
        headers:{'Content-Type':'application/json','X-ATS-Key-Id':keyId,'X-ATS-Timestamp':timestamp,'X-ATS-Signature':sign(raw,timestamp,secret,url.pathname)},body:raw}),deadline]);
      if(!(response instanceof Response))throw Error('unverified_crm_response');
      if(!response.ok)return Response.json({code:'crm_exchange_unconfirmed'},{status:[400,401,403,409,422,429,503].includes(response.status)?response.status:503});
      reader=response.body?.getReader();if(!reader)throw Error('unverified_crm_response');
      const chunks=[];let bytes=0;
      for(;;){const item=await Promise.race([reader.read(),deadline]);if(item.done)break;bytes+=item.value.byteLength;
        if(bytes>65536)throw Error('unverified_crm_response');chunks.push(Buffer.from(item.value));}
      const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
      return Response.json(body,{headers:{'Cache-Control':'no-store'}});
    }catch{throw Error('crm_exchange_unconfirmed');}
    finally{clearTimeout(timer);controller.abort();if(reader){void reader.cancel().catch(()=>{});reader.releaseLock();}}
  }});
  transports.set(transport,Object.freeze({kind,keyId,origin:LIVE_PORTAL_ORIGIN,profile:'production-live'}));return transport;
}
