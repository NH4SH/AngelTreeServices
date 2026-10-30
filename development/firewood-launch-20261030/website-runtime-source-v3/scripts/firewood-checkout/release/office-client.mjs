import {assertOfficeClient as fixtureAssert,officeIdentity as fixtureIdentity,makeOfficeDraft as fixtureDraft} from '../office-v2/client.mjs';
import {OFFICE_CONTRACT,OFFICE_BASE_KEYS,OFFICE_PRICE_REQUEST_PATH,OFFICE_PRICE_STATUS_PATH,OFFICE_ORDER_STATUS_PATH,
  officeBinding,parseOfficePriceRequest,parseOfficePriceStatusRequest,parseOfficeOrderStatusRequest,validateOfficePriceReceipt,validateOfficeOrderStatus} from '../office-v2/office-contract.mjs';
import {LIVE_PORTAL_ORIGIN,canonicalLiveHandoff,liveHandoffDigest,priceLiveOrder,FirewoodLiveHandoffError} from '../live/live-contract.mjs';
import {assertProductionTransport} from './transport.mjs';
const clients=new WeakMap();
export function assertOfficeClient(client){return clients.get(client)??fixtureAssert(client,{isolated:true});}
export function officeIdentity(client){const c=clients.get(client);return c?{contract:OFFICE_CONTRACT,binding:officeBinding('00000000-0000-4000-8000-000000000000'),execution:'native-office-v2',keyId:c.keyId}:fixtureIdentity(client);}
export function makeOfficeDraft(id,chosen,client){if(!clients.has(client))return fixtureDraft(id,chosen,client);
  const draft={quantity:chosen.quote.quantity,stacking:chosen.quote.stacking,contact:chosen.contact};return client.parseDraft({...officeBinding(id),draft,draft_hash:liveHandoffDigest(draft)});}
export function createRuntimeOfficeClient({transport,now=Date.now}){
  const context=assertProductionTransport(transport,'office');
  async function exchange(path,input){const response=await transport.handle(new Request(LIVE_PORTAL_ORIGIN+path,{method:'POST',body:canonicalLiveHandoff(input)}));
    if(!response.ok)throw new FirewoodLiveHandoffError(response.status===409?'office_identity_review':'office_response_unconfirmed',response.status>=500||response.status===429,response.status);return response.json();}
  const base=value=>Object.fromEntries(OFFICE_BASE_KEYS.map(k=>[k,value[k]]));
  function price(value,input,previous){const receipt=validateOfficePriceReceipt(value,input);
    if(previous&&(receipt.revision<previous.revision||receipt.revision===previous.revision&&canonicalLiveHandoff(receipt)!==canonicalLiveHandoff(previous)))throw Error('office_price_version_conflict');
    if(receipt.status==='approved'){const approved=receipt.approval,amount=priceLiveOrder(input.draft);
      if(approved.approved_at_ms>now()||Date.parse(approved.expires_at)<=now()||receipt.prices.wood_cents>amount.wood_cents||receipt.prices.stacking_cents>amount.stacking_cents)throw Error('office_price_expired_or_unconfirmed');}
    return receipt;}
  const client=Object.freeze({parseDraft:parseOfficePriceRequest,
    async requestPrice(input,previous=null){const request=parseOfficePriceRequest(input);return price(await exchange(OFFICE_PRICE_REQUEST_PATH,request),request,previous);},
    async priceStatus(input,previous=null){const draft=parseOfficePriceRequest(input),request=parseOfficePriceStatusRequest({...base(draft),draft_hash:draft.draft_hash});return price(await exchange(OFFICE_PRICE_STATUS_PATH,request),draft,previous);},
    async orderStatus(request,prepared,previous=null){const input=parseOfficeOrderStatusRequest({...officeBinding(request.order_id),snapshot_hash:request.snapshot_hash,invoice_id:prepared.invoice_id,known_revision:previous?.observation_revision??null,known_workflow_revision:previous?.workflow_revision??null});
      const receipt=validateOfficeOrderStatus(await exchange(OFFICE_ORDER_STATUS_PATH,input),input,previous);
      if(receipt.totals.invoice_principal_cents!==request.order.principal_cents)throw Error('office_order_principal_conflict');return receipt;},
  });clients.set(client,Object.freeze({isolated:false,keyId:context.keyId}));return client;
}
