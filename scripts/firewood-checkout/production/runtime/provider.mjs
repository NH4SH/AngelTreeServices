import Stripe from 'stripe';
import {createHash} from 'node:crypto';
import {STRIPE_API_VERSION} from '../../model.mjs';
import {CheckoutError} from './policy.mjs';
export const purpose='firewood_candidate_v1';
export function stripeProvider(config,fetcher=fetch,{sandboxIdentityKey=null,crm=null}={}) {
  if(crm)crm.assertConfiguration(config);
  if(sandboxIdentityKey&&(!config.sandbox||!/^rk_test_[A-Za-z0-9]+$/u.test(sandboxIdentityKey)||!/^rkcs_test_[A-Za-z0-9]+$/u.test(config.key)))throw Error('isolated_claimed_sandbox_credentials_required');
  if(!sandboxIdentityKey&&!(config.sandbox?/^rk_test_[A-Za-z0-9]+$/u:/^rk_live_[A-Za-z0-9]+$/u).test(config.key))throw Error('restricted_runtime_key_required');
  const client=new Stripe(config.key,{apiVersion:STRIPE_API_VERSION,httpClient:Stripe.createFetchHttpClient(fetcher),maxNetworkRetries:0,timeout:12000});
  // Stripe's claimed-sandbox management key cannot read /v1/account. An isolated
  // test harness may pair it with this sandbox's restricted identity key. Every
  // payment/refund still verifies the exact test object and frozen order. The
  // native runtime accepts only its restricted key, and live mode disallows this.
  const identity=sandboxIdentityKey?new Stripe(sandboxIdentityKey,{apiVersion:STRIPE_API_VERSION,httpClient:Stripe.createFetchHttpClient(fetcher),maxNetworkRetries:0,timeout:12000}):client;
  const live=!config.sandbox,sessionPattern=live?/^cs_live_[A-Za-z0-9_]+$/u:/^cs_test_[A-Za-z0-9_]+$/u;
  const metadata=row=>crm?crm.metadata(row):({purpose,order:row.id,policy_hash:row.terms.hash,environment:config.mode});
  async function verifyAccount(){if((await identity.accounts.retrieve()).id!==config.account)throw Error('candidate_stripe_account_mismatch');}
  function checkSession(s,row) {
    if(s.livemode!==live||!sessionPattern.test(s.id)||s.amount_total!==row.quote.totalCents||s.currency!=='usd'||s.client_reference_id!==row.id||
      Object.entries(metadata(row)).some(([k,v])=>s.metadata?.[k]!==v))throw Error('payment_order_binding_mismatch');
    return s;
  }
  async function retrieve(row){await verifyAccount();if(!sessionPattern.test(row.payment_id??''))throw Error('invalid_candidate_session');return checkSession(await client.checkout.sessions.retrieve(row.payment_id),row);}
  const idOf=value=>typeof value==='string'?value:value?.id;
  function refundProof(value,row,job={}){
    if(!/^re_[A-Za-z0-9]+$/u.test(value.id??'')||idOf(value.payment_intent)!==row.payment_intent||value.currency!=='usd'||
      !Number.isInteger(value.amount)||value.amount<1||value.amount>row.quote.totalCents||
      !['succeeded','pending','requires_action','failed','canceled'].includes(value.status)||
      job.provider_id&&value.id!==job.provider_id||job.amount!==undefined&&value.amount!==job.amount||
      job.id&&(value.metadata?.operation!==job.id||Object.entries(metadata(row)).some(([k,v])=>value.metadata?.[k]!==v)))throw Error('refund_order_binding_mismatch');
    return {id:value.id,status:value.status,amount:value.amount,charge:idOf(value.charge),operation:value.metadata?.operation,
      binding:{purpose:value.metadata?.purpose,environment:value.metadata?.environment,policyHash:value.metadata?.policy_hash}};
  }
  async function confirmedRefunds(row,charge){let cents=0,pending=false,review=false,count=0;
    for await(const value of client.refunds.list({charge:charge.id,limit:100})){
      if(++count>1000||idOf(value.charge)!==charge.id)throw Error('refund_total_review_required');
      const proof=refundProof(value,row);if(proof.status==='succeeded')cents+=proof.amount;
      else if(proof.status==='pending')pending=true;else review=true;
    }
    if(cents>row.quote.totalCents)throw Error('refund_total_review_required');
    return {refundCents:cents,refundPending:pending,refundNeedsReview:review&&cents<row.quote.totalCents};
  }
  function link(s){let u;try{u=new URL(s.url);}catch{throw Error('payment_link_unavailable');}if(u.origin!=='https://checkout.stripe.com'||u.username||u.password||!u.pathname.includes(s.id))throw Error('payment_destination_refused');return {id:s.id,url:u.href};}
  return {
    verifyAccount,client,crm,
    verifyEvent(raw,signature){let e;try{e=client.webhooks.constructEvent(raw,signature,config.webhookSecret);}catch{throw new CheckoutError('Invalid payment event signature.',400);}
      if(e.livemode!==live||(e.account&&e.account!==config.account))throw new CheckoutError('Payment event environment mismatch.',400);return e;},
    async create(row) {
      await verifyAccount();const q=row.quote,c=row.contact;
      const suffix=[...createHash('sha256').update(row.id).digest().subarray(0,8)].map(v=>String.fromCharCode(97+v%26)).join('');
      const items=[{price_data:{currency:'usd',product_data:{name:`${q.label} of firewood — delivery included`},unit_amount:q.woodCents},quantity:1}];
      if(q.stacking)items.push({price_data:{currency:'usd',product_data:{name:'Stacking — once per delivery'},unit_amount:q.stackingCents},quantity:1});
      const params={mode:'payment',success_url:config.origin+'/firewood/checkout/result/',cancel_url:config.origin+'/firewood/checkout/?canceled=1',
        customer_email:c.email,client_reference_id:row.id,metadata:metadata(row),integration_identifier:`firewood-candidate-${suffix}`,
        line_items:items,automatic_tax:{enabled:false},allow_promotion_codes:false,
        payment_intent_data:{metadata:metadata(row),shipping:{name:c.name,phone:c.phone,address:{line1:c.address,line2:c.address2,city:c.city,state:c.state,postal_code:c.postal,country:'US'}}}};
      const s=checkSession(await client.checkout.sessions.create(params,{idempotencyKey:'fw-create-'+row.id}),row);return link(s);
    },
    async state(row){const s=await retrieve(row);return {paid:s.status==='complete'&&s.payment_status==='paid',expired:s.status==='expired',processing:s.status==='complete'&&s.payment_status!=='paid',
      intent:typeof s.payment_intent==='string'?s.payment_intent:s.payment_intent?.id,url:s.url};},
    async link(row){return link(await retrieve(row));},
    async expire(row){await retrieve(row);await client.checkout.sessions.expire(row.payment_id,{},{idempotencyKey:'fw-expire-'+row.id});},
    async refund(row,job){await verifyAccount();const pi=await client.paymentIntents.retrieve(row.payment_intent);
      if(pi.livemode!==live||pi.id!==row.payment_intent||pi.amount!==row.quote.totalCents||pi.currency!=='usd'||Object.entries(metadata(row)).some(([k,v])=>pi.metadata?.[k]!==v))throw Error('refund_order_binding_mismatch');
      const value=await client.refunds.create({payment_intent:pi.id,amount:job.amount,metadata:{...metadata(row),operation:job.id}},{idempotencyKey:'fw-refund-'+job.id});
      return refundProof(value,row,job);},
    async refundState(row,job){await verifyAccount();if(!/^re_[A-Za-z0-9]+$/u.test(job.provider_id??''))throw Error('refund_order_binding_mismatch');return refundProof(await client.refunds.retrieve(job.provider_id),row,job);},
    async lifecycleOrder(event){await verifyAccount();let pi=event.data.object.payment_intent;
      if(!pi&&event.data.object.charge){const ch=await client.charges.retrieve(event.data.object.charge);pi=ch.payment_intent;}
      if(!pi)return null;const value=await client.paymentIntents.retrieve(pi);
      if(value.livemode!==live||value.metadata?.purpose!==purpose||value.metadata?.environment!==config.mode)return null;
      return {id:value.metadata.order,intent:value.id};},
    async lifecycle(event,row){await verifyAccount();const obj=event.data.object;
      const charge=await client.charges.retrieve(event.type==='charge.refunded'?obj.id:typeof obj.charge==='string'?obj.charge:obj.charge?.id);
      if(charge.livemode!==live||charge.payment_intent!==row.payment_intent||charge.amount!==row.quote.totalCents||charge.currency!=='usd')throw Error('lifecycle_order_binding_mismatch');
      if(event.type==='charge.refunded')return confirmedRefunds(row,charge);
      const dispute=await client.disputes.retrieve(obj.id);
      if(dispute.livemode!==live||dispute.charge!==charge.id)throw Error('dispute_order_binding_mismatch');
      return {disputed:!['won','warning_closed'].includes(dispute.status),disputeId:dispute.id};
    }
  };
}
