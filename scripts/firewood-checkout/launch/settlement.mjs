import {validateStatusReceipt,canonicalHandoff,FirewoodHandoffError} from './contract.mjs';
const fail=()=>{throw new FirewoodHandoffError('settlement_unconfirmed',true);};
export function validateSettlement(value,request,prepared,previous=null){
  const keys=['contract','source_id','account_id','mode','order_id','reference','snapshot_hash'];
  const status={...Object.fromEntries(keys.map(k=>[k,request[k]])),invoice_id:prepared.invoice_id,known_revision:previous?.observation_revision??null};
  const v=validateStatusReceipt(value,status,previous),t=v.totals;
  const fields=['invoice_principal_cents','paid_principal_cents','surcharge_collected_cents','gross_collected_cents','refunded_principal_cents','refunded_surcharge_cents','gross_refunded_cents','balance_due_cents'];
  if(Object.keys(t).sort().join('|')!==fields.sort().join('|')||!fields.every(k=>Number.isSafeInteger(t[k])&&t[k]>=0)||
    t.invoice_principal_cents!==request.order.principal_cents||t.paid_principal_cents>t.invoice_principal_cents||
    t.balance_due_cents!==t.invoice_principal_cents-t.paid_principal_cents||t.gross_refunded_cents!==t.refunded_principal_cents+t.refunded_surcharge_cents||
    t.surcharge_collected_cents>t.gross_collected_cents||t.refunded_surcharge_cents>t.surcharge_collected_cents||
    t.refunded_principal_cents>t.gross_collected_cents-t.surcharge_collected_cents||t.gross_refunded_cents>t.gross_collected_cents||
    !['card','ach','cash_check_pickup','check_mail',null].includes(v.payment_preference)||
    typeof v.payment_pending!=='boolean'||typeof v.review_required!=='boolean'||v.verification_source!=='crm_ledger')fail();
  if(v.original_paid_evidence!==null&&(typeof v.original_paid_evidence!=='object'||Array.isArray(v.original_paid_evidence)))fail();
  if(previous?.original_paid_evidence!==null&&previous?.original_paid_evidence!==undefined&&canonicalHandoff(previous.original_paid_evidence)!==canonicalHandoff(v.original_paid_evidence))fail();
  if(v.fulfillment_ready&&(v.payment_state!=='paid'||v.payment_pending||v.review_required||t.balance_due_cents!==0||!v.original_paid_evidence))fail();
  if(v.payment_state==='paid'&&t.balance_due_cents!==0||v.payment_state==='processing'&&!v.payment_pending||
    v.payment_state==='offline_pending'&&(v.payment_pending||t.paid_principal_cents!==0||!['cash_check_pickup','check_mail'].includes(v.payment_preference)))fail();
  if(previous&&v.observation_revision===previous.observation_revision&&canonicalHandoff(v)!==canonicalHandoff(previous))throw new FirewoodHandoffError('settlement_version_conflict');
  return v;
}
