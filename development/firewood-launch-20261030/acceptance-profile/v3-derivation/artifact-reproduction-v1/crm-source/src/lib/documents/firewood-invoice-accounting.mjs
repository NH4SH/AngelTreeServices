// Pure presentation only. Canonical accounting and real retained principal come
// from the fixed server RPC; neither invoice balance nor a payment page is money evidence.
import { isLiveFirewoodInvoice } from '../firewood/handoff/live-collector.mjs';
import { LIVE_HANDOFF_SOURCE, LIVE_HANDOFF_ENVIRONMENT, LIVE_HANDOFF_CONTRACT, LIVE_ACCOUNT,
  LIVE_TERMS_POLICY, LIVE_TERMS_HASH, LIVE_PAYMENT_POLICY_HASH } from '../firewood/handoff/live-contract.mjs';
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(value);
const cents=value=>Number.isSafeInteger(value)&&value>=0;
const keys=['issued_at','original_principal_cents','raw_balance_due_cents','credited_principal_cents','collectible_balance_cents','credit_id'];
export { isLiveFirewoodInvoice };
export const unconfirmedFirewoodDocument=()=>Object.freeze({kind:'unconfirmed',statusLabel:'Balance not confirmed',paidCents:0,creditCents:0,retainedCents:null,balanceDueCents:null,canRequestPayment:false});

export function firewoodInvoiceDocumentAccounting(invoice,context){
  if(!isLiveFirewoodInvoice(invoice))return null;
  try{
    if(!uuid(invoice.id)||invoice.document_terms_version!==LIVE_TERMS_POLICY.version||!cents(invoice.total_cents)||invoice.total_cents===0
      ||context?.managed!==true||context.invoice_id!==invoice.id||!uuid(context.order_id)
      ||invoice.invoice_number!=='INV-FW-'+context.order_id.toUpperCase()
      ||context.source_id!==LIVE_HANDOFF_SOURCE||context.environment_id!==LIVE_HANDOFF_ENVIRONMENT
      ||context.account_id!==LIVE_ACCOUNT||context.contract!==LIVE_HANDOFF_CONTRACT
      ||context.mode!=='test'||context.livemode!==false||context.receipt_authority!=='crm'
      ||context.terms_hash!==LIVE_TERMS_HASH||context.payment_policy_hash!==LIVE_PAYMENT_POLICY_HASH
      ||typeof context.allowed!=='boolean'||typeof context.review_required!=='boolean'
      ||!['active','cancellation_requested','cancelled'].includes(context.order_state))throw Error('binding');
    const a=context.accounting,paid=context.paid_principal_cents;
    if(!a||Array.isArray(a)||Object.keys(a).sort().join('|')!==keys.slice().sort().join('|')
      ||typeof a.issued_at!=='string'||!Number.isFinite(Date.parse(a.issued_at))||!cents(paid)
      ||!['original_principal_cents','raw_balance_due_cents','credited_principal_cents','collectible_balance_cents'].every(k=>cents(a[k]))
      ||a.original_principal_cents!==invoice.total_cents
      ||a.raw_balance_due_cents!==Math.max(0,invoice.total_cents-paid)
      ||a.collectible_balance_cents!==Math.max(0,invoice.total_cents-paid-a.credited_principal_cents)
      ||(a.credit_id===null?a.credited_principal_cents!==0:!uuid(a.credit_id)||a.credited_principal_cents!==invoice.total_cents))throw Error('accounting');
    if(a.credit_id!==null)return Object.freeze({kind:'credited',statusLabel:'Balance credited',paidCents:0,
      creditCents:a.credited_principal_cents,retainedCents:paid,balanceDueCents:a.collectible_balance_cents,canRequestPayment:false});
    const held=context.order_state!=='active'||context.review_required||!context.allowed;
    const fullyPaid=context.order_state==='active'&&!context.review_required&&paid>=invoice.total_cents&&a.collectible_balance_cents===0;
    return Object.freeze({kind:'confirmed',statusLabel:fullyPaid?'Paid':held?'Office review':paid>0?'Partially paid':'Unpaid',
      paidCents:paid,creditCents:0,retainedCents:null,balanceDueCents:a.collectible_balance_cents,
      canRequestPayment:!held&&a.collectible_balance_cents>0});
  }catch{return unconfirmedFirewoodDocument();}
}
