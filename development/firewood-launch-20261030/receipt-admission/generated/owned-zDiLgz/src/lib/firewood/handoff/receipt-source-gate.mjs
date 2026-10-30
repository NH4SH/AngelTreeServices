// Pure/read-only receipt source policy. It cannot claim, finish, cancel,
// repair, send, or reset a saved delivery. Root must install matching native
// source-specific claim protection before enabling Firewood email sending.
import { LIVE_ACCOUNT, LIVE_HANDOFF_CONTRACT, LIVE_HANDOFF_SOURCE, LIVE_HANDOFF_ENVIRONMENT,
 LIVE_TERMS_HASH, LIVE_PAYMENT_POLICY_HASH } from 'file:///Users/noelsierra/Documents/Codex/2026-10-30/firewood-production-install/receipt-admission/generated/owned-zDiLgz/src/lib/firewood/handoff/live-contract.mjs';
import { isLiveFirewoodInvoice } from 'file:///Users/noelsierra/Documents/Codex/2026-10-30/firewood-production-install/receipt-admission/generated/owned-zDiLgz/src/lib/firewood/handoff/live-collector.mjs';
import { exactLiveInvoice, isReleasedFirewoodMode, sameCollectorRelease } from 'file:///Users/noelsierra/Documents/Codex/2026-10-30/firewood-production-install/receipt-admission/generated/owned-zDiLgz/src/lib/firewood/handoff/collector-admission.mjs';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(v);
const denied=code=>Object.freeze({ok:false,managed:true,code});
export function sourceAllowsLiveReceipt(source,invoice){
 return Boolean(source?.managed===true&&source.contract===LIVE_HANDOFF_CONTRACT&&source.source_id===LIVE_HANDOFF_SOURCE
  &&source.environment_id===LIVE_HANDOFF_ENVIRONMENT&&source.account_id===LIVE_ACCOUNT&&source.mode==='live'&&source.livemode===true
  &&source.terms_hash===LIVE_TERMS_HASH&&source.payment_policy_hash===LIVE_PAYMENT_POLICY_HASH&&source.receipt_authority==='crm'
  &&source.sender_enabled===true&&source.invoice_id===invoice.id&&uuid(source.order_id)
  &&invoice.invoice_number==='INV-FW-'+source.order_id.toUpperCase());
}
export function createFirewoodReceiptSourceGate({readSendingContext,readPayment,readInvoice,readCollectorContext,now=Date.now}){
 if([readSendingContext,readPayment,readInvoice,readCollectorContext,now].some(fn=>typeof fn!=='function'))throw Error('receipt_gate_dependencies_invalid');
 const tickets=new WeakMap();
 async function inspect(deliveryId,context){
  if(context?.email_type!=='payment_confirmation')return{ok:true,managed:false};
  // No unverified missing-identity shortcut. Integration must preserve ordinary
  // historical behavior through an actual unmanaged invoice classification.
  if(!uuid(deliveryId)||!uuid(context.payment_id))return denied('receipt_payment_identity_unconfirmed');
  let payment,invoice;try{payment=await readPayment(context.payment_id);if(!payment||payment.id!==context.payment_id||!uuid(payment.invoice_id)
    ||context.invoice_id!=null&&context.invoice_id!==payment.invoice_id)return denied('receipt_payment_identity_unconfirmed');
   invoice=await readInvoice(payment.invoice_id);}catch{return denied('receipt_source_unconfirmed');}
  if(!invoice||invoice.id!==payment.invoice_id)return denied('receipt_invoice_identity_unconfirmed');
  if(!isLiveFirewoodInvoice(invoice))return{ok:true,managed:false};
  if(!exactLiveInvoice(invoice))return denied('receipt_live_invoice_unconfirmed');
  if(payment.status!=='succeeded')return denied('receipt_payment_state_unconfirmed');
  const before=readSendingContext('sending');if(!isReleasedFirewoodMode(before,'sending',now()))return denied('receipt_sending_held');
  let source;try{source=await readCollectorContext(invoice.id);}catch{return denied('receipt_source_unconfirmed');}
  if(!sourceAllowsLiveReceipt(source,invoice))return denied('receipt_source_sender_held');
  const after=readSendingContext('sending');if(!isReleasedFirewoodMode(after,'sending',now())||!sameCollectorRelease(before,after))return denied('receipt_sending_held');
  return{ok:true,managed:true,invoiceId:invoice.id,paymentId:payment.id,release:after};
 }
 return Object.freeze({
  async beforeClaim(deliveryId,context){const result=await inspect(deliveryId,context);if(!result.ok||!result.managed)return Object.freeze(result);
   const ticket=Object.freeze({deliveryId,invoiceId:result.invoiceId,paymentId:result.paymentId});tickets.set(ticket,{...result});
   return Object.freeze({ok:true,managed:true,ticket});},
  async beforeTransport(deliveryId,context,ticket){
   const prior=ticket&&tickets.get(ticket);if(!prior||ticket.deliveryId!==deliveryId||context?.payment_id!==ticket.paymentId
    ||context.invoice_id!=null&&context.invoice_id!==ticket.invoiceId)return denied('receipt_claim_binding_unconfirmed');
   const result=await inspect(deliveryId,context);if(!result.ok||!result.managed||result.invoiceId!==ticket.invoiceId||result.paymentId!==ticket.paymentId
    ||!sameCollectorRelease(prior.release,result.release))return denied('receipt_sending_held');
   return Object.freeze({ok:true,managed:true});
  },
 });
}
