import { timingSafeEqual } from 'node:crypto';
import Stripe from 'stripe';
import { validateOrder, STRIPE_API_VERSION, stripeAdapter } from '../model.mjs';
import { requireTestRuntime, TEST_ACCOUNT_ID, functionHeaders } from './runtime.mjs';

const ID = /^[a-f0-9]{48}$/u;
const methods = new Set(['session','createSession','saveSession','forgetSession','purgeSessions','createAttempt','attempt','bindPayment','confirm','confirmations','findOrder','orders','drain','drainCrm','crmSync','refreshCrm','retryCrm','work','summary']);
const reply = (data, status = 200) => new Response(JSON.stringify(data ?? null), { status, headers: functionHeaders });
const fail = () => { throw new Error('invalid_test_storage_request'); };

export function storageHandler({ env, siteId, runtime, provider, verifyAccount, validateRuntime = requireTestRuntime } = {}) {
  return async request => {
    try { validateRuntime(env, siteId); } catch { return reply({ error: 'Test storage is disabled.' }, 503); }
    if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405);
    const auth = request.headers.get('authorization') ?? '';
    const expected = `Bearer ${env.FIREWOOD_TEST_STORAGE_TOKEN}`;
    const givenBytes = Buffer.from(auth), expectedBytes = Buffer.from(expected);
    if (request.headers.has('origin') || givenBytes.length !== expectedBytes.length || !timingSafeEqual(givenBytes, expectedBytes)) return reply({ error: 'Unauthorized.' }, 401);
    try {
      if (request.headers.get('content-type') !== 'application/json') return reply({ error: 'JSON required.' }, 415);
      // Bound streamed input as well as the Content-Length header.
      const reader = request.body?.getReader(); const chunks = []; let size = 0;
      if (!reader) fail();
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 16000) { await reader.cancel(); return reply({ error: 'Request too large.' }, 413); }
        chunks.push(value);
      }
      const { method, args = [] } = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
      if (!methods.has(method) || !Array.isArray(args) || args.length > 5) fail();
      const { store, work } = await runtime();
      if (['drainCrm','crmSync','refreshCrm','retryCrm'].includes(method)) return reply(null); // No remote CRM route exists.
      if (method === 'drain') return reply(null); // Scheduled worker owns controlled sends.
      if (method === 'work') return reply(await work());
      if (method === 'summary') {
        return reply(await store.summary());
      }
      if (!['purgeSessions','orders','findOrder'].includes(method) && !ID.test(args[0] ?? '')) fail();
      if (method === 'createAttempt') {
        const [id, reference, order, binding] = args;
        if (!ID.test(reference ?? '') || binding != null || !order?.contact?.email?.endsWith('.invalid')) fail();
        const checked = validateOrder({ ...order.contact, quantity: order.quote?.quantity, stacking: order.quote?.stacking });
        if (JSON.stringify(checked) !== JSON.stringify(order)) fail();
        return reply(await store.createAttempt(id, reference, checked));
      }
      if (['createSession','saveSession'].includes(method)) {
        const data = args[1];
        if (!ID.test(data?.csrf ?? '') || !Number.isSafeInteger(data.expires) || data.expires > Date.now()+31*60000 || !['draft','pending','paid'].includes(data.status)) fail();
      }
      if (method === 'findOrder' && !/^FW-TEST-[A-F0-9]{16}$/u.test(args[0] ?? '')) fail();
      if (method === 'bindPayment' || method === 'confirm') {
        const record = await store.attempt(args[0]);
        if (!record || record.crm_binding) fail();
        const paymentId = method === 'confirm' ? args[1] : args[1]?.id;
        if (!/^cs_test_[A-Za-z0-9_]+$/u.test(paymentId ?? '')) fail();
        await verifyAccount();
        const proof = await provider.state(paymentId, record.quote.totalCents, record.reference, record.id);
        if (method === 'bindPayment') {
          if (args[1]?.url) { const url = new URL(args[1].url); if (url.origin !== 'https://checkout.stripe.com' || !url.pathname.includes('/cs_test_')) fail(); }
        } else {
          if (!proof.paid || !['webhook','return-verification','retry-verification'].includes(args[2])) fail();
          return reply(await store.confirm(record.id, paymentId, args[2], args[3] ?? null, proof));
        }
      }
      return reply(await store[method](...args));
    } catch { return reply({ error: 'The isolated test operation could not be verified.' }, 422); }
  };
}

export function stripeVerifier(env) {
  const stripe = new Stripe(env.FIREWOOD_STRIPE_TEST_SECRET_KEY, { apiVersion: STRIPE_API_VERSION, timeout: 8000, maxNetworkRetries: 0 });
  return { provider: stripeAdapter(env.FIREWOOD_STRIPE_TEST_SECRET_KEY), async verifyAccount() {
    if ((await stripe.accounts.retrieve()).id !== TEST_ACCOUNT_ID) fail();
  } };
}
