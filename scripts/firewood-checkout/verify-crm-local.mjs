// Opt-in integration harness: actual Website + optimized CRM HTTP route + fresh
// local Supabase, with a synthetic Stripe HTTP service. No hosted DB or email.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, openSync, closeSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import Stripe from 'stripe';
import { createCheckoutServer } from './server.mjs';
import { stripeAdapter } from './model.mjs';
import { createCrmClient, CRM_PATH } from './crm.mjs';

const out = process.env.FIREWOOD_CRM_LOCAL_EVIDENCE_DIR;
const crmRoot = process.env.FIREWOOD_CRM_SOURCE_ROOT;
const buildRoot = process.env.FIREWOOD_CRM_BUILD_ROOT;
assert.ok(out?.startsWith('/Users/noelsierra/Documents/Codex/'));
assert.ok(crmRoot && buildRoot);
const environment = JSON.parse(readFileSync(out + '/environment.json'));
const status = JSON.parse(readFileSync(out + '/status.private.json'));
assert.equal(environment.createdThisTask, true);
assert.match(environment.projectId, /^ats_fwimport_[a-f0-9]{12}$/u);
assert.equal(status.API_URL, 'http://127.0.0.1:61221');
assert.equal(new URL(status.DB_URL).port, '61222');
const partnerContract = await import(
  pathToFileURL(crmRoot + '/apps/platform/src/lib/firewood/import-contract.ts')
);
const node = process.env.FIREWOOD_CRM_NODE ?? process.execPath;
const docker = '/Users/noelsierra/.local/opt/docker-pr02/docker/docker';
function sql(query) {
  const r = spawnSync(
    docker,
    [
      '--host',
      'unix:///Users/noelsierra/.lima/pr02-disposable/sock/docker.sock',
      'exec',
      '-i',
      environment.container,
      'psql',
      '-X',
      '-qAt',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'postgres',
      '-d',
      'postgres',
    ],
    { input: query, encoding: 'utf8', timeout: 15000 },
  );
  if (r.status !== 0) {
    writeFileSync(out + '/e2e-db-error.private.log', r.stderr, { mode: 0o600 });
    throw new Error('Isolated test database check failed.');
  }
  return r.stdout.trim();
}
const q = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const counts = () =>
  JSON.parse(
    sql(
      "select json_build_object('invoices',(select count(*)from public.invoices),'payments',(select count(*)from public.payments),'jobs',(select count(*)from public.jobs),'outbound',(select count(*)from app_private.outbound_deliveries),'communications',(select count(*)from public.customer_communications))",
    ),
  );
const before = counts();
sql(
  `insert into app_private.firewood_test_sources(id,stripe_account_id,environment_id,enabled) values('website_local_test','acct_localSynthetic',${q(environment.projectId)},true) ON CONFLICT(id) DO UPDATE SET enabled=true WHERE app_private.firewood_test_sources.stripe_account_id='acct_localSynthetic' AND app_private.firewood_test_sources.environment_id=${q(environment.projectId)};`,
);

const sessions = new Map();
const providerCalls = [];
const fakeProvider = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://local.invalid');
  if (
    process.env.FIREWOOD_CRM_KEEP_PREVIEW === '1' &&
    /^\/pay\/cs_test_[A-Za-z0-9_]+$/u.test(url.pathname)
  ) {
    const id = url.pathname.split('/').at(-1),
      entry = sessions.get(id);
    if (!entry) return res.writeHead(404).end();
    if (req.method === 'POST') {
      if (req.headers.origin !== providerOrigin)
        return res.writeHead(403).end();
      entry.session.status = 'complete';
      entry.session.payment_status = 'paid';
      Object.assign(entry.intent, {
        status: 'succeeded',
        amount_received: entry.session.amount_total,
      });
      Object.assign(entry.intent.latest_charge, {
        status: 'succeeded',
        amount_captured: entry.session.amount_total,
        paid: true,
        captured: true,
      });
      await event({ provider: entry });
      await website.flushCrm();
      return res
        .writeHead(303, { Location: origin + '/firewood/checkout/result/' })
        .end();
    }
    return res
      .writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex',
      })
      .end(
        '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic payment fixture</title><body style="font:18px/1.6 system-ui;padding:32px;max-width:650px"><h1>Synthetic payment test</h1><p>This local fixture does not contact Stripe, charge money or send email.</p><p>Test total: $' +
          entry.session.amount_total / 100 +
          '</p><form method="post"><button style="font:inherit;min-height:54px;padding:12px 20px">Complete synthetic test payment</button></form></body></html>',
      );
  }
  providerCalls.push({ method: req.method, path: url.pathname });
  let value;
  if (url.pathname === '/v1/account' && req.method === 'GET')
    value = { id: 'acct_localSynthetic', object: 'account' };
  if (url.pathname === '/v1/checkout/sessions' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const params = new URLSearchParams(body);
    const metadata = {};
    const intentMetadata = {};
    for (const [key, data] of params) {
      const sessionKey = /^metadata\[(.+)\]$/u.exec(key);
      if (sessionKey) metadata[sessionKey[1]] = data;
      const intentKey = /^payment_intent_data\[metadata\]\[(.+)\]$/u.exec(key);
      if (intentKey) intentMetadata[intentKey[1]] = data;
    }
    const tag = randomUUID().replaceAll('-', ''),
      id = 'cs_test_' + tag,
      intentId = 'pi_' + tag,
      chargeId = 'ch_' + tag;
    const lines = [];
    for (let i = 0; params.has(`line_items[${i}][quantity]`); i++) {
      const cents = Number(
        params.get(`line_items[${i}][price_data][unit_amount]`),
      );
      lines.push({
        quantity: Number(params.get(`line_items[${i}][quantity]`)),
        currency: 'usd',
        amount_subtotal: cents,
        amount_total: cents,
        amount_discount: 0,
        amount_tax: 0,
        price: {
          unit_amount: cents,
          product: {
            name: params.get(
              `line_items[${i}][price_data][product_data][name]`,
            ),
          },
        },
      });
    }
    const total = lines.reduce(
      (sum, line) => sum + line.amount_total * line.quantity,
      0,
    );
    const shipping = {
      name: params.get('payment_intent_data[shipping][name]'),
      phone: params.get('payment_intent_data[shipping][phone]'),
      address: {},
    };
    for (const key of [
      'line1',
      'line2',
      'city',
      'state',
      'postal_code',
      'country',
    ])
      shipping.address[key] =
        params.get(`payment_intent_data[shipping][address][${key}]`) ?? '';
    const session = {
      id,
      object: 'checkout.session',
      livemode: false,
      mode: 'payment',
      status: 'open',
      payment_status: 'unpaid',
      metadata,
      client_reference_id: params.get('client_reference_id'),
      url: 'https://checkout.stripe.com/c/pay/' + id,
      amount_total: total,
      amount_subtotal: total,
      currency: 'usd',
      customer_details: { email: params.get('customer_email') },
      payment_intent: intentId,
      total_details: { amount_discount: 0, amount_shipping: 0, amount_tax: 0 },
      automatic_tax: { enabled: false },
      line_items: { data: lines, has_more: false },
    };
    const intent = {
      id: intentId,
      livemode: false,
      currency: 'usd',
      amount: total,
      amount_received: 0,
      status: 'requires_payment_method',
      metadata: intentMetadata,
      shipping,
      latest_charge: {
        id: chargeId,
        livemode: false,
        payment_intent: intentId,
        amount: total,
        amount_captured: 0,
        currency: 'usd',
        paid: false,
        captured: false,
        status: 'pending',
        created: Math.floor(Date.now() / 1000),
        amount_refunded: 0,
        disputed: false,
      },
    };
    sessions.set(id, { session, intent, refunds: [], disputes: [] });
    value = session;
  }
  if (req.method === 'GET')
    for (const record of sessions.values()) {
      if (url.pathname === '/v1/checkout/sessions/' + record.session.id)
        value = record.session;
      if (url.pathname === '/v1/payment_intents/' + record.intent.id)
        value = record.intent;
      if (
        url.searchParams.get('charge') === record.intent.latest_charge.id &&
        ['/v1/refunds', '/v1/disputes'].includes(url.pathname)
      )
        value = {
          object: 'list',
          data:
            url.pathname === '/v1/refunds' ? record.refunds : record.disputes,
          has_more: false,
        };
    }
  res.setHeader('Content-Type', 'application/json');
  res.writeHead(value ? 200 : 503);
  res.end(
    JSON.stringify(
      value ?? {
        error: { type: 'api_error', message: 'Synthetic provider unavailable' },
      },
    ),
  );
});
await new Promise((yes) => fakeProvider.listen(0, '127.0.0.1', yes));
const providerOrigin = 'http://127.0.0.1:' + fakeProvider.address().port;
const appPort = 3198,
  crmOrigin = 'http://127.0.0.1:' + appPort;
const secret = randomUUID() + randomUUID(),
  signingSecret = 'whsec_syntheticWebsiteTest';
const config = {
  origin: crmOrigin,
  sourceId: 'website_local_test',
  accountId: 'acct_localSynthetic',
  keyId: 'website-e2e',
  signingSecret: secret,
};
const appEnv = {
  PATH: node.slice(0, node.lastIndexOf('/')) + ':/usr/bin:/bin',
  HOME: process.env.HOME,
  NEXT_TELEMETRY_DISABLED: '1',
  APP_BASE_URL: crmOrigin,
  EMAIL_REPLY_TO: 'office@example.invalid',
  NODE_OPTIONS:
    '--require /Users/noelsierra/Documents/Codex/2026-10-23/framework-security-update/deny-network.cjs',
  ATS_FRAMEWORK_NETWORK_LOG: out + '/e2e-network.private.log',
  FIREWOOD_TEST_IMPORT_ENABLED: '1',
  FIREWOOD_TEST_IMPORT_SOURCE_ID: config.sourceId,
  FIREWOOD_TEST_STRIPE_ACCOUNT_ID: config.accountId,
  FIREWOOD_TEST_IMPORT_SHARED_SECRET: secret,
  FIREWOOD_TEST_IMPORT_KEY_ID: config.keyId,
  FIREWOOD_TEST_PROJECT_ID: environment.projectId,
  FIREWOOD_TEST_SUPABASE_URL: status.API_URL,
  FIREWOOD_TEST_SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  FIREWOOD_TEST_STRIPE_KEY: 'sk_test_synthetic',
  FIREWOOD_TEST_STRIPE_API_ORIGIN: providerOrigin,
};
writeFileSync(appEnv.ATS_FRAMEWORK_NETWORK_LOG, '', { mode: 0o600 });
let app,
  appFd,
  website,
  origin,
  time = Date.now(),
  loseResponse = false;
const directory = await mkdtemp(out + '/private-website-');
const adapter = stripeAdapter('sk_test_synthetic', (url, options) => {
  const target = new URL(url);
  assert.equal(target.hostname, 'api.stripe.com');
  return fetch(providerOrigin + target.pathname + target.search, options);
});
const crm = createCrmClient(config, {
  fetcher: async (...args) => {
    const r = await fetch(...args);
    if (loseResponse && [200, 201].includes(r.status)) {
      loseResponse = false;
      await r.text();
      throw new Error('Synthetic lost response after commit');
    }
    return r;
  },
});
async function startCrm() {
  appFd = openSync(out + '/e2e-next.private.log', 'a', 0o600);
  app = spawn(
    node,
    [
      'node_modules/next/dist/bin/next',
      'start',
      '--hostname',
      '127.0.0.1',
      '--port',
      String(appPort),
    ],
    {
      cwd: buildRoot + '/apps/platform',
      env: appEnv,
      stdio: ['ignore', appFd, appFd],
    },
  );
  for (let i = 0; i < 100; i++) {
    if (app.exitCode !== null) throw new Error('Owned test CRM did not start.');
    try {
      if (
        (
          await fetch(crmOrigin + CRM_PATH, {
            signal: AbortSignal.timeout(1000),
          })
        ).status === 405
      )
        return;
    } catch {}
    await new Promise((yes) => setTimeout(yes, 100));
  }
  throw new Error('Test CRM startup timeout.');
}
async function stopCrm() {
  if (app && app.exitCode === null) {
    const done = once(app, 'exit');
    app.kill('SIGTERM');
    await done;
  }
  if (appFd !== undefined) {
    closeSync(appFd);
    appFd = undefined;
  }
}
async function startWebsite() {
  const previewAdapter =
    process.env.FIREWOOD_CRM_KEEP_PREVIEW === '1'
      ? {
          ...adapter,
          async create(...args) {
            const payment = await adapter.create(...args);
            return { ...payment, url: providerOrigin + '/pay/' + payment.id };
          },
        }
      : adapter;
  website = createCheckoutServer({
    adapter: previewAdapter,
    crm,
    webhookSecret: signingSecret,
    dataDirectory: directory,
    now: () => time,
  });
  origin = await website.listen();
}
async function browser() {
  let cookie, csrf;
  async function request(path, data) {
    const r = await fetch(origin + '/firewood/checkout/api/' + path, {
      method: data ? 'POST' : 'GET',
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(data ? { Origin: origin, 'Content-Type': 'application/json' } : {}),
      },
      body: data ? JSON.stringify({ ...data, csrf }) : undefined,
    });
    if (r.headers.has('set-cookie'))
      cookie = r.headers.get('set-cookie').split(';')[0];
    const value = await r.json();
    if (value.csrf) csrf = value.csrf;
    assert.equal(r.status, 200, JSON.stringify(value));
    return value;
  }
  await request('state');
  return { request };
}
async function newOrder(quantity = 'two', stacking = true) {
  const b = await browser(),
    tag = randomUUID().replaceAll('-', '');
  const contact = {
    quantity,
    stacking,
    name: 'Synthetic ' + tag.slice(0, 10),
    email: tag + '@example.invalid',
    phone:
      '202' + String(parseInt(tag.slice(0, 8), 16) % 10000000).padStart(7, '0'),
    address: '100 Synthetic Way',
    address2: '',
    city: 'Test City',
    state: 'VA',
    postal: '22407',
    notes: 'Fresh synthetic order. No delivery.',
  };
  const result = await b.request('start', contact),
    sessionId = result.next.split('/').at(-1);
  const provider = sessions.get(sessionId);
  assert.ok(provider);
  const record = await website.store.findOrder(
    provider.session.client_reference_id,
  );
  assert.ok(record.crm_binding);
  const request = { ...record.crm_binding, session_id: sessionId };
  assert.deepEqual(partnerContract.parseFirewoodImport(request), request);
  return { browser: b, provider, record, request };
}
async function event(
  order,
  type = 'checkout.session.completed',
  object = order.provider.session,
) {
  const payload = JSON.stringify({
    id: 'evt_' + randomUUID().replaceAll('-', ''),
    type,
    livemode: false,
    data: { object },
  });
  const signature = new Stripe(
    'sk_test_synthetic',
  ).webhooks.generateTestHeaderString({ payload, secret: signingSecret });
  const r = await fetch(origin + '/firewood/checkout/webhook', {
    method: 'POST',
    headers: { 'Stripe-Signature': signature },
    body: payload,
  });
  assert.equal(r.status, 200);
}
async function pay(order) {
  order.provider.session.status = 'complete';
  order.provider.session.payment_status = 'paid';
  Object.assign(order.provider.intent, {
    status: 'succeeded',
    amount_received: order.provider.session.amount_total,
  });
  Object.assign(order.provider.intent.latest_charge, {
    status: 'succeeded',
    amount_captured: order.provider.session.amount_total,
    paid: true,
    captured: true,
  });
  await event(order);
}
const checks = [],
  results = [];
try {
  await startCrm();
  await startWebsite();
  for (const [quantity, stacking, total] of [
    ['half', false, 30000],
    ['half', true, 45000],
    ['full', false, 45000],
    ['full', true, 60000],
    ['two', false, 84000],
    ['two', true, 99000],
  ]) {
    const order = await newOrder(quantity, stacking);
    await pay(order);
    await website.flushCrm();
    const sync = await website.store.crmSync(order.record.id);
    assert.equal(sync.status, 'synced');
    assert.equal(sync.receipt.total_cents, total);
    assert.equal(sync.receipt.balance_due_cents, 0);
    assert.equal(
      (await order.browser.request('state')).crm.invoiceNumber,
      sync.receipt.invoice_number,
    );
    await event(order);
    await website.store.retryCrm(order.record.id);
    await website.flushCrm();
    const replay = await website.store.crmSync(order.record.id);
    assert.equal(replay.receipt.invoice_id, sync.receipt.invoice_id);
    assert.equal(replay.receipt.payment_id, sync.receipt.payment_id);
    assert.equal(
      (await website.store.confirmations(order.record.id)).length,
      2,
    );
    results.push({
      quantity,
      stacking,
      total,
      reference: order.record.order_number,
      invoiceId: sync.receipt.invoice_id,
      paymentId: sync.receipt.payment_id,
    });
  }
  checks.push(
    'all six fresh Website orders use the exact CRM contract, become one paid invoice/payment each, and replay without duplicates',
  );
  const unpaid = await newOrder();
  await event(unpaid);
  await website.flushCrm();
  assert.equal(await website.store.crmSync(unpaid.record.id), null);
  checks.push('unpaid Website events create no CRM sync or invoice');
  await stopCrm();
  const outage = await newOrder();
  await pay(outage);
  await website.flushCrm();
  assert.equal(
    (await website.store.crmSync(outage.record.id)).status,
    'pending',
  );
  assert.equal((await outage.browser.request('state')).status, 'paid');
  await website.close();
  await startCrm();
  time += 6000;
  await startWebsite();
  await website.flushCrm();
  assert.equal(
    (await website.store.crmSync(outage.record.id)).status,
    'synced',
  );
  checks.push(
    'CRM outage preserves the paid order; Website and CRM process restarts recover the same durable queue',
  );
  loseResponse = true;
  const lost = await newOrder();
  await pay(lost);
  await website.flushCrm();
  assert.equal((await website.store.crmSync(lost.record.id)).status, 'pending');
  const committed = counts();
  await website.close();
  time += 6000;
  await startWebsite();
  await website.flushCrm();
  assert.equal((await website.store.crmSync(lost.record.id)).status, 'synced');
  assert.deepEqual(counts(), committed);
  checks.push(
    'response lost after CRM commit replays the same invoice/payment after Website restart',
  );
  const refreshed = await newOrder('full', false);
  await pay(refreshed);
  await website.flushCrm();
  const original = await website.store.crmSync(refreshed.record.id);
  refreshed.provider.refunds.push({
    id: 're_' + randomUUID().replaceAll('-', ''),
    charge: refreshed.provider.intent.latest_charge.id,
    payment_intent: refreshed.provider.intent.id,
    currency: 'usd',
    amount: 10000,
    status: 'succeeded',
    created: Math.floor(Date.now() / 1000),
  });
  refreshed.provider.intent.latest_charge.amount_refunded = 10000;
  await event(
    refreshed,
    'charge.refunded',
    refreshed.provider.intent.latest_charge,
  );
  await website.flushCrm();
  const review = await website.store.crmSync(refreshed.record.id);
  assert.equal(review.status, 'review');
  assert.equal(review.receipt.invoice_id, original.receipt.invoice_id);
  assert.equal(review.receipt.payment_id, original.receipt.payment_id);
  assert.equal(review.receipt.original_receipt.paid, true);
  assert.equal(review.receipt.balance_due_cents, 10000);
  checks.push(
    'signed refund refresh retains original payment and invoice, goes to review and creates no new payment request',
  );
  const after = counts();
  assert.equal(after.invoices, before.invoices + 9);
  assert.equal(after.payments, before.payments + 9);
  for (const key of ['jobs', 'outbound', 'communications'])
    assert.equal(after[key], before[key]);
  assert.equal(readFileSync(appEnv.ATS_FRAMEWORK_NETWORK_LOG, 'utf8'), '');
  writeFileSync(
    out + '/website-e2e-results.json',
    JSON.stringify(
      {
        checks,
        results,
        countsBefore: before,
        countsAfter: after,
        syntheticStripeHttp: true,
        freshCheckoutCreations: providerCalls.filter((x) => x.method === 'POST')
          .length,
        realStripeWrites: 0,
        hostedDatabaseAccess: false,
        emailsSent: 0,
        productionChanges: false,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    checks.length +
      ' full Website→CRM HTTP integration groups passed with fresh synthetic orders.',
  );
  if (process.env.FIREWOOD_CRM_KEEP_PREVIEW === '1') {
    writeFileSync(
      out + '/synthetic-preview.json',
      JSON.stringify({
        origin,
        providerOrigin,
        crmOrigin,
        mode: 'synthetic-local-only',
      }) + '\n',
    );
    console.log(
      'Synthetic Website/CRM browser preview ready at ' +
        origin +
        '/firewood/checkout/.',
    );
    await new Promise((yes) => {
      process.once('SIGINT', yes);
      process.once('SIGTERM', yes);
    });
  }
} finally {
  if (website) await website.close();
  await stopCrm();
  fakeProvider.closeAllConnections();
  await new Promise((yes) => fakeProvider.close(yes));
}
