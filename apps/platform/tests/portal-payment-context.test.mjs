import assert from 'node:assert/strict';
import test from 'node:test';
import {contextFixture,invoiceRow,tokenRow,paymentRow,invoiceId,customerId,organizationId,paymentId} from './portal-payment-context-fixture.mjs';
const other='00000000-0000-4000-8000-000000000099';
async function denied(f,{beforeCleanup=true,status}={}){const result=await f.run();assert.equal(result.ok,false);if(status)assert.equal(result.status,status);
 if(beforeCleanup)assert.equal(f.cleanups.length,0);assert.equal(JSON.stringify(result).includes('private'),false);return result;}
test('confirmed empty history and explicit null processing return the existing payable context',async()=>{
 const f=contextFixture(),r=await f.run();assert.equal(r.ok,true);assert.equal(r.invoicePrincipalCents,1000);assert.equal(r.billingEmail,'customer@example.invalid');
 assert.equal(f.cleanups.length,1);assert.equal(f.cleanups[0].invoiceId,invoiceId);assert.equal(r.supabase,f.db);assert.equal(f.module.getPortalCardPaymentContext,f.module.getPortalPaymentContext);
 const payments=f.calls.find(c=>c.table==='payments');assert.deepEqual(payments.selectOptions,{count:'exact'});assert.deepEqual(payments.filters,[['invoice_id','eq',invoiceId],['status','eq','succeeded']]);
});
for(const status of ['sent','partially_paid','overdue'])test(`payable ${status} keeps exact partial payment arithmetic`,async()=>{
 const f=contextFixture({invoice:{status},payments:[paymentRow()]});assert.equal((await f.run()).invoicePrincipalCents,600);
});
for(const status of ['draft','paid','void'])test(`${status} invoice remains unpayable`,async()=>{
 await denied(contextFixture({invoice:{status}}),{status:409});
});
for(const[name,change]of Object.entries({foreign:{id:other},badId:{id:'invoice'},missingParty:{customer_id:undefined},both:{organization_id:organizationId},neither:{customer_id:null},
 foreignCustomer:{customers:{id:other,email:'private@example.invalid'}},foreignOrganization:{customer_id:null,organization_id:organizationId,customers:null,organizations:{id:other,billing_email:null}},
 ambiguousCustomer:{customers:[{id:customerId,email:null},{id:other,email:null}]},missingRelation:{customers:undefined},missingBilling:{billing_contact:undefined},
 badContact:{accounts_payable_contact:{email:123}},ambiguousContact:{billing_contact:[{email:null},{email:null}]},badJob:{jobs:{service_location_id:'invalid'}},
 stringTotal:{total_cents:'1000'},nullTotal:{total_cents:null},negativeTotal:{total_cents:-1},fractionalTotal:{total_cents:1000.5},largeTotal:{total_cents:2147483648},unknownStatus:{status:'mystery'},
 missingNumber:{invoice_number:undefined}}))test(`invoice ${name} is held before cleanup`,async()=>{await denied(contextFixture({invoice:change}));});
for(const table of ['invoices','invoice_portal_tokens','payments','invoice_checkout_sessions']){
 for(const[name,receipt]of Object.entries({missingError:{data:table==='invoices'?invoiceRow():table==='invoice_portal_tokens'?tokenRow():null},falseError:{data:null,error:false},missingData:{error:null},array:{data:[{}],error:null},diagnostic:{data:null,error:{message:'private backend'}}})){
  test(`${table}: ${name} cannot authorize payment`,async()=>{await denied(contextFixture({receipts:{[table]:receipt}}),{beforeCleanup:table!=='invoice_checkout_sessions'});});
 }
 test(`${table}: thrown reads stay safe and contained`,async()=>{await denied(contextFixture({throwAt:table}),{beforeCleanup:table!=='invoice_checkout_sessions'});});
 test(`${table}: hanging reads are aborted without progressing`,async()=>{
  const f=contextFixture({hangAt:table,fastDeadline:true});await denied(f,{beforeCleanup:table!=='invoice_checkout_sessions'});assert.deepEqual(f.aborted,[table]);
 });
}
for(const[name,change]of Object.entries({expired:{expires_at:new Date(Date.now()-1000).toISOString()},invalidExpiry:{expires_at:'invalid'},missingExpiry:{expires_at:undefined},numericExpiry:{expires_at:0},
 revoked:{revoked_at:new Date().toISOString()},missingRevocation:{revoked_at:undefined},foreignInvoice:{invoice_id:other},foreignParty:{customer_id:other},missingParty:{organization_id:undefined}})){
 test(`token ${name} cannot authorize cleanup or payment`,async()=>{await denied(contextFixture({token:change}),{status:404});});
}
test('a valid future expiry remains supported',async()=>{assert.equal((await contextFixture({token:{expires_at:new Date(Date.now()+60000).toISOString()}}).run()).ok,true);});
for(const [name,receipt]of Object.entries({nullData:{data:null,error:null,count:0},missingCount:{data:[],error:null},truncated:{data:[paymentRow()],error:null,count:2},
 wrongCount:{data:[],error:null,count:'0'},missingError:{data:[],count:0},duplicate:{data:[paymentRow(),paymentRow()],error:null,count:2},
 nullRow:{data:[null],error:null,count:1}}))test(`payment history ${name} is never interpreted as no money paid`,async()=>{await denied(contextFixture({receipts:{payments:receipt}}));});
for(const[name,change]of Object.entries({foreignInvoice:{invoice_id:other},missingId:{id:undefined},wrongStatus:{status:'pending'},stringAmount:{amount_cents:'400'},zero:{amount_cents:0},negative:{amount_cents:-1},
 fraction:{amount_cents:1.5},missingRefund:{refunded_principal_cents:undefined},nullRefund:{refunded_principal_cents:null},stringRefund:{refunded_principal_cents:'0'},overRefund:{refunded_principal_cents:401},
 missingDispute:{disputed_principal_cents:undefined},stringDispute:{disputed_principal_cents:'0'},overDispute:{disputed_principal_cents:401},unknownDispute:{dispute_status:'unknown'},missingDisputeStatus:{dispute_status:undefined}})){
 test(`payment row ${name} cannot alter collectible principal`,async()=>{await denied(contextFixture({payments:[paymentRow(change)]}));});
}
for(const [status,expected]of [[null,800],['won',800],['under_review',800],['needs_response',800],['warning_closed',800],['warning_under_review',800],['warning_needs_response',800],['lost',900]])test(`refund/dispute accounting is preserved for ${status}`,async()=>{
 const r=await contextFixture({payments:[paymentRow({refunded_principal_cents:200,disputed_principal_cents:100,dispute_status:status})]}).run();assert.equal(r.invoicePrincipalCents,expected);
});
test('combined refund/dispute adjustment remains clamped to original principal',async()=>{
 assert.equal((await contextFixture({payments:[paymentRow({refunded_principal_cents:300,disputed_principal_cents:300,dispute_status:'lost'})]}).run()).invoicePrincipalCents,1000);
});
for(const total of [1000,1200])test(`fully paid/overpaid principal ${total} does not start collection`,async()=>{await denied(contextFixture({payments:[paymentRow({amount_cents:total})]}),{status:409});});
for(const [total,allowed]of [[99999999,true],[100000000,false]])test(`online collection limit ${total} remains`,async()=>{
 const f=contextFixture({invoice:{total_cents:total}});if(allowed)assert.equal((await f.run()).ok,true);else await denied(f,{status:409});
});
for(const [status,data]of [['creating',{id:other,invoice_id:invoiceId,status:'creating'}],['processing',{id:other,invoice_id:invoiceId,status:'processing'}]])test(`${status} reservation remains held`,async()=>{
 await denied(contextFixture({receipts:{invoice_checkout_sessions:{data,error:null}}}),{beforeCleanup:false,status:409});
});
for(const [name,data]of Object.entries({empty:{},foreign:{id:other,invoice_id:other,status:'processing'},wrongState:{id:other,invoice_id:invoiceId,status:'completed'}}))test(`processing receipt ${name} stays unconfirmed`,async()=>{
 await denied(contextFixture({receipts:{invoice_checkout_sessions:{data,error:null}}}),{beforeCleanup:false,status:503});
});
for(const cleanup of [null,undefined,{}, {ok:false},{ok:'true'}])test(`cleanup ${JSON.stringify(cleanup)} cannot authorize a context`,async()=>{
 const f=contextFixture({cleanup});await denied(f,{beforeCleanup:false,status:503});assert.equal(f.calls.some(c=>c.table==='invoice_checkout_sessions'),false);
});
test('organization-only billing keeps null customer and existing contact priority',async()=>{
 const f=contextFixture({invoice:{customer_id:null,organization_id:organizationId,customers:null,organizations:[{id:organizationId,billing_email:'org@example.invalid'}],
  accounts_payable_contact:[{email:'payable@example.invalid'}],billing_contact:{email:'billing@example.invalid'},jobs:[{service_location_id:other}]},token:{customer_id:null,organization_id:organizationId}});
 const r=await f.run();assert.equal(r.ok,true);assert.equal(r.invoice.customer_id,null);assert.equal(r.invoice.organization_id,organizationId);assert.equal(r.billingEmail,'payable@example.invalid');assert.equal(r.invoice.jobs.service_location_id,other);
});
for(const [name,options]of [['lookup throw',{lookupThrows:true}],['lookup timeout',{lookupHangs:true,fastDeadline:true}],['missing link',{lookup:{status:'invalid'}}],['unconfigured',{unconfigured:true}],['cleanup throw',{cleanupThrows:true}]])test(`${name} is safely contained`,async()=>{await denied(contextFixture(options),{beforeCleanup:name!=='cleanup throw'});});

// Exercise the real route-to-context handoff as well as the focused reader.
for(const kind of ['bank','review','confirm'])for(const held of [false,true])test(`${kind} route ${held?'holds incomplete history':'accepts confirmed organization context'}`,async()=>{
 const {load}=await import('./pr10-test-helpers.mjs');
 const preference=await import('../src/lib/payments/payment-preference.ts');
 const next=[],commands=[];
 const f=contextFixture({invoice:{customer_id:null,organization_id:organizationId,customers:null,organizations:{id:organizationId,billing_email:'org@example.invalid'}},
  token:{customer_id:null,organization_id:organizationId},payments:[paymentRow()],
  ...(held?{receipts:{payments:{data:[paymentRow()],error:null,count:2}}}:{})});
 f.db.rpc=async(name,args)=>{commands.push({name,args});return{data:[{invoice_id:invoiceId,preference_changed:false}],error:null};};
 const review={reviewId:other,invoicePrincipalCents:600,grossChargeCents:618,surchargeCents:18,surchargeEligible:true,cardFundingType:'credit'};
 const route=load('../src/app/api/portal/invoice/[token]/'+(kind==='bank'?'checkout':'card/'+kind)+'/route.ts',{
  'next/server':{NextResponse:{json:(data,init)=>Response.json(data,init)}},
  '@/lib/payments/portal-card-context':f.module,'@/lib/payments/payment-preference':preference,
  '@/lib/portal/tokens':{hashPortalToken:()=> 'a'.repeat(64)},
  '@/lib/payments/payment-options':{getInvoicePaymentConfiguration:()=>({cardEnabled:true,surchargeBps:300,surchargeEnabled:true})},
  '@/lib/security/rate-limit':{enforceSharedRateLimit:async()=>({available:true,allowed:true})},
  '@/lib/stripe/server':{getStripeServerConfig:()=>({configured:true,stripe:{},livemode:false,appBaseUrl:'https://crm.example.invalid'})},
  '@/lib/stripe/invoice-checkout':{createOrReuseInvoiceCheckout:async input=>{next.push(input);return{ok:true,url:'https://checkout.example.invalid/local'};}},
  '@/lib/stripe/card-payment':{createCardReview:async input=>{next.push(input);return{ok:true,review};},confirmCardReview:async input=>{next.push(input);return{ok:true,clientSecret:'synthetic_local',status:'requires_action'};}},
 });
 const body=kind==='bank'?{method:'ach'}:kind==='review'?{confirmationTokenId:'ctoken_fixture'}:{reviewId:other};
 const response=await route.POST(new Request('https://crm.example.invalid/local',{method:'POST',headers:{origin:'https://crm.example.invalid','content-type':'application/json'},body:JSON.stringify(body)}),{params:Promise.resolve({token:'synthetic'})});
 assert.equal(response.status,held?503:200);
 if(held){assert.equal(next.length,0);assert.equal(commands.length,0);assert.equal(f.cleanups.length,0);}
 else{
  assert.equal(next.length,1);assert.equal(next[0].invoiceId,invoiceId);assert.equal(next[0][kind==='bank'?'amountCents':'invoicePrincipalCents'],600);
  if(kind!=='confirm'){assert.equal(next[0].customerId,null);assert.equal(next[0].organizationId,organizationId);assert.equal(commands.length,1);}
  else{assert.equal(next[0].billingEmail,'org@example.invalid');assert.equal(commands.length,0);}
 }
});
