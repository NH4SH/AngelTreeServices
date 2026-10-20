import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './pr10-test-helpers.mjs';
import * as closure from '../src/lib/payments/checkout-closure.ts';
import * as budget from '../src/lib/payments/checkout-budget.ts';
import * as policy from '../src/lib/payments/card-reservation-policy.ts';
import * as surcharge from '../src/lib/payments/card-surcharge.ts';
const { releaseStaleCardReservations, createCardReview } = load('../src/lib/stripe/card-payment.ts', {
  'server-only': {}, '@/lib/payments/checkout-closure': closure, '@/lib/payments/checkout-budget': budget,
  '@/lib/payments/card-reservation-policy': policy, '@/lib/payments/card-surcharge': surcharge,
});
const invoice='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000002';
const other='00000000-0000-4000-8000-000000000003';
const row=changes=>({id,invoice_id:invoice,status:'processing',payment_channel:'card',stripe_checkout_session_id:null,
  stripe_payment_intent_id:'pi_fixture',submitted_at:'2026-10-20T00:00:00Z',total_charge_cents:1000,currency:'usd',
  processing_expires_at:new Date(Date.now()-60000).toISOString(),...changes});
const intent=changes=>({id:'pi_fixture',livemode:false,amount:1000,amount_received:0,currency:'usd',status:'requires_action',
  metadata:{invoice_id:invoice,checkout_reservation_id:id,payment_channel:'card'},...changes});
function fixture(options={}){
  const rows=structuredClone(options.rows??[row(options.row)]),provider=[],writes=[];let remote=intent(options.intent),faulted=false;
  const db={from(){let patch;const filters=[];
    const q={select(){return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},is(k,v){filters.push(r=>r[k]===v);return q;},
      in(k,v){filters.push(r=>v.includes(r[k]));return q;},lte(k,v){filters.push(r=>r[k]!==null&&r[k]<=v);return q;},
      update(value){patch=value;return q;},maybeSingle(){return execute(true);},then(resolve,reject){return execute(false).then(resolve,reject);}};
    async function execute(single){const operation=patch?'expire':'list';
      if(options.throwAt===operation)throw Error('private backend diagnostic');
      if(patch&&options.race)Object.assign(rows[0],options.race);
      const matches=rows.filter(r=>filters.every(f=>f(r)));
      if(patch){writes.push(patch);matches.forEach(r=>Object.assign(r,patch));}
      const normal={data:structuredClone(single?(matches[0]?{id:matches[0].id}:null):matches),error:null};
      if(operation===options.faultAt&&(!options.faultOnce||!faulted)){faulted=true;return options.receipt;}
      return normal;
    }return q;}};
  const stripe={paymentIntents:{async retrieve(){provider.push('retrieve');if(options.retrieveThrows)throw Error('private provider diagnostic');return remote;},
    async cancel(){provider.push('cancel');if(options.cancelRace){remote=intent(options.cancelRace);throw Error('Synthetic competing completion');}
      if(options.cancelThrows)throw Error('Synthetic unconfirmed cancellation');remote=intent({status:'canceled',...options.cancelResult});return remote;}}};
  const input={invoiceId:invoice,stripe,supabase:db,livemode:false};
  return {rows,provider,writes,input,run:()=>releaseStaleCardReservations(input),async close(){return closure.closeCheckoutReservation({
    reservation:row(options.row),stripe,supabase:db,livemode:false,operation:'admin_invoice_void',correlationId:'synthetic',reviewing:true});}};
}
test('verified unpaid authentication intent is cancelled and exactly one reservation expires',async()=>{
  const f=fixture();assert.equal((await f.run()).ok,true);assert.deepEqual(f.provider,['retrieve','cancel']);assert.equal(f.rows[0].status,'expired');
});
test('an already cancelled and explicitly unpaid intent needs no second cancellation',async()=>{
  const f=fixture({intent:{status:'canceled'}});assert.equal((await f.run()).ok,true);assert.deepEqual(f.provider,['retrieve']);
});
test('an unsubmitted open review without provider bindings expires without provider requests',async()=>{
  const f=fixture({row:{status:'open',submitted_at:null,stripe_payment_intent_id:null}});
  assert.equal((await f.run()).ok,true);assert.equal(f.provider.length,0);assert.equal(f.rows[0].status,'expired');
});
for(const [name,receipt]of Object.entries({missingError:{data:[]},absent:{data:null,error:null},object:{data:{},error:null},
  foreign:{data:[row({invoice_id:other})],error:null},duplicate:{data:[row(),row()],error:null},laterMalformed:{data:[row(),{}],error:null},
  badDate:{data:[row({processing_expires_at:'unknown'})],error:null},mixedChannel:{data:[row({payment_channel:'ach'})],error:null},
  mixedProvider:{data:[row({stripe_checkout_session_id:'cs_other'})],error:null}})){
  test(`unconfirmed cleanup lookup cannot authorize provider changes: ${name}`,async()=>{
    const f=fixture({faultAt:'list',receipt});assert.equal((await f.run()).ok,false);assert.equal(f.provider.length,0);assert.equal(f.writes.length,0);
  });
}
for(const [name,receipt]of Object.entries({empty:{data:{},error:null},wrong:{data:{id:other},error:null},
  missingError:{data:{id}},array:{data:[{id}],error:null},absent:{data:null,error:null}})){
  test(`cleanup cannot claim confirmed expiry from an incomplete receipt: ${name}`,async()=>{
    const f=fixture({faultAt:'expire',receipt});assert.equal((await f.run()).ok,false);
  });
}
for(const [name,received]of Object.entries({missing:undefined,null:null,text:'0',paid:1,negative:-1,notANumber:NaN})){
  test(`uncertain received amount prevents cleanup cancellation and release: ${name}`,async()=>{
    const f=fixture({intent:{amount_received:received}});assert.equal((await f.run()).ok,false);
    assert.deepEqual(f.provider,['retrieve']);assert.equal(f.writes.length,0);
  });
  test(`the shared closer preserves the same unpaid-proof requirement: ${name}`,async()=>{
    const f=fixture({intent:{amount_received:received}});assert.equal((await f.close()).ok,false);
    assert.deepEqual(f.provider,['retrieve']);assert.equal(f.writes.length,0);
  });
  test(`an already cancelled intent still needs explicit unpaid proof: ${name}`,async()=>{
    const f=fixture({intent:{status:'canceled',amount_received:received}});assert.equal((await f.run()).ok,false);assert.equal(f.writes.length,0);
  });
}
for(const [name,change]of Object.entries({submission:{submitted_at:'2026-10-20T00:00:01Z'},
  provider:{stripe_payment_intent_id:'pi_other'},checkout:{stripe_checkout_session_id:'cs_other'},
  amount:{total_charge_cents:1200},currency:{currency:'eur'},expiry:{processing_expires_at:new Date(Date.now()-30000).toISOString()}})){
  test(`observed reservation changes prevent stale expiry even if status stays the same: ${name}`,async()=>{
    const f=fixture({race:change});assert.equal((await f.run()).ok,false);assert.equal(f.rows[0].status,'processing');
  });
}
for(const status of ['processing','requires_capture','succeeded']){
  test(`money-bearing or active provider state is retained: ${status}`,async()=>{
    const f=fixture({intent:{status,amount_received:status==='succeeded'?1000:0}});
    assert.equal((await f.run()).ok,true);assert.deepEqual(f.provider,['retrieve']);assert.equal(f.rows[0].status,'processing');assert.equal(f.writes.length,0);
  });
}
test('an unknown provider state blocks cleanup without cancellation',async()=>{
  const f=fixture({intent:{status:'unknown'}});assert.equal((await f.run()).ok,false);assert.deepEqual(f.provider,['retrieve']);
});
test('a lost cancellation response can be repaired only by a subsequent authoritative cancelled state',async()=>{
  const f=fixture({cancelRace:{status:'canceled'}});assert.equal((await f.run()).ok,true);assert.deepEqual(f.provider,['retrieve','cancel','retrieve']);
});
test('a cancellation race with successful payment retains the reservation',async()=>{
  const f=fixture({cancelRace:{status:'succeeded',amount_received:1000}});assert.equal((await f.run()).ok,false);assert.equal(f.writes.length,0);
});
test('a malformed cancellation result never releases the local guard',async()=>{
  const f=fixture({cancelResult:{amount_received:undefined}});assert.equal((await f.run()).ok,false);assert.equal(f.writes.length,0);
});
for(const throwAt of ['list','expire']){
  test(`transport uncertainty is contained and never reported as successful cleanup: ${throwAt}`,async()=>{
    const f=fixture({throwAt});const result=await f.run();assert.equal(result.ok,false);assert.equal(JSON.stringify(result).includes('private'),false);
  });
}
test('an unidentified creating attempt remains held even after its deadline',async()=>{
  const f=fixture({row:{status:'creating',stripe_payment_intent_id:null}});assert.equal((await f.run()).ok,false);assert.equal(f.writes.length,0);
});
test('confirmed empty cleanup remains successful',async()=>{assert.equal((await fixture({rows:[]}).run()).ok,true);});
test('lost local expiry acknowledgement recovers by rereading without another cancellation',async()=>{
  const f=fixture({faultAt:'expire',faultOnce:true,receipt:{data:{},error:null}});
  assert.equal((await f.run()).ok,false);assert.equal(f.rows[0].status,'expired');
  assert.equal((await f.run()).ok,true);assert.deepEqual(f.provider,['retrieve','cancel']);
});
test('card review preparation stops before token retrieval when cleanup is unconfirmed',async()=>{
  const f=fixture({faultAt:'list',receipt:{data:null,error:null}});
  f.input.stripe.confirmationTokens={async retrieve(){f.provider.push('token');throw Error('Unexpected token retrieval');}};
  const result=await createCardReview({...f.input,confirmationTokenId:'ctoken_fixture',customerId:other,
    invoicePrincipalCents:1000,organizationId:null,surchargeBps:300,surchargeEnabled:true});
  assert.equal(result.ok,false);assert.equal(f.provider.length,0);
});
for(const change of [{submitted_at:'2026-10-20T00:00:01Z'},{stripe_checkout_session_id:'cs_other'}]){
  test(`unbound open review expiry fences new evidence: ${JSON.stringify(change)}`,async()=>{
    const f=fixture({row:{status:'open',stripe_payment_intent_id:null,submitted_at:null},race:change});
    assert.equal((await f.run()).ok,false);assert.equal(f.rows[0].status,'open');assert.equal(f.provider.length,0);
  });
}
test('provider retrieval failure retains the guard without a local write',async()=>{
  const f=fixture({retrieveThrows:true});assert.equal((await f.run()).ok,false);assert.equal(f.writes.length,0);
});
for(const status of ['requires_confirmation','requires_payment_method']){
  test(`existing unpaid cancellation policy remains supported: ${status}`,async()=>{
    const f=fixture({intent:{status}});assert.equal((await f.run()).ok,true);assert.equal(f.rows[0].status,'expired');
  });
}
for(const received of [undefined,null,'0',1,0]){
  test(`expanded bank intent also needs explicit unpaid proof: ${String(received)} (${typeof received})`,()=>{
    const reservation=row({payment_channel:'ach',stripe_checkout_session_id:'cs_fixture'});
    const expanded=intent({status:'requires_payment_method',amount_received:received,
      metadata:{invoice_id:invoice,checkout_reservation_id:id,payment_channel:'ach'}});
    const session={id:'cs_fixture',mode:'payment',livemode:false,status:'open',payment_status:'unpaid',
      metadata:{invoice_id:invoice,checkout_reservation_id:id,payment_channel:'ach'},client_reference_id:invoice,
      amount_total:1000,currency:'usd',payment_intent:expanded};
    assert.equal(closure.classifyCheckoutForClosure(session,reservation,false),received===0?'open':'checkout_payment_in_progress');
  });
}
