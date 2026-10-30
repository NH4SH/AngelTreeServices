// Version2 invoice-before-payment protocol. Runtime activation is sandbox-only.
import{createHash,createHmac}from'node:crypto';
export class FirewoodHandoffError extends Error{constructor(code,retryable=false,httpStatus=retryable?503:409){super(code);this.code=code;this.retryable=retryable;this.httpStatus=httpStatus;}}
export const HANDOFF_CONTRACT='firewood-invoice-handoff-v2';
export const PREPARE_PATH='/api/integrations/firewood/v2/prepare';
export const STATUS_PATH='/api/integrations/firewood/v2/status';
export const RENEW_PATH='/api/integrations/firewood/v2/renew';
export const HANDOFF_SOURCE='website_firewood_invoice_v2';
export const SANDBOX_ACCOUNT='acct_1UU9U8RAZXGe6tX0';
export const PAYMENT_POLICY=Object.freeze({version:'firewood-payment-options-2026-10-29',channels:Object.freeze(['card','ach','cash_check_pickup','check_mail']),credit_surcharge_bps:300,credit_eligibility:'processor_confirmed_US_credit',fee_basis:'outstanding_principal',exact_fee_review_before_confirmation:true,receipt_authority:'crm',accepted:true});
class CheckoutError extends Error {}
const catalog={currency:'usd',quantities:[{id:'half',label:'Half cord',cents:30000,deliveryCents:0},{id:'full',label:'Full cord',cents:45000,deliveryCents:0},{id:'two',label:'Two cords',cents:84000,deliveryCents:0}],stackingCents:15000};
export const policy=Object.freeze({"version":"firewood-20261028-household-v2","currency":"usd","deliveryCents":0,"stackingCents":15000,"maximumCords":2,"notificationDays":7,"cancellationHours":48,"cutoff":"delivery-window-start","unscheduledRefund":"full","angelCancellationRefund":"full","declinedAngelRescheduleRefund":"full","lateCustomerCancellation":"non-refundable","taxBasisPoints":0,"purchaseUse":"personal-household-only","veterans":"Inform Angel before purchase; office-approved price; residential only; one discount.","timezone":"America/New_York"});
export const policyHash="ecf0666b872db0a9a6b588ea25143887d51171a9606cda65d16ae792213a83a5";
function text(value, label, max, required = true) {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b-\u001f\u007f]/u.test(value)) {
    throw new CheckoutError(`Please check ${label}.`);
  }
  const result = value.trim();
  if (required && !result) throw new CheckoutError(`Please enter ${label}.`);
  return result;
}

export function priceOrder(input) {
  const item = catalog.quantities.find(value => value.id === input?.quantity);
  if (!item || typeof input.stacking !== 'boolean') throw new CheckoutError('Choose a cord size and stacking option.');
  if (input.veteran !== undefined && input.veteran !== false) throw new CheckoutError('This checkout no longer accepts discount selections. Reload the checkout and try again.');
  const stackingCents = input.stacking ? catalog.stackingCents : 0;
  return {
    quantity: item.id, label: item.label, stacking: input.stacking,
    woodCents: item.cents, deliveryCents: item.deliveryCents, stackingCents,
    totalCents: item.cents + item.deliveryCents + stackingCents, currency: catalog.currency,
  };
}

export function validateOrder(input) {
  const quote = priceOrder(input);
  function field(name, label, max, required = true) {
    try { return text(input[name] ?? '', label, max, required); }
    catch (error) { error.field = name; throw error; }
  }
  const contact = {
    name: field('name', 'your name', 100),
    email: field('email', 'your email address', 254),
    phone: field('phone', 'your phone number', 30),
    address: field('address', 'the delivery street address', 150),
    address2: field('address2', 'the apartment or unit', 100, false),
    city: field('city', 'the delivery city', 100),
    state: field('state', 'the state abbreviation', 2).toUpperCase(),
    postal: field('postal', 'the ZIP code', 10),
    notes: field('notes', 'the delivery instructions', 500, false),
  };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(contact.email)) throw new CheckoutError('Please enter a valid email address.', 400, 'email');
  if (!/^[+()\d\s.\-]+$/u.test(contact.phone) || !/^1?\d{10}$/u.test(contact.phone.replace(/\D/gu, ''))) {
    throw new CheckoutError('Please enter a 10-digit phone number.', 400, 'phone');
  }
  if (!/^[A-Z]{2}$/u.test(contact.state)) throw new CheckoutError('Please enter a two-letter state abbreviation.', 400, 'state');
  if (!/^\d{5}(?:-\d{4})?$/u.test(contact.postal)) throw new CheckoutError('Please enter a valid ZIP code.', 400, 'postal');
  return { quote, contact };
}

const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(v);
const fail=()=>{throw new FirewoodHandoffError('request_binding_invalid',false,422);};
const exact=(v,keys)=>{if(!object(v)||Object.keys(v).sort().join('|')!==[...keys].sort().join('|'))fail();};
const integer=v=>Number.isSafeInteger(v)&&v>=0;
export function canonicalHandoff(v){
  if(Array.isArray(v))return '['+v.map(canonicalHandoff).join(',')+']';
  if(object(v))return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonicalHandoff(v[k])).join(',')+'}';
  if(v===null||typeof v==='string'||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v))return JSON.stringify(v);
  fail();
}
export const handoffDigest=v=>createHash('sha256').update(canonicalHandoff(v)).digest('hex');
const acceptedTerms=()=>({...policy,hash:policyHash,accepted:true,householdUseConfirmed:true});
const contactKeys=['name','email','phone','address','address2','city','state','postal','notes'];
const orderKeys=['quantity','stacking','wood_cents','delivery_cents','stacking_cents','principal_cents','currency','tax_cents','tax_basis','terms','accepted_at_ms','office_approval','contact','payment_policy'];
function normalizeOrder(v){
  if(canonicalHandoff(v?.payment_policy)!==canonicalHandoff(PAYMENT_POLICY)||v?.contact?.state!=='VA')fail();
  exact(v,orderKeys);exact(v.contact,contactKeys);if(!contactKeys.every(k=>typeof v.contact[k]==='string'))fail();
  let checked;try{checked=validateOrder({...v.contact,quantity:v.quantity,stacking:v.stacking});}catch{fail();}
  const base=checked.quote,contact={...checked.contact,email:checked.contact.email.toLowerCase(),phone:checked.contact.phone.replace(/\D/gu,'').slice(-10)};
  if(!integer(v.wood_cents)||v.wood_cents<1||!integer(v.stacking_cents)||v.delivery_cents!==0||v.tax_cents!==0||
    v.tax_basis!=='va_domestic_use_locality_exempt'||v.currency!=='usd'||v.principal_cents!==v.wood_cents+v.stacking_cents||
    !Number.isSafeInteger(v.accepted_at_ms)||v.accepted_at_ms<1||canonicalHandoff(v.terms)!==canonicalHandoff(acceptedTerms()))fail();
  if(v.office_approval===null){if(v.wood_cents!==base.woodCents||v.stacking_cents!==base.stackingCents)fail();}
  else{
    exact(v.office_approval,['approval_id','approved_at_ms','residential','single_discount_confirmed']);
    const approval=v.office_approval;
    if(!uuid(approval.approval_id)||approval.residential!==true||approval.single_discount_confirmed!==true||
      !Number.isSafeInteger(approval.approved_at_ms)||approval.approved_at_ms<1||approval.approved_at_ms>v.accepted_at_ms||
      v.wood_cents>base.woodCents||v.stacking_cents>base.stackingCents)fail();
  }
  return {...v,contact,terms:acceptedTerms(),office_approval:v.office_approval===null?null:{...v.office_approval}};
}

const bindingKeys=['contract','source_id','account_id','mode','order_id','reference','snapshot_hash'];
function binding(v){if(v.contract!==HANDOFF_CONTRACT||v.source_id!==HANDOFF_SOURCE||v.mode!=='sandbox'||v.account_id!==SANDBOX_ACCOUNT||!uuid(v.order_id)||v.reference!=='FW-'+v.order_id.slice(0,8).toUpperCase()||!/^[a-f0-9]{64}$/u.test(v.snapshot_hash??''))fail();}
export function parsePrepareRequest(v){exact(v,[...bindingKeys,'order']);binding(v);const order=normalizeOrder(v.order);if(!/@[^@\s]+\.invalid$/iu.test(order.contact.email)||order.accepted_at_ms>Date.now()+300000||v.snapshot_hash!==handoffDigest(order))fail();return{...v,order};}
export function parseStatusRequest(v){exact(v,[...bindingKeys,'invoice_id','known_revision']);binding(v);if(!uuid(v.invoice_id)||!(v.known_revision===null||integer(v.known_revision)))fail();return{...v};}
export function parseRenewRequest(v){exact(v,[...bindingKeys,'invoice_id','expected_capability_version']);binding(v);if(!uuid(v.invoice_id)||!integer(v.expected_capability_version)||v.expected_capability_version<1)fail();return{...v};}
export function signHandoff(raw,timestamp,secret,path){if(![PREPARE_PATH,STATUS_PATH,RENEW_PATH].includes(path))fail();return 'v1='+createHmac('sha256',secret).update(timestamp+'\nPOST\n'+path+'\n'+raw).digest('hex');}
export function makePrepareFixture({orderId='c5c08217-5112-4765-98c7-8b29a4d00002',acceptedAt=Date.now()-1000,quantity='full',stacking=true}={}){
 const wood={half:30000,full:45000,two:84000}[quantity];const order={quantity,stacking,wood_cents:wood,delivery_cents:0,stacking_cents:stacking?15000:0,principal_cents:wood+(stacking?15000:0),currency:'usd',tax_cents:0,tax_basis:'va_domestic_use_locality_exempt',terms:acceptedTerms(),payment_policy:PAYMENT_POLICY,accepted_at_ms:acceptedAt,office_approval:null,contact:{name:'Synthetic Firewood V2',email:'firewood-v2@example.invalid',phone:'2025550182',address:'123 Synthetic Lane',address2:'',city:'Fredericksburg',state:'VA',postal:'22407',notes:'Synthetic v2 test only'}};
 return parsePrepareRequest({contract:HANDOFF_CONTRACT,source_id:HANDOFF_SOURCE,account_id:SANDBOX_ACCOUNT,mode:'sandbox',order_id:orderId,reference:'FW-'+orderId.slice(0,8).toUpperCase(),snapshot_hash:handoffDigest(order),order});
}
export const HANDOFF_RESPONSE_BINDING_KEYS=Object.freeze([...bindingKeys,'invoice_id','invoice_number']);
export function validatePrepareReceipt(v,input,{origin}={}){
 if(!object(v))throw new FirewoodHandoffError('preparation_unconfirmed',true);
 for(const k of bindingKeys)if(v[k]!==input[k])throw new FirewoodHandoffError('preparation_unconfirmed',true);
 if(!uuid(v.invoice_id)||typeof v.invoice_number!=='string'||v.invoice_number!=='TEST-FW2-'+input.order_id||v.principal_cents!==input.order.principal_cents||v.preparation_status!=='prepared'||typeof v.replayed!=='boolean'||!integer(v.capability_version)||v.capability_version<1||v.receipt_authority!=='crm'||v.order_confirmation_authority!=='website'||v.payment_retry_required!==false||v.delivery_completed!==false||typeof v.payment_execution_ready!=='boolean'||!Array.isArray(v.execution_blockers)||(v.payment_execution_ready?v.execution_blockers.length!==0:v.execution_blockers.length===0))throw new FirewoodHandoffError('preparation_unconfirmed',true);
 if(v.portal_url!==null){let u;try{u=new URL(v.portal_url);}catch{throw new FirewoodHandoffError('capability_unconfirmed',true);}if(!origin||u.origin!==origin||!/^\/portal\/invoice\/[A-Za-z0-9_-]{40,200}$/u.test(u.pathname)||u.search||u.hash||u.username||u.password||!Number.isFinite(Date.parse(v.expires_at)))throw new FirewoodHandoffError('capability_unconfirmed',true);}
 return structuredClone(v);
}
export function validateStatusReceipt(v,input,previous=null){
 const reject=()=>{throw new FirewoodHandoffError('settlement_unconfirmed',true);};
 if(!object(v))reject();for(const k of bindingKeys)if(v[k]!==input[k])reject();
 const moneyKeys=['invoice_principal_cents','paid_principal_cents','surcharge_collected_cents','gross_collected_cents','refunded_principal_cents','refunded_surcharge_cents','gross_refunded_cents','balance_due_cents'];
 if(v.invoice_id!==input.invoice_id||!uuid(v.invoice_id)||!integer(v.observation_revision)||v.observation_revision<1||!['unpaid','processing','paid','partially_paid','partially_refunded','refunded','disputed','offline_pending','failed','void'].includes(v.payment_state)||!object(v.totals)||Object.keys(v.totals).sort().join('|')!==[...moneyKeys].sort().join('|')||!moneyKeys.every(k=>integer(v.totals[k]))||v.receipt_authority!=='crm'||v.order_confirmation_authority!=='website'||v.payment_retry_required!==false||v.delivery_completed!==false||!['payment_pending','review_required','fulfillment_ready'].every(k=>typeof v[k]==='boolean')||v.verification_source!=='crm_ledger'||!(v.payment_preference===null||PAYMENT_POLICY.channels.includes(v.payment_preference)))reject();
 const t=v.totals;
 if(t.invoice_principal_cents<1||t.paid_principal_cents>t.invoice_principal_cents||t.balance_due_cents!==t.invoice_principal_cents-t.paid_principal_cents||t.gross_collected_cents<t.surcharge_collected_cents||t.refunded_surcharge_cents>t.surcharge_collected_cents||t.refunded_principal_cents>t.gross_collected_cents-t.surcharge_collected_cents||t.gross_refunded_cents!==t.refunded_principal_cents+t.refunded_surcharge_cents)reject();
 const original=v.original_paid_evidence;
 if(original!==null){
  if(!object(original)||original.paid!==true||!Number.isFinite(Date.parse(original.observed_at))||original.principal_cents!==t.invoice_principal_cents||!integer(original.surcharge_collected_cents)||original.gross_collected_cents!==original.principal_cents+original.surcharge_collected_cents||!Array.isArray(original.payment_ids)||original.payment_ids.length<1||!original.payment_ids.every(uuid)||new Set(original.payment_ids).size!==original.payment_ids.length)reject();
 }
 const fulfilled=v.payment_state==='paid'&&t.balance_due_cents===0&&!v.payment_pending&&!v.review_required&&original!==null;
 if(v.fulfillment_ready!==fulfilled||v.payment_state==='paid'&&(t.balance_due_cents!==0||v.payment_pending||v.review_required))reject();
 if(previous){
  if(v.invoice_id!==previous.invoice_id||v.snapshot_hash!==previous.snapshot_hash||v.observation_revision<previous.observation_revision||t.invoice_principal_cents!==previous.totals?.invoice_principal_cents||previous.original_paid_evidence!==null&&canonicalHandoff(original)!==canonicalHandoff(previous.original_paid_evidence)||v.observation_revision===previous.observation_revision&&canonicalHandoff(v)!==canonicalHandoff(previous))throw new FirewoodHandoffError('settlement_version_conflict');
 }
 return structuredClone(v);
}
