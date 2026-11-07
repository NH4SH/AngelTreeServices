// Actual production client; frozen fixture constructors remain separate.
import {assertLiveClient as fixtureAssert,liveStoreIdentity as fixtureIdentity,prepareOrderBinding as fixtureBinding} from '../live/client.mjs';
import {LIVE_HANDOFF_CONTRACT,LIVE_HANDOFF_SOURCE,LIVE_HANDOFF_ENVIRONMENT,LIVE_ACCOUNT,LIVE_PORTAL_ORIGIN,LIVE_PREPARE_PATH,LIVE_RENEW_PATH,
  LIVE_BINDING_KEYS,LIVE_ACCEPTED_TERMS,LIVE_PAYMENT_POLICY,parseLivePrepareRequest,parseLiveRenewRequest,normalizeLiveContact,
  validateLivePrepareReceipt,liveHandoffDigest,FirewoodLiveHandoffError,canonicalLiveHandoff as canonical} from '../live/live-contract.mjs';
import {assertProductionTransport} from './transport.mjs';
const clients=new WeakMap();
export function assertLiveClient(client){return clients.get(client)??fixtureAssert(client,{isolated:true});}
export function liveStoreIdentity(client){const c=clients.get(client);return c?{profile:'firewood-live-v1-native-v2',contract:LIVE_HANDOFF_CONTRACT,
  source:LIVE_HANDOFF_SOURCE,environment:LIVE_HANDOFF_ENVIRONMENT,account:LIVE_ACCOUNT,portalOrigin:LIVE_PORTAL_ORIGIN,
  termsHash:client.scope.termsHash,paymentPolicyHash:client.scope.paymentPolicyHash,execution:'native-office-v2',keyId:c.keyId}:fixtureIdentity(client);}
export function prepareOrderBinding(row,client){if(!clients.has(client))return fixtureBinding(row,client);
  const q=row.quote;
  if(!q||q.officeApproved===true&&!q.officeApproval||q.officeApproved!==true&&q.officeApproval)throw Error('live_order_approval_invalid');
  const order={quantity:q.quantity,stacking:q.stacking,wood_cents:q.woodCents,delivery_cents:0,stacking_cents:q.stackingCents,
    principal_cents:q.totalCents,currency:'usd',tax_cents:0,tax_basis:'va_domestic_use_locality_exempt',terms:row.terms,
    accepted_at_ms:Number(row.created_at),office_approval:q.officeApproval??null,contact:normalizeLiveContact(row.contact),payment_policy:LIVE_PAYMENT_POLICY};
  return client.parseRequest({contract:LIVE_HANDOFF_CONTRACT,source_id:LIVE_HANDOFF_SOURCE,environment_id:LIVE_HANDOFF_ENVIRONMENT,
    account_id:LIVE_ACCOUNT,mode:'live',order_id:row.id,reference:row.number,snapshot_hash:liveHandoffDigest(order),order});
}
export function createRuntimeLiveClient({transport,now=Date.now}){
  const context=assertProductionTransport(transport,'live');
  const exchange=async(path,input)=>{const response=await transport.handle(new Request(LIVE_PORTAL_ORIGIN+path,{method:'POST',body:canonical(input)}));
    if(!response.ok)throw new FirewoodLiveHandoffError(response.status===409?'live_handoff_identity_review':'live_handoff_connection_unconfirmed',response.status>=500||response.status===429,response.status);
    return response.json();};
  const client=Object.freeze({scope:Object.freeze({profile:'firewood-live-v1-native-v2',termsHash:LIVE_ACCEPTED_TERMS.hash,paymentPolicyHash:liveHandoffDigest(LIVE_PAYMENT_POLICY)}),
    parseRequest:input=>parseLivePrepareRequest(input,{nowMs:now()}),normalizeContact:contact=>normalizeLiveContact(contact),
    async prepare(input){const request=client.parseRequest(input);return validateLivePrepareReceipt(await exchange(LIVE_PREPARE_PATH,request),request);},
    async renew(request,receipt){const input=parseLiveRenewRequest({...Object.fromEntries(LIVE_BINDING_KEYS.map(k=>[k,request[k]])),invoice_id:receipt.invoice_id,expected_capability_version:receipt.capability_version});
      const value=validateLivePrepareReceipt(await exchange(LIVE_RENEW_PATH,input),request);if(value.invoice_id!==receipt.invoice_id||value.capability_version<receipt.capability_version)throw Error('live_handoff_identity_review');return value;},
    async status(){throw Error('office_accounting_lifecycle_required');},
  });
  clients.set(client,Object.freeze({isolated:false,keyId:context.keyId}));return client;
}
