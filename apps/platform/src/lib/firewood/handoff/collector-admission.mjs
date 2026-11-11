// Pure admission logic. Production supplies only its fixed release reader and
// actual private-key fingerprint. This module never reads environment or keys,
// connects a provider/database, or installs a runtime factory.
import { createHash } from 'node:crypto';
import { LIVE_ACCOUNT, LIVE_HANDOFF_CONTRACT, LIVE_HANDOFF_SOURCE, LIVE_HANDOFF_ENVIRONMENT,
  LIVE_TERMS_POLICY, LIVE_TERMS_HASH, LIVE_PAYMENT_POLICY_HASH, LIVE_PORTAL_ORIGIN, LIVE_WEBSITE_ORIGIN } from './live-contract.mjs';
import { isLiveFirewoodInvoice, validateLiveCollectorContext } from './live-collector.mjs';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(v);
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/u.test(v);
const digest=v=>createHash('sha256').update(v,'utf8').digest('hex');
const releaseKeys=['admissionProtocol','primaryInstallationId','namespace','generation','bindingSha256','sourceId','systemIdentifier','sourceBoot','databaseBoot',
  'topologyFingerprint','timeline','authorityPublicKeyFingerprint','installationOverlaySha256','schemaSha256','releaseSha256','signingKeyId','signingKeyFingerprint','stripeKeyFingerprint'];
export const sameCollectorRelease=(a,b)=>Boolean(a&&b&&releaseKeys.every(key=>a[key]===b[key]));
const LOCAL_POLICY='local-primary-operation-v1';
const legacyProofKeys=['authorityPublicKeyFingerprint','backupCaptureStartedAtMs','backupVerifiedAtMs','captureStartedBootMs','backupAgeMs','receiptComponentSha256','receiptSequence','receiptExpiresAtMs'];
const positive=value=>Number.isSafeInteger(value)&&value>0;
function primaryProofMatches(context,nowMs){
 if(context.admissionProtocol!==LOCAL_POLICY)return context.admissionProtocol===undefined
  &&/^ats-home-continuous-[a-f0-9]{12}$/u.test(context.namespace)&&hash(context.authorityPublicKeyFingerprint);
 return /^ats-home-primary-[a-f0-9]{12}$/u.test(context.namespace)
  &&/^[a-f0-9]{32}$/u.test(context.primaryInstallationId)&&context.generation>=12
  &&!legacyProofKeys.some(key=>Object.hasOwn(context,key))
  &&positive(context.operationSequence)&&positive(context.operationObservedAtMs)
  &&context.operationObservedAtMs<=context.observedAtMs
  &&Number.isFinite(context.operationObservedBootMs)&&context.operationObservedBootMs>0
  &&Number.isFinite(context.observedMonotonicMs)&&context.observedMonotonicMs>=context.operationObservedBootMs
  &&Number.isSafeInteger(context.operationAgeMs)&&context.operationAgeMs>=0&&context.operationAgeMs<14000
  &&context.expiresAtMs<=context.operationObservedAtMs+14000
  &&nowMs-context.operationObservedAtMs<14000;
}
// Identity equality stays symmetric. Operation continuity additionally rejects
// a saved or regressed local operation across a business/provider boundary.
export const continuesCollectorRelease=(before,after)=>Boolean(sameCollectorRelease(before,after)
 &&(before.admissionProtocol!==LOCAL_POLICY||positive(before.operationSequence)&&positive(after.operationSequence)
  &&after.operationSequence>=before.operationSequence));
export function isReleasedFirewoodMode(context,mode,nowMs){
 return Boolean(context&&context.mode===mode&&context.modes?.[mode]===true&&context.modes.status===true
  &&context.contract===LIVE_HANDOFF_CONTRACT&&context.source===LIVE_HANDOFF_SOURCE&&context.environment===LIVE_HANDOFF_ENVIRONMENT
  &&context.account===LIVE_ACCOUNT&&context.portalOrigin===LIVE_PORTAL_ORIGIN&&context.websiteOrigin===LIVE_WEBSITE_ORIGIN
  &&context.termsHash===LIVE_TERMS_HASH&&context.paymentPolicyHash===LIVE_PAYMENT_POLICY_HASH
  &&Number.isSafeInteger(context.generation)&&context.generation>3&&context.namespace!=='ats-home-continuous-7445a45dddd9'
  &&typeof context.namespace==='string'&&primaryProofMatches(context,nowMs)
  &&hash(context.bindingSha256)&&hash(context.installationOverlaySha256)&&hash(context.schemaSha256)&&hash(context.releaseSha256)
  &&Number.isSafeInteger(context.expiresAtMs)&&context.expiresAtMs>nowMs
  &&Number.isSafeInteger(context.observedAtMs)&&context.observedAtMs<=nowMs&&nowMs-context.observedAtMs<=1000);
}
export function collectionKeyMatches(context,key){
 const value=typeof key==='string'?key.trim():'';
 return /^rk_live_[A-Za-z0-9]+$/u.test(value)&&hash(context?.stripeKeyFingerprint)&&digest(value)===context.stripeKeyFingerprint;
}
export function exactLiveInvoice(invoice){
 return Boolean(uuid(invoice?.id)&&invoice.document_terms_version===LIVE_TERMS_POLICY.version
  &&typeof invoice.invoice_number==='string'&&/^INV-FW-[A-F0-9]{8}(?:-[A-F0-9]{4}){3}-[A-F0-9]{12}$/u.test(invoice.invoice_number));
}
export function looksLiveCollectorPolicy(policy){
 return Boolean(policy&&(policy.profile==='firewood-live-v1'||policy.mode==='live'||policy.accountId===LIVE_ACCOUNT||policy.sourceId===LIVE_HANDOFF_SOURCE));
}
export function createLiveCollectorAdmission({readContext,readKey,readCollectorContext,now=Date.now}){
 if(typeof readContext!=='function'||typeof readKey!=='function'||typeof readCollectorContext!=='function'||typeof now!=='function')throw Error('collector_admission_dependencies_invalid');
 const minted=new WeakMap();
 const fresh=()=>{const context=readContext('collection');return isReleasedFirewoodMode(context,'collection',now())&&collectionKeyMatches(context,readKey())?context:null;};
 async function inspect(db,invoice,livemode,previous=null,clientFingerprint=null){
  if(livemode!==true||!exactLiveInvoice(invoice)||!isLiveFirewoodInvoice(invoice))return null;
  const before=fresh();if(!before||previous&&!continuesCollectorRelease(previous,before)
   ||clientFingerprint!==null&&clientFingerprint!==before.stripeKeyFingerprint)return null;
  let native;try{native=await readCollectorContext(db,invoice.id);}catch{return null;}
  let policy;try{policy=validateLiveCollectorContext(native,invoice.id);}catch{return null;}
  if(invoice.invoice_number!=='INV-FW-'+policy.orderId.toUpperCase())return null;
  const after=fresh();if(!after||!continuesCollectorRelease(before,after)||previous&&!continuesCollectorRelease(previous,after)
   ||clientFingerprint!==null&&clientFingerprint!==after.stripeKeyFingerprint)return null;
  return{policy,context:after};
 }
 return Object.freeze({
  async mint(db,invoice,livemode){const found=await inspect(db,invoice,livemode);if(!found)return null;
   const policy=Object.freeze({...found.policy});minted.set(policy,{invoice:Object.freeze({...invoice}),context:found.context});return policy;},
  isMinted(policy){return Boolean(policy&&minted.has(policy));},
  async revalidate(policy,db,invoiceId,livemode,clientFingerprint){
   const original=policy&&minted.get(policy);if(!original||original.invoice.id!==invoiceId||!hash(clientFingerprint))return false;
   const found=await inspect(db,original.invoice,livemode,original.context,clientFingerprint);
   return Boolean(found&&found.policy.orderId===policy.orderId&&found.policy.sourceId===policy.sourceId&&found.policy.accountId===policy.accountId);
  },
 });
}
