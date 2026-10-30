// Executable Website proposal, pending CRM agreement. Nothing imports this from
// the running runtime; the HTTP client is restricted to isolated loopback tests.
import {createHash,createHmac} from 'node:crypto';
import {policy,policyHash} from './policy.mjs';
import {SANDBOX_ACCOUNT,LIVE_ACCOUNT} from './config.mjs';
import {validateOrder} from '../../model.mjs';
import {CrmCandidateError} from './crm-queue.mjs';

export const CRM_CANDIDATE_CONTRACT='firewood-paid-order-v1';
export const CRM_CANDIDATE_PATH='/api/integrations/firewood/candidate-import';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(v);
const fail=()=>{throw new CrmCandidateError('request_binding_invalid');};
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
  if(v.contract!==CRM_CANDIDATE_CONTRACT||!['sandbox','live'].includes(v.mode)||v.account_id!==(v.mode==='sandbox'?SANDBOX_ACCOUNT:LIVE_ACCOUNT)||
    !/^[a-z][a-z0-9_-]{2,63}$/u.test(v.source_id??'')||!uuid(v.order_id)||v.attempt_id!==v.order_id||
    v.reference!=='FW-'+v.order_id.slice(0,8).toUpperCase()||!(v.mode==='sandbox'?/^cs_test_[A-Za-z0-9_]{8,200}$/u:/^cs_live_[A-Za-z0-9_]{8,200}$/u).test(v.session_id??''))fail();
  const order=normalizeOrder(v.order);
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

export function candidateCrmTestConfig(env){
  const enabled=env.FIREWOOD_CRM_CANDIDATE_TEST_ENABLED;
  if(enabled===undefined||enabled==='0')return null;
  if(enabled!=='1')throw Error('explicit_candidate_crm_test_flag_required');
  const config={origin:env.FIREWOOD_CRM_CANDIDATE_TEST_ORIGIN,sourceId:env.FIREWOOD_CRM_CANDIDATE_SOURCE_ID,
    keyId:env.FIREWOOD_CRM_CANDIDATE_KEY_ID,signingSecret:env.FIREWOOD_CRM_CANDIDATE_SHARED_SECRET,
    mode:env.FIREWOOD_CANDIDATE_MODE,accountId:env.FIREWOOD_CANDIDATE_ACCOUNT};
  validateTestScope(config);return Object.freeze(config);
}
function validateTestScope(config){
  let u;try{u=new URL(config.origin);}catch{throw Error('isolated_candidate_crm_test_scope_required');}
  if(config.mode!=='sandbox'||config.accountId!==SANDBOX_ACCOUNT||u.protocol!=='http:'||u.hostname!=='127.0.0.1'||!u.port||
    u.pathname!=='/'||u.search||u.hash||u.username||u.password||u.origin!==config.origin||
    !/^[a-z][a-z0-9_-]{2,63}$/u.test(config.sourceId??'')||!/^[A-Za-z0-9_-]{1,64}$/u.test(config.keyId??'')||
    typeof config.signingSecret!=='string'||config.signingSecret.length<32||config.signingSecret.length>256||/[^A-Za-z0-9_-]/u.test(config.signingSecret))throw Error('isolated_candidate_crm_test_scope_required');
}
const responseFail=()=>{throw new CrmCandidateError('response_unconfirmed',true);};
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
  if(previous&&['invoice_id','invoice_number','payment_id','payment_intent_id'].some(k=>previous[k]!==v[k]))throw new CrmCandidateError('mapping_review_required');
  return structuredClone(v);
}
export const signCandidateRequest=(raw,timestamp,secret)=>'v1='+createHmac('sha256',secret).update(timestamp+'\nPOST\n'+CRM_CANDIDATE_PATH+'\n'+raw).digest('hex');
async function responseJson(response){
  if(!response.body)responseFail();const reader=response.body.getReader(),chunks=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>32768){await reader.cancel();responseFail();}chunks.push(value);}}
  finally{reader.releaseLock();}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{responseFail();}
}
export function candidateCrmClient(config,fetcher=fetch,now=Date.now){
  validateTestScope(config);
  return {async send(input,previous,intent){
    const request=parseCandidateRequest(input);
    if(request.mode!=='sandbox'||request.account_id!==config.accountId||request.source_id!==config.sourceId||!/@[^@\s]+\.invalid$/iu.test(request.order.contact.email))throw new CrmCandidateError('source_not_allowed');
    const raw=canonicalCandidate(request);if(Buffer.byteLength(raw)>16384)throw new CrmCandidateError('request_too_large');
    const timestamp=String(Math.floor(now()/1000));let response;
    try{response=await fetcher(config.origin+CRM_CANDIDATE_PATH,{method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),
      headers:{'Content-Type':'application/json','X-ATS-Key-Id':config.keyId,'X-ATS-Timestamp':timestamp,'X-ATS-Signature':signCandidateRequest(raw,timestamp,config.signingSecret)},body:raw});}
    catch{throw new CrmCandidateError('connection_unconfirmed',true);}
    if(![200,201].includes(response.status)){
      if([400,401,403,404,409,413,422].includes(response.status))throw new CrmCandidateError('configuration_or_identity_review');
      const after=response.headers.get('retry-after'),delay=/^\d{1,6}$/u.test(after??'')?Math.min(Number(after)*1000,300000):5000;
      throw new CrmCandidateError('connection_unconfirmed',true,delay);
    }
    try{return validateCandidateReceipt(await responseJson(response),request,previous,intent);}
    catch(error){if(error instanceof CrmCandidateError)throw error;throw new CrmCandidateError('response_unconfirmed',true);}
  }};
}
