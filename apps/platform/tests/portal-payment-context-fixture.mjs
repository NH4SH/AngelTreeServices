import assert from 'node:assert/strict';
import {load} from './pr10-test-helpers.mjs';
import {withDeadline} from '../src/lib/runtime/deadline.ts';
import {netSuccessfulPaymentPrincipal} from '../src/lib/payments/payment-accounting.ts';
import {portalPaymentOwnershipIsValid} from '../src/lib/payments/portal-ownership.ts';
import {isCheckoutContractingParty} from '../src/lib/payments/checkout-closure.ts';
export const invoiceId='00000000-0000-4000-8000-000000000001',customerId='00000000-0000-4000-8000-000000000002';
export const organizationId='00000000-0000-4000-8000-000000000003',paymentId='00000000-0000-4000-8000-000000000004';
export const tokenHash='a'.repeat(64);
export const invoiceRow=(changes={})=>({id:invoiceId,customer_id:customerId,organization_id:null,invoice_number:'LOCAL',total_cents:1000,status:'sent',
 customers:{id:customerId,email:'customer@example.invalid'},organizations:null,billing_contact:null,accounts_payable_contact:null,jobs:null,...changes});
export const tokenRow=(changes={})=>({invoice_id:invoiceId,customer_id:customerId,organization_id:null,expires_at:null,revoked_at:null,...changes});
export const paymentRow=(changes={})=>({id:paymentId,invoice_id:invoiceId,status:'succeeded',amount_cents:400,refunded_principal_cents:0,disputed_principal_cents:0,dispute_status:null,...changes});
export function contextFixture(options={}){
 const calls=[],cleanups=[],aborted=[];
 const deadline=options.fastDeadline?(work,ms)=>{assert.equal(ms,5000);return withDeadline(work,10);}:withDeadline;
 const db=options.db??{from(table){
  const call={table,filters:[]};calls.push(call);
  const q={select(columns,selectOptions){call.columns=columns;call.selectOptions=selectOptions;return q;},eq(key,value){call.filters.push([key,'eq',value]);return q;},
   is(key,value){call.filters.push([key,'is',value]);return q;},in(key,value){call.filters.push([key,'in',value]);return q;},limit(value){call.limit=value;return q;},
   abortSignal(signal){signal.addEventListener('abort',()=>aborted.push(table));return q;},single(){return run();},maybeSingle(){return run();},then(resolve,reject){return run().then(resolve,reject);}};
  async function run(){
   if(options.throwAt===table)throw Error('private backend diagnostic');
   if(options.hangAt===table)return new Promise(()=>{});
   if(Object.hasOwn(options.receipts??{},table))return options.receipts[table];
   if(table==='invoices')return{data:invoiceRow(options.invoice),error:null};
   if(table==='invoice_portal_tokens')return{data:tokenRow(options.token),error:null};
   if(table==='payments'){const rows=options.payments??[];return{data:rows,error:null,count:rows.length};}
   assert.equal(table,'invoice_checkout_sessions');return{data:null,error:null};
  }return q;
 }};
 const reconciliation=load('../src/lib/payments/reconciliation.ts',{'server-only':{},'../runtime/deadline.ts':{withDeadline:deadline},
  '@/lib/payments/payment-accounting':{netSuccessfulPaymentPrincipal},'@/lib/communications/queue':{},'@/lib/supabase/admin':{}});
 const context=load('../src/lib/payments/portal-card-context.ts',{'server-only':{},'../runtime/deadline.ts':{withDeadline:deadline},
  '@/lib/data/portal-invoice':{getInvoiceByPortalToken:async()=>{if(options.lookupThrows)throw Error('private lookup diagnostic');if(options.lookupHangs)return new Promise(()=>{});return options.lookup??{status:'ready',invoice:{id:options.expectedId??invoiceId}};}},
  '@/lib/payments/reconciliation':options.balanceHelper??reconciliation,'@/lib/payments/portal-ownership':{portalPaymentOwnershipIsValid},
  '@/lib/payments/checkout-closure':{isCheckoutContractingParty},'@/lib/portal/tokens':{hashPortalToken:()=>options.noHash?null:(options.tokenHash??tokenHash)},
  '@/lib/stripe/card-payment':{releaseStaleCardReservations:async input=>{cleanups.push(input);if(options.cleanupCommand)return options.cleanupCommand(input);if(options.cleanupThrows)throw Error('private cleanup diagnostic');return Object.hasOwn(options,'cleanup')?options.cleanup:{ok:true};}},
  '@/lib/supabase/admin':{getServiceRoleClient:()=>options.unconfigured?null:db},
 });
 return{calls,db,cleanups,aborted,module:context,reconciliation,run:()=>context.getPortalPaymentContext('synthetic',{},false)};
}
