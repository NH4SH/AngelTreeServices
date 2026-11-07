import { functionHeaders, requireTestRuntime } from './runtime.mjs';

export function testWebhookHandler({ env, siteId, runtime, provider, verifyAccount, validateRuntime = requireTestRuntime }) {
  const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: functionHeaders });
  return async request => {
    try { validateRuntime(env, siteId); } catch { return reply({error:'Test webhook disabled.'},503); }
    if (request.method !== 'POST') return reply({error:'Method not allowed.'},405);
    if (!/^whsec_[A-Za-z0-9]+$/u.test(env.FIREWOOD_HOSTED_TEST_WEBHOOK_SECRET ?? '')) return reply({error:'Test webhook not configured.'},503);
    const chunks=[];let size=0;
    try {
      const reader=request.body?.getReader();if(!reader)return reply({error:'Missing event.'},400);
      for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>256000){await reader.cancel();return reply({error:'Event too large.'},413);}chunks.push(value);}
    } catch { return reply({error:'Invalid event.'},400); }
    let event;
    try { event=provider.verifyEvent(Buffer.concat(chunks),request.headers.get('stripe-signature'),env.FIREWOOD_HOSTED_TEST_WEBHOOK_SECRET); }
    catch { return reply({error:'Invalid test signature.'},400); }
    if(event.livemode!==false)return reply({error:'Live events refused.'},400);
    if(!['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type))return reply({received:true});
    const object=event.data?.object;
    if(object?.livemode!==false || object?.metadata?.purpose!=='firewood_test_only' || object?.payment_status!=='paid')return reply({received:true});
    const attempt=object.metadata.attempt;
    if(!/^[a-f0-9]{48}$/u.test(attempt ?? '') || !/^cs_test_[A-Za-z0-9_]+$/u.test(object.id ?? ''))return reply({received:true});
    try {
      await verifyAccount();
      const {store}=await runtime();const record=await store.attempt(attempt);
      if(!record || record.crm_binding || record.reference!==object.client_reference_id || (record.payment_id && record.payment_id!==object.id))return reply({received:true});
      const proof=await provider.state(object.id,record.quote.totalCents,record.reference,attempt);
      if(proof.paid){
        await store.bindPayment(attempt,{id:object.id,url:record.payment_url});
        await store.confirm(attempt,object.id,'webhook',event.id,proof);
      }
      return reply({received:true});
    } catch { return reply({error:'Test event processing is pending. Retry this event.'},503); }
  };
}
