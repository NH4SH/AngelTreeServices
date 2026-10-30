import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalog, validateOrder, testKey, stripeAdapter, CheckoutError } from './model.mjs';
import { openOrderStore, defaultDataDirectory } from './store.mjs';
import { crmTestConfig, createCrmClient } from './crm.mjs';
import { remoteOrderStore } from './hosted/remote-store.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const source = fileURLToPath(new URL('./', import.meta.url));
const TTL = 30 * 60 * 1000;
const token = () => randomBytes(24).toString('hex');
const fingerprintOrder = order => JSON.stringify({ quote: Object.entries(order.quote).sort(), contact: Object.entries(order.contact).sort() });
const htmlEscape = value => String(value).replace(/[&<>"']/gu, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const type = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.avif': 'image/avif', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };

export function createCheckoutServer({ key = '', webhookSecret = '', adapter, crm = null, store: suppliedStore, dataDirectory, now = Date.now, siteDir = resolve(root, 'dist-public') } = {}) {
  const secret = testKey(key);
  const provider = adapter ?? (secret ? stripeAdapter(secret) : null);
  if (crm && !provider) throw new Error('The CRM test connection requires a dedicated Stripe test provider, not the local payment simulator.');
  const sessions = new Map();
  const pending = new Map();
  const sessionLoads = new Map();
  let store = suppliedStore;
  let maintenance;
  const sweep = setInterval(() => {
    purge();
    if (store && !maintenance) maintenance = Promise.all([store.drain(), store.drainCrm(crm)]).catch(() => {}).finally(() => { maintenance = null; });
  }, 1000);
  sweep.unref();
  let expectedHost;
  const security = {
    'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  };
  function purge() { for (const [id, value] of sessions) if (now() > value.expires) sessions.delete(id); }
  function send(res, status, data, extra = {}) {
    res.writeHead(status, { ...security, 'Content-Type': 'application/json; charset=utf-8', ...extra });
    res.end(JSON.stringify(data));
  }
  async function getSession(req, res) {
    purge();
    const id = /(?:^|;\s*)ats_firewood_test=([a-f0-9]{48})(?:;|$)/u.exec(req.headers.cookie ?? '')?.[1];
    if (id && !sessions.has(id)) {
      if (!sessionLoads.has(id)) sessionLoads.set(id, (async () => {
        const saved = await store.session(id);
        if (saved) {
          const record = saved.attempt ? await store.attempt(saved.attempt) : null;
          if (record) {
            saved.order = { quote: record.quote, contact: record.contact };
            saved.fingerprint = fingerprintOrder(saved.order);
            saved.payment = record.payment_id ? { id: record.payment_id, url: record.payment_url } : null;
            if (record.status === 'paid') adoptReceipt(saved, receiptFor(record));
          }
          sessions.set(id, saved);
        }
      })().finally(() => sessionLoads.delete(id)));
      await sessionLoads.get(id);
    }
    if (id && sessions.has(id)) return [id, sessions.get(id)];
    if (sessions.size >= 100) throw new CheckoutError('The local test is busy. Restart it to clear expired orders.', 503);
    const nextId = token();
    const data = { csrf: token(), expires: now() + TTL, status: 'draft', order: null, payment: null, attempt: null };
    await store.createSession(nextId, data);
    sessions.set(nextId, data);
    res.setHeader('Set-Cookie', `ats_firewood_test=${nextId}; HttpOnly; SameSite=Strict; Path=/firewood/checkout/; Max-Age=1800`);
    // Lax is required only for returning from Stripe's hosted payment page.
    if (provider) res.setHeader('Set-Cookie', `ats_firewood_test=${nextId}; HttpOnly; SameSite=Lax; Path=/firewood/checkout/; Max-Age=1800`);
    return [nextId, data];
  }
  async function rawBody(req, limit, message) {
    const chunks = [];
    let length = 0;
    for await (const chunk of req) {
      length += chunk.length;
      if (length > limit) throw new CheckoutError(message, 413);
      chunks.push(chunk);
    }
    return Buffer.concat(chunks, length);
  }
  async function body(req) {
    if (req.headers['content-type'] !== 'application/json') throw new CheckoutError('Send a JSON test order.', 415);
    const data = await rawBody(req, 12000, 'The order is too long.');
    try {
      const input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data));
      if (!input || Array.isArray(input) || typeof input !== 'object') throw new Error();
      return input;
    } catch { throw new CheckoutError('The test order could not be read.'); }
  }
  function verifyCsrf(input, session) {
    if (typeof input.csrf !== 'string' || input.csrf.length !== session.csrf.length ||
        !timingSafeEqual(Buffer.from(input.csrf), Buffer.from(session.csrf))) {
      throw new CheckoutError('This test session expired. Reload the checkout and try again.', 403);
    }
  }
  const receiptFor = record => ({ ...record.quote, orderNumber: record.order_number, confirmedBy: record.confirmed_by });
  function adoptReceipt(session, receipt) {
    session.receipt = receipt;
    session.order = null;
    session.fingerprint = null;
    session.attempt = null;
    session.payment = null;
    session.status = 'paid';
  }
  async function complete(session, id, source, proof = null) {
    const { order, payment, attempt } = session;
    const receipt = await store.confirm(attempt, payment.id, source, null, proof);
    if (sessions.get(id) === session && session.order === order && session.payment === payment && session.attempt === attempt) {
      adoptReceipt(session, receipt);
      await store.saveSession(id, session);
    }
    await store.drain();
  }
  async function verifyPaid(session, id, source) {
    const order = session.order, payment = session.payment, attempt = session.attempt;
    if (session.status !== 'pending' || !order || !payment) return;
    const record = await store.attempt(attempt);
    const proof = record.crm_binding
      ? await provider.state(payment.id, order.quote.totalCents, record.crm_binding.reference, attempt, record.crm_binding)
      : { paid: await provider.paid(payment.id, order.quote.totalCents, id, attempt) };
    if (proof.paid) {
      const receipt = await store.confirm(attempt, payment.id, source, null, proof);
      if (sessions.get(id) === session && session.status === 'pending' && session.order === order && session.payment === payment && session.attempt === attempt) {
        adoptReceipt(session, receipt);
        await store.saveSession(id, session);
      }
      await store.drain();
    }
  }
  const server = createServer(async (req, res) => {
    try {
      if (!expectedHost || req.headers.host !== expectedHost) return send(res, 403, { error: 'Only the original loopback preview address is allowed.' });
      const origin = `http://${expectedHost}`;
      const url = new URL(req.url, origin);
      const checkout = url.pathname.startsWith('/firewood/checkout/');
      if (url.pathname === '/firewood/checkout/webhook') {
        if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed.' }, { Allow: 'POST' });
        if (!provider?.verifyEvent || !webhookSecret) throw new CheckoutError('The local test webhook is not configured.', 503);
        const payload = await rawBody(req, 256000, 'Test event is too large.');
        const event = provider.verifyEvent(payload, req.headers['stripe-signature'], webhookSecret);
        if (/^(charge\.refunded|refund\.(created|updated|failed)|charge\.refund\.updated|charge\.dispute\.(created|updated|closed|funds_withdrawn|funds_reinstated))$/u.test(event.type)) {
          const intent = event.data?.object?.payment_intent;
          await store.refreshCrm(typeof intent === 'string' ? intent : intent?.id);
          return send(res, 200, { received: true });
        }
        if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) return send(res, 200, { received: true });
        const object = event.data?.object;
        if (!object || object.livemode !== false || !/^cs_test_/u.test(object.id) || object.payment_status !== 'paid' ||
            object.metadata?.purpose !== 'firewood_test_only') return send(res, 200, { received: true });
        const reference = object.client_reference_id, attempt = object.metadata.attempt;
        if (typeof attempt !== 'string' || typeof reference !== 'string') return send(res, 200, { received: true });
        const record = await store.attempt(attempt);
        const expected = record?.crm_binding?.reference ?? record?.reference;
        if (record && expected === reference && (!record.payment_id || record.payment_id === object.id)) {
          const proof = record.crm_binding
            ? await provider.state(object.id, record.quote.totalCents, reference, attempt, record.crm_binding)
            : { paid: await provider.paid(object.id, record.quote.totalCents, reference, attempt) };
          if (proof.paid) {
            if (!record.payment_id) await store.bindPayment(attempt, { id: object.id, url: null });
            const receipt = await store.confirm(attempt, object.id, 'webhook', event.id, proof);
            const session = sessions.get(record.reference);
            if (session?.attempt === attempt) { adoptReceipt(session, receipt); await store.saveSession(record.reference, session); }
            await store.drain();
          }
        }
        return send(res, 200, { received: true });
      }
      if (checkout && req.method === 'POST' && req.headers.origin !== origin) return send(res, 403, { error: 'Use the local checkout to send this request.' });
      if (checkout && url.pathname.startsWith('/firewood/checkout/api/')) {
        const [id, session] = await getSession(req, res);
        if (req.method === 'GET' && url.pathname === '/firewood/checkout/api/state') {
          if (url.searchParams.get('verify') === '1' && provider && session.status === 'pending' && session.payment && session.order) {
            // Another tab may change the selection while the provider read is in flight.
            // Only the exact order/payment pair that was checked may be completed.
            await verifyPaid(session, id, 'return-verification');
          }
          let sync = null;
          if (session.receipt) {
            const record = await store.findOrder(session.receipt.orderNumber);
            if (record?.reference === id && record.crm_binding) {
              const value = await store.crmSync(record.id);
              sync = value ? { status: value.status, invoiceNumber: value.receipt?.invoice_number ?? null } : { status: 'pending', invoiceNumber: null };
            }
          }
          return send(res, 200, { crm: sync, csrf: session.csrf, catalog, processor: provider ? 'stripe-test' : 'local-simulator',
            confirmationMode: store.confirmationMode ?? 'local-capture', storageLocation: store.storageLocation ?? 'local',
            status: session.status, order: session.order, receipt: session.receipt ?? null });
        }
        if (req.method === 'GET' && url.pathname === '/firewood/checkout/api/confirmation') {
          if (session.status !== 'paid' || !session.receipt) throw new CheckoutError('Complete this test order to view its confirmation.', 403);
          const record = await store.findOrder(session.receipt.orderNumber);
          if (!record || record.reference !== id) throw new CheckoutError('This confirmation is unavailable.', 403);
          const messages = await store.confirmations(record.id);
          const customer = messages.find(message => message.audience === 'customer');
          return send(res, 200, { confirmation: customer?.message ?? null, status: customer?.status ?? 'pending' });
        }
        if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed.' }, { Allow: 'POST' });
        const input = await body(req);
        verifyCsrf(input, session);
        if (url.pathname === '/firewood/checkout/api/start') {
          if (session.status === 'paid') throw new CheckoutError('This test is complete. Start another test order.', 409);
          const order = validateOrder(input);
          // Changed quantities or contact details create a new attempt; identical retries reuse it.
          const fingerprint = fingerprintOrder(order);
          if (pending.has(id) && session.fingerprint !== fingerprint) {
            throw new CheckoutError('The test payment is opening. Please wait before changing your order.', 409);
          }
          if (session.fingerprint !== fingerprint) {
            session.order = order; session.fingerprint = fingerprint;
            session.attempt = token(); session.payment = null; session.status = 'draft';
          }
          if (!pending.has(id)) pending.set(id, (async () => {
            let record = await store.createAttempt(session.attempt, id, order, crm?.config);
            await store.saveSession(id, session);
            if (session.payment && provider?.state) {
              const payment = session.payment, attempt = session.attempt;
              const state = await provider.state(payment.id, order.quote.totalCents, record.crm_binding?.reference ?? id, attempt, record.crm_binding);
              if (session.status === 'paid') return { next: '/firewood/checkout/result/' };
              if (session.payment !== payment || session.attempt !== attempt) throw new CheckoutError('The test order changed. Please try again.', 409);
              if (state.paid) { await complete(session, id, 'retry-verification', state); return { next: '/firewood/checkout/result/' }; }
              if (state.closed) throw new CheckoutError('This test payment is still processing. Wait for confirmation before trying again.', 409);
              if (state.expired) {
                session.attempt = token(); session.payment = null; session.status = 'draft';
                record = await store.createAttempt(session.attempt, id, order, crm?.config);
                await store.saveSession(id, session);
              }
            }
            if (!session.payment) {
              const creatingAttempt = session.attempt;
              const payment = provider ? await provider.create(order, origin, record.crm_binding?.reference ?? id, creatingAttempt, record.crm_binding) : { id: `local_${token()}`, url: '/firewood/checkout/payment/' };
              await store.bindPayment(creatingAttempt, payment);
              // Webhook fulfillment may already have completed this attempt.
              const saved = await store.attempt(creatingAttempt);
              if (saved.status === 'paid') adoptReceipt(session, receiptFor(saved));
              else session.payment = payment;
            }
            if (session.status === 'paid') return { next: '/firewood/checkout/result/' };
            session.status = 'pending';
            await store.saveSession(id, session);
            // Keep the setup lock through the final save. A webhook can finish
            // during that save and clear payment while this request is waiting.
            return { next: session.status === 'paid' ? '/firewood/checkout/result/' : session.payment.url };
          })().finally(() => pending.delete(id)));
          return send(res, 200, await pending.get(id));
        }
        if (url.pathname === '/firewood/checkout/api/simulate') {
          if (provider) throw new CheckoutError('Local simulation is disabled for Stripe test sessions.', 403);
          if (session.status !== 'pending' || !session.order) throw new CheckoutError('Start a test order first.', 409);
          if (input.outcome === 'decline') return send(res, 200, { declined: true });
          if (input.outcome !== 'success') throw new CheckoutError('Unknown test outcome.');
          await complete(session, id, 'local-simulator');
          return send(res, 200, { next: '/firewood/checkout/result/' });
        }
        if (url.pathname === '/firewood/checkout/api/reset') {
          if (pending.has(id)) throw new CheckoutError('Wait for the test payment step to finish loading.', 409);
          await store.forgetSession(id);
          sessions.delete(id);
          res.setHeader('Set-Cookie', 'ats_firewood_test=; HttpOnly; SameSite=Lax; Path=/firewood/checkout/; Max-Age=0');
          return send(res, 200, { ok: true });
        }
        return send(res, 404, { error: 'Test endpoint not found.' });
      }
      if (!['GET', 'HEAD'].includes(req.method)) return send(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET, HEAD' });
      if (checkout) {
        const pages = ['/firewood/checkout/', '/firewood/checkout/payment/', '/firewood/checkout/result/'];
        const asset = { '/firewood/checkout/checkout.css': 'checkout.css', '/firewood/checkout/checkout.js': 'checkout.js', '/firewood/checkout/enlarged.css': 'enlarged.css' }[url.pathname];
        if (!pages.includes(url.pathname) && !asset) return send(res, 404, { error: 'Page not found.' });
        res.writeHead(200, { ...security, 'Content-Type': type[extname(asset ?? 'checkout.html')] });
        let content = await readFile(resolve(source, asset ?? 'checkout.html'));
        if (!asset && url.searchParams.get('text') === '200') content = Buffer.from(content.toString().replace('</head>', '<link rel="stylesheet" href="/firewood/checkout/enlarged.css"></head>'));
        return res.end(req.method === 'HEAD' ? '' : content);
      }
      // Existing site preview. Never forward a request to the live website or CRM.
      let relative;
      try { relative = decodeURIComponent(url.pathname); } catch { return send(res, 400, { error: 'Invalid path.' }); }
      let path = resolve(siteDir, `.${relative}`);
      if (path !== siteDir && !path.startsWith(siteDir + sep)) return send(res, 404, { error: 'Page not found.' });
      if (relative.endsWith('/')) path = resolve(path, 'index.html');
      let data;
      try { data = await readFile(path); } catch { return send(res, 404, { error: 'Page not found.' }); }
      if (url.pathname === '/firewood/') {
        data = Buffer.from(data.toString().replace(
          '<h2 id="firewood-prices">Delivered prices</h2>',
          '<h2 id="firewood-prices">Delivered prices</h2><p><a class="ats-button ats-button--green" href="/firewood/checkout/">Try the test checkout</a></p>',
        ));
      }
      res.writeHead(200, { ...security, 'Content-Type': type[extname(path)] ?? 'application/octet-stream' });
      res.end(req.method === 'HEAD' ? '' : data);
    } catch (error) {
      if (!res.headersSent) send(res, error instanceof CheckoutError ? error.status : 500, {
        error: error instanceof CheckoutError ? error.message : 'The test checkout could not verify this step. Your payment may still be processing; reload to check before trying again.',
        field: error instanceof CheckoutError ? error.field : null,
      }); else res.end();
    }
  });
  return {
    server,
    get store() { return store; },
    async flushCrm() { await store.drainCrm(crm); },
    async listen(port = 0) {
      store ??= await openOrderStore({ directory: dataDirectory, now });
      await store.purgeSessions();
      await store.drain();
      await new Promise((yes, no) => { server.once('error', no); server.listen(port, '127.0.0.1', yes); });
      expectedHost = `127.0.0.1:${server.address().port}`;
      return `http://${expectedHost}`;
    },
    async close() { clearInterval(sweep); sessions.clear(); server.closeAllConnections(); await new Promise(yes => server.close(yes)); if (maintenance) await maintenance; await store?.close(); },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const crmConfig = crmTestConfig(process.env);
  const hosted = process.env.FIREWOOD_HOSTED_TEST_STORAGE === '1';
  if (hosted && crmConfig) throw new Error('Hosted storage testing leaves CRM disabled. Use the separate local CRM test configuration for its tests.');
  if (hosted && !process.env.FIREWOOD_STRIPE_TEST_SECRET_KEY) throw new Error('Hosted test storage requires Stripe test payments; simulated payments are refused.');
  const store = hosted ? remoteOrderStore({ origin: process.env.FIREWOOD_TEST_STORAGE_ORIGIN, token: process.env.FIREWOOD_TEST_STORAGE_TOKEN }) : undefined;
  const instance = createCheckoutServer({ store, crm: crmConfig ? createCrmClient(crmConfig) : null, key: process.env.FIREWOOD_STRIPE_TEST_SECRET_KEY ?? '', webhookSecret: process.env.FIREWOOD_STRIPE_TEST_WEBHOOK_SECRET ?? '', dataDirectory: defaultDataDirectory });
  const origin = await instance.listen(Number(process.env.FIREWOOD_TEST_PORT ?? 55821));
  console.log(`Local-only Firewood checkout: ${htmlEscape(origin)}/firewood/checkout/`);
  console.log(hosted ? 'Isolated hosted test storage. Controlled confirmation copies can go only to the owner.' : 'Test orders and confirmation previews are saved privately on this Mac. No email is sent.');
  console.log(process.env.FIREWOOD_STRIPE_TEST_SECRET_KEY ? 'Dedicated Stripe TEST mode. Use synthetic details only.' : 'Local payment simulator. Stripe has not been contacted.');
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await instance.close(); process.exit(0); });
}
