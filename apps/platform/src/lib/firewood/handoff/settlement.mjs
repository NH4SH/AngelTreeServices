// Complete ledger snapshot reducer. Does not mutate invoices/payments or call a provider.
import{FirewoodHandoffError}from'./contract.mjs';
const integer=v=>Number.isSafeInteger(v)&&v>=0, knownDisputes=new Set(['warning_needs_response','warning_under_review','warning_closed','needs_response','under_review','won','lost']);
const fail=()=>{throw new FirewoodHandoffError('settlement_unconfirmed',true);};
export function reduceSettlement({principal,invoice,payments,attempts,refunds,preference,originalPaidEvidence=null}){
 if(!integer(principal)||principal<1||!invoice||invoice.total_cents!==principal||!Array.isArray(payments)||!Array.isArray(attempts)||!Array.isArray(refunds)||refunds.length>1000||!['draft','sent','paid','partially_paid','overdue','void'].includes(invoice.status))fail();
 const totals={invoice_principal_cents:principal,paid_principal_cents:0,surcharge_collected_cents:0,gross_collected_cents:0,refunded_principal_cents:0,refunded_surcharge_cents:0,gross_refunded_cents:0,balance_due_cents:principal};let anyDispute=false,hadFailure=false;
 const seen=new Set();for(const p of payments){if(!p||typeof p.id!=='string'||seen.has(p.id)||!['pending','succeeded','failed','cancelled','refunded'].includes(p.status)||p.currency!=='usd'||!['amount_cents','surcharge_cents','total_collected_cents','refunded_principal_cents','refunded_surcharge_cents','disputed_principal_cents','disputed_surcharge_cents','disputed_gross_cents'].every(k=>integer(p[k]))||p.total_collected_cents!==p.amount_cents+p.surcharge_cents||p.refunded_principal_cents>p.amount_cents||p.refunded_surcharge_cents>p.surcharge_cents||!(p.dispute_status===null||knownDisputes.has(p.dispute_status)))fail();seen.add(p.id);
  const historicallyCollected=['succeeded','refunded'].includes(p.status)||p.succeeded_at!==null&&Number.isFinite(Date.parse(p.succeeded_at));
  if(historicallyCollected){totals.gross_collected_cents+=p.total_collected_cents;totals.surcharge_collected_cents+=p.surcharge_cents;totals.refunded_principal_cents+=p.refunded_principal_cents;totals.refunded_surcharge_cents+=p.refunded_surcharge_cents;}
  if(p.status==='succeeded')totals.paid_principal_cents+=Math.max(0,p.amount_cents-p.refunded_principal_cents-(p.dispute_status==='lost'?p.disputed_principal_cents:0));
  if(p.dispute_status!==null)anyDispute=true;if(p.status==='failed')hadFailure=true;
 }
 // Pending refunds are not returned money, but must stop delivery. Include the
 // private, complete refund snapshot in the same observation fence as payments.
 const refundIds=new Set(),refundExposure=new Map(),paymentsById=new Map(payments.map(p=>[p.id,p]));let refundPending=false;
 for(const r of refunds){
  const p=paymentsById.get(r?.payment_id);
  if(!r||typeof r.refund_id!=='string'||!/^(re|pyr)_[A-Za-z0-9_]+$/.test(r.refund_id)||refundIds.has(r.refund_id)||!p||r.currency!==p.currency||!integer(r.amount_cents)||r.amount_cents<1||r.amount_cents>p.total_collected_cents||!['pending','requires_action','succeeded','failed','canceled'].includes(r.status))fail();
  refundIds.add(r.refund_id);
  if(['pending','requires_action','succeeded'].includes(r.status)){
   const exposure=(refundExposure.get(p.id)??0)+r.amount_cents;if(!integer(exposure)||exposure>p.total_collected_cents)fail();refundExposure.set(p.id,exposure);
  }
  if(['pending','requires_action'].includes(r.status))refundPending=true;
 }
 if(!Object.values(totals).every(integer)||totals.paid_principal_cents>principal)fail();
 totals.gross_refunded_cents=totals.refunded_principal_cents+totals.refunded_surcharge_cents;totals.balance_due_cents=principal-totals.paid_principal_cents;
 if(invoice.balance_due_cents!==totals.balance_due_cents)fail();
 const active=attempts.filter(a=>['creating','processing'].includes(a.status));
 if(attempts.some(a=>!a||!['creating','open','processing','completed','expired','cancelled','failed'].includes(a.status)||!['card','ach'].includes(a.payment_channel)||!['invoice_principal_cents','surcharge_cents','total_charge_cents'].every(k=>integer(a[k]))||a.total_charge_cents!==a.invoice_principal_cents+a.surcharge_cents))fail();
 if(active.length>1)fail();const pending=refundPending||active.length>0||payments.some(p=>p.status==='pending');
 const refunded=totals.refunded_principal_cents>0||totals.refunded_surcharge_cents>0;
 const review=refundPending||anyDispute||refunded||originalPaidEvidence!==null&&hadFailure;
 const offline=['cash_check_pickup','check_mail'].includes(preference)&&totals.paid_principal_cents===0&&!pending;
 const payment_state=invoice.status==='void'?'void':anyDispute?'disputed':refunded?(totals.paid_principal_cents===0?'refunded':'partially_refunded'):pending?'processing':totals.balance_due_cents===0?'paid':totals.paid_principal_cents>0?'partially_paid':offline?'offline_pending':hadFailure||attempts.some(a=>a.status==='failed')?'failed':'unpaid';
 return{payment_state,totals,payment_preference:preference??null,payment_pending:pending,review_required:review,original_paid_evidence:originalPaidEvidence,payment_retry_required:false,receipt_authority:'crm',order_confirmation_authority:'website',delivery_completed:false,fulfillment_ready:payment_state==='paid'&&!pending&&!review&&originalPaidEvidence!==null};
}
