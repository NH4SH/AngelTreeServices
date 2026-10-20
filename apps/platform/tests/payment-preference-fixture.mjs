import assert from 'node:assert/strict';
import * as preference from '../src/lib/payments/payment-preference.ts';
import {load} from './pr10-test-helpers.mjs';
const defaultInvoice='00000000-0000-4000-8000-000000000001',customer='00000000-0000-4000-8000-000000000002';
const source='00000000-0000-4000-8000-000000000003',other='00000000-0000-4000-8000-000000000004';
const base='https://crm.example.invalid',defaultHash='a'.repeat(64);
const eventRow=(changes={})=>({invoice_id:defaultInvoice,preference_changed:true,source_event_id:source,...changes});
const tableRow=(changes={})=>({invoice_id:defaultInvoice,preference_changed:true,...changes});
export function preferenceRouteFixture(kind,options={}){
 const calls=[],next=[],handoffs=[];let fault=options.fault;
 const invoice=options.invoiceId??defaultInvoice,hash=options.tokenHash??defaultHash;
 const db={rpc(name,args){calls.push({name,args});if(options.rpc)return options.rpc(name,args);return {abortSignal(signal){assert.ok(signal instanceof AbortSignal);return this;},then(resolve,reject){
  return Promise.resolve().then(()=>{
   if(fault==='throw')throw Error('private backend detail');
   if(fault==='hang')return new Promise(()=>{});
   if(options.receipt!==undefined&&(!options.once||fault!==false)){fault=false;return options.receipt;}
   return {data:kind==='form'?eventRow(options.row):[tableRow(options.row)],error:null};
  }).then(resolve,reject);
 }}}};
 const deps={
  'next/server':{NextResponse:{json:(data,init)=>Response.json(data,init)}},
  '@/lib/payments/payment-preference':options.helper??preference,
  '@/lib/payments/portal-card-context':{
   getPortalPaymentContext:context,getPortalCardPaymentContext:context,
  },
  '@/lib/data/portal-invoice':{getInvoiceByPortalToken:async()=>({status:options.unavailable?'missing':'ready',invoice:{id:invoice}})},
  '@/lib/portal/tokens':{hashPortalToken:()=>hash},
  '@/lib/supabase/admin':{getServiceRoleClient:()=>db},
  '@/lib/payments/payment-options':{isInvoicePaymentPreference:v=>['ach','card','cash_check_pickup','check_mail'].includes(v),
   getInvoicePaymentConfiguration:()=>({cardEnabled:options.cardEnabled!==false,surchargeEnabled:true,surchargeBps:300})},
  '@/lib/stripe/server':{getStripeServerConfig:()=>({configured:options.configured!==false,appBaseUrl:base,stripe:{},livemode:false})},
  '@/lib/stripe/invoice-checkout':{createOrReuseInvoiceCheckout:async input=>{next.push(input);return{ok:true,url:base+'/synthetic-checkout'};}},
  '@/lib/stripe/card-payment':{createCardReview:async input=>{next.push(input);return{ok:true,review:{reviewId:other,invoicePrincipalCents:1000,grossChargeCents:1030,surchargeCents:30,surchargeEligible:true,cardFundingType:'credit'}};}},
  '@/lib/notifications/source-events':{deliverCustomerSourceEvent:async input=>{handoffs.push(input);if(options.deliveryThrows)throw Error('private delivery detail');return 'delivery'in options?options.delivery:{prepared:true};}},
  '@/lib/security/rate-limit':{enforceSharedRateLimit:async()=>({available:true,allowed:true,...options.limit})},
  '@/lib/security/app-base-url':{getCanonicalAppBaseUrl:()=>base},
 };
 async function context(){return options.unavailable?{ok:false,message:'Unavailable',status:404}:{ok:true,supabase:db,invoicePrincipalCents:1000,
  billingEmail:'local@example.invalid',invoice:{id:invoice,customer_id:options.organization?null:(options.partyId??customer),organization_id:options.organization?(options.partyId??other):null,invoice_number:'LOCAL'}};}
 const path=kind==='bank'?'checkout':kind==='card'?'card/review':'payment-preference';
 const route=load('../src/app/api/portal/invoice/[token]/'+path+'/route.ts',deps);
 const body=kind==='bank'?{method:'ach'}:kind==='card'?{confirmationTokenId:'ctoken_fixture'}:{preference:options.method??'ach'};
 return {calls,next,handoffs,db,run:()=>route.POST(new Request(base+'/api/local',{method:'POST',headers:{origin:options.origin??base,'content-type':'application/json'},
  body:JSON.stringify(options.body??body)}),{params:Promise.resolve({token:'synthetic'})})};
}
