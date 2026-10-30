// Isolated SANDBOX contract. No live keys, generic environment or Website runtime imports.
import {createHash,createHmac} from 'node:crypto';
import {FirewoodImportError} from './import-contract.ts';
export const SANDBOX_ACCOUNT='acct_1UU9U8RAZXGe6tX0';
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

export const CRM_CANDIDATE_CONTRACT='firewood-paid-order-v1';
export const CRM_CANDIDATE_PATH='/api/integrations/firewood/candidate-import';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(v);
const fail=()=>{throw new FirewoodImportError('request_binding_invalid',false,422);};
const exact=(v,keys)=>{if(!object(v)||Object.keys(v).sort().join('|')!==[...keys].sort().join('|'))fail();};
const integer=v=>Number.isSafeInteger(v)&&v>=0;
export function canonicalCandidate(v){
  if(Array.isArray(v))return '['+v.map(canonicalCandidate).join(',')+']';
  if(object(v))return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonicalCandidate(v[k])).join(',')+'}';
  if(v===null||typeof v==='string'||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v))return JSON.stringify(v);
  fail();
}
export const candidateDigest=v=>createHash('sha256').update(canonicalCandidate(v)).digest('hex');
const acceptedTerms=()=>({...policy,hash:policyHash,accepted:true,householdUseConfirmed:true});
const contactKeys=['name','email','phone','address','address2','city','state','postal','notes'];
const orderKeys=['quantity','stacking','wood_cents','delivery_cents','stacking_cents','total_cents','currency','tax_cents','tax_basis','terms','accepted_at_ms','office_approval','contact'];
function normalizeOrder(v){
  exact(v,orderKeys);exact(v.contact,contactKeys);if(!contactKeys.every(k=>typeof v.contact[k]==='string'))fail();
  let checked;try{checked=validateOrder({...v.contact,quantity:v.quantity,stacking:v.stacking});}catch{fail();}
  const base=checked.quote,contact={...checked.contact,email:checked.contact.email.toLowerCase(),phone:checked.contact.phone.replace(/\D/gu,'').slice(-10)};
  if(!integer(v.wood_cents)||v.wood_cents<1||!integer(v.stacking_cents)||v.delivery_cents!==0||v.tax_cents!==0||
    v.tax_basis!=='va_domestic_use_locality_exempt'||v.currency!=='usd'||v.total_cents!==v.wood_cents+v.stacking_cents||
    !Number.isSafeInteger(v.accepted_at_ms)||v.accepted_at_ms<1||canonicalCandidate(v.terms)!==canonicalCandidate(acceptedTerms()))fail();
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
const requestKeys=['contract','source_id','account_id','mode','order_id','reference','attempt_id','session_id','snapshot_hash','order'];
export function parseCandidateRequest(v){
  exact(v,requestKeys);
  if(v.contract!==CRM_CANDIDATE_CONTRACT||v.mode!=='sandbox'||v.account_id!==SANDBOX_ACCOUNT||
    !/^[a-z][a-z0-9_-]{2,63}$/u.test(v.source_id??'')||!uuid(v.order_id)||v.attempt_id!==v.order_id||
    v.reference!=='FW-'+v.order_id.slice(0,8).toUpperCase()||!/^cs_test_[A-Za-z0-9_]{8,200}$/u.test(v.session_id??''))fail();
  const order=normalizeOrder(v.order);
  if(!/@[^@\s]+\.invalid$/iu.test(order.contact.email))fail();
  if(v.snapshot_hash!==candidateDigest(order))fail();
  return {...v,order};
}
export function createCandidateBinding(row,scope){
  const q=row.quote;
  if(!q||q.officeApproved===true&&!q.officeApproval||q.officeApproved!==true&&q.officeApproval)fail();
  const order=normalizeOrder({quantity:q.quantity,stacking:q.stacking,wood_cents:q.woodCents,delivery_cents:q.deliveryCents,
    stacking_cents:q.stackingCents,total_cents:q.totalCents,currency:q.currency,tax_cents:0,tax_basis:'va_domestic_use_locality_exempt',
    terms:row.terms,accepted_at_ms:Number(row.created_at),office_approval:q.officeApproval??null,contact:row.contact});
  const binding={contract:CRM_CANDIDATE_CONTRACT,source_id:scope.sourceId,account_id:scope.accountId,mode:scope.mode,
    order_id:row.id,reference:row.number,attempt_id:row.id,snapshot_hash:candidateDigest(order),order};
  parseCandidateRequest({...binding,session_id:scope.mode==='sandbox'?'cs_test_binding_validation':'cs_live_binding_validation'});
  return binding;
}
export const candidateMetadata=binding=>({purpose:'firewood_candidate_v1',order:binding.order_id,policy_hash:policyHash,environment:binding.mode,
  ats_contract:binding.contract,ats_source:binding.source_id,ats_order_id:binding.order_id,ats_snapshot_hash:binding.snapshot_hash,
  ats_attempt_id:binding.attempt_id,quantity:binding.order.quantity,stacking:String(binding.order.stacking)});


export const signCandidateRequest=(raw,timestamp,secret)=>'v1='+createHmac('sha256',secret).update(timestamp+'\nPOST\n'+CRM_CANDIDATE_PATH+'\n'+raw).digest('hex');
const responseFail=()=>{throw new FirewoodImportError('database_unconfirmed',true);};
const receiptKeys=[...requestKeys.filter(k=>k!=='order'),'import_status','payment_intent_id','invoice_id','invoice_number','payment_id','total_cents','currency',
  'invoice_status','balance_due_cents','replayed','original_receipt','notification_authority','crm_customer_email_sent','delivery_completed',
  'payment_retry_required','refund_cents','refund_pending','refund_review_required','dispute_status','review_required','refresh_required'];
export function validateCandidateReceipt(v,request,previous,intent){
  if(!object(v)||Object.keys(v).sort().join('|')!==[...receiptKeys].sort().join('|'))responseFail();
  for(const key of requestKeys.filter(k=>k!=='order'))if(v[key]!==request[key])responseFail();
  const total=request.order.total_cents,disputes=['warning_needs_response','warning_under_review','warning_closed','needs_response','under_review','won','lost'];
  if(v.import_status!=='recorded'||v.payment_intent_id!==intent||!/^pi_[A-Za-z0-9_]+$/u.test(intent??'')||!uuid(v.invoice_id)||!uuid(v.payment_id)||
    (request.mode==='sandbox'?v.invoice_number!=='TEST-FW-'+request.order_id:typeof v.invoice_number!=='string'||!v.invoice_number||v.invoice_number.length>100)||v.total_cents!==total||v.currency!=='usd'||
    !['draft','sent','paid','partially_paid','overdue'].includes(v.invoice_status)||!integer(v.balance_due_cents)||v.balance_due_cents>total||
    typeof v.replayed!=='boolean'||!object(v.original_receipt)||Object.keys(v.original_receipt).sort().join('|')!=='balance_due_cents|paid'||v.original_receipt.paid!==true||v.original_receipt.balance_due_cents!==0||
    v.notification_authority!=='website'||v.crm_customer_email_sent!==false||v.delivery_completed!==false||v.payment_retry_required!==false||
    !integer(v.refund_cents)||v.refund_cents>total||!['refund_pending','refund_review_required','review_required','refresh_required'].every(k=>typeof v[k]==='boolean')||
    !(v.dispute_status===null||disputes.includes(v.dispute_status))||
    v.review_required!==(v.refund_cents>0||v.refund_pending||v.refund_review_required||v.dispute_status!==null)||
    v.refund_pending&&!v.refresh_required||!v.review_required&&(v.invoice_status!=='paid'||v.balance_due_cents!==0))responseFail();
  if(previous&&['invoice_id','invoice_number','payment_id','payment_intent_id'].some(k=>previous[k]!==v[k]))throw new FirewoodImportError('mapping_review_required');
  return structuredClone(v);
}
