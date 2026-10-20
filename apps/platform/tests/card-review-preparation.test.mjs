import * as preference from '../src/lib/payments/payment-preference.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './pr10-test-helpers.mjs';
import * as closure from '../src/lib/payments/checkout-closure.ts';
import * as budget from '../src/lib/payments/checkout-budget.ts';
import * as policy from '../src/lib/payments/card-reservation-policy.ts';
import * as surcharge from '../src/lib/payments/card-surcharge.ts';
const payment=load('../src/lib/stripe/card-payment.ts',{'server-only':{},'@/lib/payments/checkout-closure':closure,
  '@/lib/payments/checkout-budget':budget,'@/lib/payments/card-reservation-policy':policy,'@/lib/payments/card-surcharge':surcharge});
const invoice='00000000-0000-4000-8000-000000000001',customer='00000000-0000-4000-8000-000000000002';
const id='00000000-0000-4000-8000-000000000003',other='00000000-0000-4000-8000-000000000004';
const row=changes=>({id,invoice_id:invoice,customer_id:customer,organization_id:null,payment_channel:'card',status:'open',currency:'usd',
  stripe_checkout_session_id:null,stripe_payment_intent_id:null,submitted_at:null,stripe_confirmation_token_id:'ctoken_fixture',
  amount_cents:1000,invoice_principal_cents:1000,surcharge_cents:30,total_charge_cents:1030,card_brand:'visa',card_country:'US',card_funding_type:'credit',
  reviewed_at:new Date().toISOString(),processing_expires_at:new Date(Date.now()+policy.cardReviewLifetimeMs).toISOString(),...changes});
function fixture(options={}){
  const rows=structuredClone(options.rows??[]),calls=[],provider=[];let faulted=false;
  const db={from(){let patch,inserted,stale=false;const filters=[];
    const q={select(){return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},is(k,v){filters.push(r=>r[k]===v);return q;},
      in(k,values){filters.push(r=>values.includes(r[k]));return q;},lte(k,v){stale=true;filters.push(r=>r[k]!==null&&r[k]<=v);return q;},
      insert(value){inserted=value;return q;},update(value){patch=value;return q;},
      single(){return run(true);},maybeSingle(){return run(true);},then(resolve,reject){return run(false).then(resolve,reject);}};
    async function run(single){const operation=inserted?'insert':patch?'close':stale?'cleanup':single?'existing':'active';calls.push(operation);
      if(options.throwAt===operation)throw Error('private backend diagnostic');
      let matches=rows.filter(r=>filters.every(f=>f(r)));
      if(inserted){const created=row({...inserted,...options.insertChanges});rows.push(created);matches=[created];}
      if(patch)matches.forEach(r=>Object.assign(r,patch));
      const normal={data:structuredClone(single?(patch?(matches[0]?{id:matches[0].id}:null):matches[0]??null):matches),error:null};
      if(operation===options.faultAt&&(!options.faultOnce||!faulted)){faulted=true;return options.receipt;}
      return normal;
    }return q;}};
  const stripe={confirmationTokens:{async retrieve(){provider.push('token');if(options.tokenThrows)throw Error('private provider diagnostic');return {id:'ctoken_fixture',livemode:false,
    payment_method_preview:{type:'card',card:{brand:'visa',funding:'credit',country:'US'}},...options.token};}},
    paymentIntents:{async create(){assert.fail('Review preparation must never submit money');}}};
  const input={invoiceId:invoice,customerId:customer,organizationId:null,confirmationTokenId:'ctoken_fixture',invoicePrincipalCents:1000,
    supabase:db,stripe,livemode:false,surchargeBps:300,surchargeEnabled:true};
  return {input,rows,calls,provider,run:()=>payment.createCardReview(input)};
}
test('confirmed preparation returns the saved review and the existing fee calculation',async()=>{
  const f=fixture(),result=await f.run();assert.equal(result.ok,true);assert.equal(result.review.reviewId,id);
  assert.equal(result.review.invoicePrincipalCents,1000);assert.equal(result.review.surchargeCents,30);assert.equal(result.review.grossChargeCents,1030);
  assert.equal(f.rows.length,1);assert.deepEqual(f.provider,['token']);
});
for(const [name,receipt]of Object.entries({empty:{data:{},error:null},idOnly:{data:{id},error:null},
  missingError:{data:row()},array:{data:[row()],error:null},absent:{data:null,error:null}})){
  test(`an unconfirmed insert cannot report a ready review: ${name}`,async()=>{
    const f=fixture({faultAt:'insert',receipt});const result=await f.run();assert.equal(result.ok,false);assert.equal(result.review,undefined);
  });
}
for(const [name,changes]of Object.entries({wrongInvoice:{invoice_id:other},wrongCustomer:{customer_id:other},wrongOrganization:{organization_id:other},
  wrongToken:{stripe_confirmation_token_id:'ctoken_other'},wrongChannel:{payment_channel:'ach'},wrongCurrency:{currency:'eur'},
  wrongPrincipal:{invoice_principal_cents:900},wrongGross:{total_charge_cents:1040,surcharge_cents:40},
  wrongCard:{card_brand:'mastercard'},wrongFunding:{card_funding_type:'debit'},wrongCountry:{card_country:'CA'},
  submitted:{submitted_at:new Date().toISOString()},bound:{stripe_payment_intent_id:'pi_fixture'},invalidId:{id:'unusable-review'},invalidDate:{reviewed_at:'invalid'}})){
  test(`a saved review must match the promised invoice/card/fees: ${name}`,async()=>{
    const f=fixture({insertChanges:changes});const result=await f.run();assert.equal(result.ok,false);assert.equal(result.review,undefined);
  });
}
for(const [name,changes]of Object.entries({wrongId:{id:'ctoken_other'},wrongMode:{livemode:true},missingMode:{livemode:undefined}})){
  test(`an unconfirmed token cannot replace another review: ${name}`,async()=>{
    const f=fixture({token:changes,rows:[row({id:other,stripe_confirmation_token_id:'ctoken_prior'})]});
    assert.equal((await f.run()).ok,false);assert.equal(f.calls.includes('close'),false);assert.equal(f.calls.includes('insert'),false);
  });
}
for(const [name,receipt]of Object.entries({missingError:{data:null},object:{data:{},error:null},array:{data:[],error:null},
  coerced:{data:row({invoice_principal_cents:'1000',surcharge_cents:'30',total_charge_cents:'1030'}),error:null},
  missingId:{data:row({id:undefined}),error:null},foreign:{data:row({invoice_id:other}),error:null},
  wrongCustomer:{data:row({customer_id:other}),error:null}})){
  test(`an unconfirmed existing lookup cannot report success or insert: ${name}`,async()=>{
    const f=fixture({faultAt:'existing',receipt});assert.equal((await f.run()).ok,false);assert.equal(f.calls.includes('insert'),false);
  });
}
for(const [name,receipt]of Object.entries({missingError:{data:[]},absent:{data:null,error:null},object:{data:{},error:null},
  foreign:{data:[row({id:other,invoice_id:other})],error:null},duplicate:{data:[row(),row()],error:null},laterMalformed:{data:[row(),{}],error:null}})){
  test(`validate the complete active list before closing prior reviews: ${name}`,async()=>{
    const f=fixture({faultAt:'active',receipt});assert.equal((await f.run()).ok,false);assert.equal(f.calls.includes('close'),false);assert.equal(f.calls.includes('insert'),false);
  });
}
test('a healthy existing review is reused without insertion or changing its timestamp',async()=>{
  const existing=row(),f=fixture({rows:[existing]});const result=await f.run();assert.equal(result.ok,true);assert.equal(result.review.reviewId,id);
  assert.equal(f.calls.includes('insert'),false);assert.equal(f.rows[0].reviewed_at,existing.reviewed_at);
});
test('retry after a lost insert acknowledgement reuses the same review instead of adding one',async()=>{
  const f=fixture({faultAt:'insert',faultOnce:true,receipt:{data:{},error:null}});
  assert.equal((await f.run()).ok,false);const result=await f.run();assert.equal(result.ok,true);assert.equal(result.review.reviewId,id);
  assert.equal(f.rows.length,1);assert.equal(f.calls.filter(c=>c==='insert').length,1);
});
for(const status of ['creating','processing']){
  test(`an already submitted review remains blocked: ${status}`,async()=>{
    const f=fixture({rows:[row({status,submitted_at:new Date().toISOString()})]});assert.equal((await f.run()).ok,false);
    assert.equal(f.calls.includes('insert'),false);assert.equal(f.calls.includes('close'),false);
  });
}
for(const throwAt of ['existing','active','insert']){
  test(`transport uncertainty returns a safe unavailable review: ${throwAt}`,async()=>{
    const result=await fixture({throwAt}).run();assert.equal(result.ok,false);assert.equal(JSON.stringify(result).includes('private'),false);
  });
}
for(const [funding,country]of [['debit','US'],['prepaid','US'],['unknown','US'],['credit','CA']]){
  test(`existing surcharge exclusion remains for ${funding}/${country}`,async()=>{
    const f=fixture({token:{payment_method_preview:{type:'card',card:{brand:'visa',funding,country}}}});
    const result=await f.run();assert.equal(result.ok,true);assert.equal(result.review.surchargeCents,0);assert.equal(result.review.grossChargeCents,1000);
  });
}
test('the actual card-review route refuses an incomplete saved review',async()=>{
  const f=fixture({faultAt:'insert',receipt:{data:{},error:null}});f.input.supabase.rpc=async()=>({data:[{invoice_id:invoice,preference_changed:true}],error:null});
  const route=load('../src/app/api/portal/invoice/[token]/card/review/route.ts',{
    '@/lib/payments/payment-preference':preference,
    'next/server':{NextResponse:{json:(data,options)=>Response.json(data,options)}},
    '@/lib/payments/payment-options':{getInvoicePaymentConfiguration:()=>({cardEnabled:true,surchargeBps:300,surchargeEnabled:true})},
    '@/lib/payments/portal-card-context':{getPortalCardPaymentContext:async()=>({ok:true,invoice:{id:invoice,customer_id:customer,organization_id:null},invoicePrincipalCents:1000,supabase:f.input.supabase})},
    '@/lib/portal/tokens':{hashPortalToken:()=> 'a'.repeat(64)},'@/lib/stripe/card-payment':payment,
    '@/lib/stripe/server':{getStripeServerConfig:()=>({configured:true,stripe:f.input.stripe,livemode:false,appBaseUrl:'https://crm.example.invalid'})},
    '@/lib/security/rate-limit':{enforceSharedRateLimit:async()=>({available:true,allowed:true})},
  });
  const response=await route.POST(new Request('https://crm.example.invalid/local',{method:'POST',headers:{origin:'https://crm.example.invalid','content-type':'application/json'},
    body:JSON.stringify({confirmationTokenId:'ctoken_fixture'})}),{params:Promise.resolve({token:'synthetic'})});
  assert.equal(response.status,409);assert.equal((await response.json()).review,undefined);
  assert.ok(f.calls.includes('insert'),'route must reach review insertion after a confirmed preference');
});
test('cleanup uncertainty prevents even retrieving a new token',async()=>{
  const f=fixture({faultAt:'cleanup',receipt:{data:null,error:null}});assert.equal((await f.run()).ok,false);assert.equal(f.provider.length,0);
});
test('a prior unsubmitted review is safely closed before inserting the new review',async()=>{
  const f=fixture({rows:[row({id:other,stripe_confirmation_token_id:'ctoken_prior'})]});
  assert.equal((await f.run()).ok,true);assert.equal(f.rows[0].status,'cancelled');assert.equal(f.rows.length,2);
  assert.ok(f.calls.indexOf('close')<f.calls.indexOf('insert'));
});
for(const status of ['creating','processing']){
  test(`a different ${status} attempt cannot be replaced`,async()=>{
    const f=fixture({rows:[row({id:other,stripe_confirmation_token_id:'ctoken_prior',status,submitted_at:new Date().toISOString()})]});
    assert.equal((await f.run()).ok,false);assert.equal(f.calls.includes('close'),false);assert.equal(f.calls.includes('insert'),false);
  });
}
test('an old review timestamp cannot be reused even when its expiry field has not elapsed',async()=>{
  const f=fixture({rows:[row({reviewed_at:new Date(Date.now()-policy.cardReviewLifetimeMs-60000).toISOString()})]});
  assert.equal((await f.run()).ok,false);assert.equal(f.calls.includes('insert'),false);
});
test('a newly inserted review cannot already have a checkout-session binding',async()=>{
  assert.equal((await fixture({insertChanges:{stripe_checkout_session_id:'cs_fixture'}}).run()).ok,false);
});
test('consistent live mode remains supported by synthetic adapters',async()=>{
  const f=fixture({token:{livemode:true}});f.input.livemode=true;assert.equal((await f.run()).ok,true);
});
test('closed reviews are not reopened or replaced using the same consumed token',async()=>{
  const f=fixture({rows:[row({status:'cancelled'})]});assert.equal((await f.run()).ok,false);assert.equal(f.calls.includes('insert'),false);
});
test('token lookup failure does not mutate or insert a review',async()=>{
  const f=fixture({tokenThrows:true});const result=await f.run();assert.equal(result.ok,false);assert.equal(f.calls.includes('close'),false);
  assert.equal(f.calls.includes('insert'),false);assert.equal(JSON.stringify(result).includes('private'),false);
});
test('organization-only card reviews acknowledge the existing contracting party',async()=>{
  const f=fixture();f.input.customerId=null;f.input.organizationId=other;assert.equal((await f.run()).ok,true);
  assert.equal(f.rows[0].customer_id,null);assert.equal(f.rows[0].organization_id,other);
});
test('organization-only card reviews are reusable without a second insert',async()=>{
  const f=fixture({rows:[row({customer_id:null,organization_id:other})]});f.input.customerId=null;f.input.organizationId=other;
  assert.equal((await f.run()).ok,true);assert.equal(f.calls.includes('insert'),false);
});
