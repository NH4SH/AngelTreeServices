import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  createCrmBinding,
  canonical,
  digest,
  crmMetadata,
  crmTestConfig,
  createCrmClient,
  validateCrmReceipt,
  CrmSyncError,
} from './firewood-checkout/crm.mjs';
import {
  validateOrder,
  stripeParams,
  stripeAdapter,
} from './firewood-checkout/model.mjs';
import { openOrderStore } from './firewood-checkout/store.mjs';
import { createCheckoutServer } from './firewood-checkout/server.mjs';
const config = {
  origin: 'http://127.0.0.1:3198',
  sourceId: 'website_local_test',
  accountId: 'acct_localSynthetic',
  keyId: 'local-test',
  signingSecret: 'synthetic-signing-key-for-local-tests-only',
};
const env = {
  FIREWOOD_CRM_TEST_ENABLED: '1',
  FIREWOOD_CRM_TEST_ORIGIN: config.origin,
  FIREWOOD_TEST_IMPORT_SOURCE_ID: config.sourceId,
  FIREWOOD_TEST_STRIPE_ACCOUNT_ID: config.accountId,
  FIREWOOD_TEST_IMPORT_KEY_ID: config.keyId,
  FIREWOOD_TEST_IMPORT_SHARED_SECRET: config.signingSecret,
};
const sample = {
  quantity: 'two',
  stacking: true,
  name: ' Synthetic Customer ',
  email: 'Synthetic@Example.Invalid',
  phone: '+1 (202) 555-0100',
  address: '100 Synthetic Way',
  address2: '',
  city: 'Test City',
  state: 'va',
  postal: '22407',
  notes: 'Test only. No delivery.',
};
const make = (values = {}) => {
  const order = validateOrder({ ...sample, ...values });
  const binding = createCrmBinding(order, config);
  return {
    order,
    binding,
    request: {
      ...binding,
      session_id: 'cs_test_' + randomUUID().replaceAll('-', ''),
    },
    intentId: 'pi_' + randomUUID().replaceAll('-', ''),
  };
};
const response = (f, changes = {}) => ({
  ...Object.fromEntries(
    [
      'contract',
      'source_id',
      'account_id',
      'order_id',
      'reference',
      'attempt_id',
      'session_id',
    ].map((k) => [k, f.request[k]]),
  ),
  mode: 'test',
  import_status: 'recorded',
  payment_intent_id: f.intentId,
  invoice_id: randomUUID(),
  invoice_number: 'TEST-FW-' + f.request.order_id,
  payment_id: randomUUID(),
  total_cents: f.request.order.total_cents,
  currency: 'usd',
  invoice_status: 'paid',
  balance_due_cents: 0,
  replayed: false,
  notification_authority: 'website',
  crm_customer_email_sent: false,
  delivery_completed: false,
  refund_cents: 0,
  dispute_status: null,
  review_required: false,
  original_receipt: { paid: true, balance_due_cents: 0 },
  ...changes,
});
const dirs = [];
after(async () => {
  for (const dir of dirs) await rm(dir, { recursive: true, force: true });
});
async function fixtureStore(t, options = {}) {
  const store = await openOrderStore(options);
  t.after(() => store.close());
  return store;
}
async function paidAttempt(store, values = {}) {
  const order = validateOrder({ ...sample, ...values });
  const record = await store.createAttempt(
    randomUUID(),
    'browser-reference',
    order,
    config,
  );
  const payment = 'cs_test_' + randomUUID().replaceAll('-', ''),
    intentId = 'pi_' + randomUUID().replaceAll('-', '');
  await store.bindPayment(record.id, {
    id: payment,
    url: 'https://checkout.stripe.com/c/pay/' + payment,
  });
  await store.confirm(record.id, payment, 'webhook', 'evt_' + randomUUID(), {
    intentId,
  });
  return {
    record,
    request: { ...record.crm_binding, session_id: payment },
    intentId,
  };
}
for (const [quantity, stacking, total] of [
  ['half', false, 30000],
  ['half', true, 45000],
  ['full', false, 45000],
  ['full', true, 60000],
  ['two', false, 84000],
  ['two', true, 99000],
])
  test(`CRM snapshot preserves ${quantity}/${stacking} total ${total} with free delivery`, () => {
    const f = make({ quantity, stacking });
    assert.equal(f.binding.order.total_cents, total);
    assert.equal(f.binding.order.delivery_cents, 0);
    assert.equal(f.binding.order.contact.email, 'synthetic@example.invalid');
    assert.equal(f.binding.order.contact.phone, '2025550100');
    assert.equal(f.order.contact.phone, sample.phone);
    assert.equal(f.binding.snapshot_hash, digest(f.binding.order));
    assert.notEqual(f.binding.order_id, f.binding.attempt_id);
    const params = stripeParams(
      f.order,
      'http://127.0.0.1:55821',
      f.binding.reference,
      'internal-attempt',
      f.binding,
    );
    assert.equal(params.client_reference_id, f.binding.reference);
    assert.deepEqual(
      params.payment_intent_data.metadata,
      crmMetadata(f.binding),
    );
    for (const [k, v] of Object.entries(crmMetadata(f.binding)))
      assert.equal(params.metadata[k], v);
    assert.equal(
      params.line_items.reduce(
        (s, x) => s + x.price_data.unit_amount * x.quantity,
        0,
      ),
      total,
    );
    assert.equal(params.payment_intent_data.shipping.phone, '2025550100');
    assert.equal(params.metadata.attempt, 'internal-attempt');
  });
test('canonical order hashing is recursive and stable across object key order', () => {
  assert.equal(
    canonical({ z: [{ b: 2, a: 1 }], a: 'x' }),
    '{"a":"x","z":[{"a":1,"b":2}]}',
  );
  assert.equal(digest({ a: { b: 2, a: 1 } }), digest({ a: { a: 1, b: 2 } }));
});
test('CRM configuration is opt-in, loopback-only and has no generic credential fallback', () => {
  assert.equal(crmTestConfig({}), null);
  assert.deepEqual(crmTestConfig(env), config);
  for (const target of [
    'https://admin.angeltreeservices.org',
    'http://localhost:3000',
    'http://127.0.0.1',
    'http://127.0.0.1:3000/other',
    'http://127.0.0.1:3000/?x=1',
    'http://x:y@127.0.0.1:3000',
  ])
    assert.throws(() =>
      crmTestConfig({ ...env, FIREWOOD_CRM_TEST_ORIGIN: target }),
    );
  assert.throws(() =>
    crmTestConfig({
      ...env,
      FIREWOOD_TEST_IMPORT_SHARED_SECRET: '',
      CRM_SECRET: 'generic',
    }),
  );
  assert.throws(() => createCheckoutServer({ crm: createCrmClient(config) }));
});
test('signed private request uses exact UTF-8 body/path and verifies the authoritative receipt', async () => {
  const f = make();
  const wanted = response(f);
  const client = createCrmClient(config, {
    now: () => 1800000000000,
    fetcher: async (url, options) => {
      assert.equal(
        url,
        config.origin + '/api/integrations/firewood/test-import',
      );
      const timestamp = options.headers['X-ATS-Timestamp'];
      const signature =
        'v1=' +
        createHmac('sha256', config.signingSecret)
          .update(
            timestamp +
              '\nPOST\n/api/integrations/firewood/test-import\n' +
              options.body,
          )
          .digest('hex');
      assert.equal(options.headers['X-ATS-Signature'], signature);
      assert.equal(options.redirect, 'error');
      assert.deepEqual(JSON.parse(options.body), f.request);
      return Response.json(wanted, { status: 201 });
    },
  });
  assert.equal(
    (await client.send(f.request, null, f.intentId)).invoice_id,
    wanted.invoice_id,
  );
});
test('wrong identity, payment, amount, mode and notification claims never acknowledge a CRM sync', () => {
  const f = make();
  for (const changes of [
    { order_id: randomUUID() },
    { session_id: 'cs_test_other' },
    { account_id: 'acct_other' },
    { total_cents: 1 },
    { currency: 'eur' },
    { mode: 'live' },
    { payment_intent_id: 'pi_other' },
    { balance_due_cents: 1 },
    { crm_customer_email_sent: true },
    { notification_authority: 'crm' },
    { delivery_completed: true },
    { original_receipt: { paid: false, balance_due_cents: 0 } },
  ])
    assert.throws(() =>
      validateCrmReceipt(response(f, changes), f.request, null, f.intentId),
    );
  const original = response(f);
  assert.throws(
    () => validateCrmReceipt(response(f), f.request, original, f.intentId),
    /mapping_conflict/u,
  );
});
test('refund/dispute review retains original paid receipt and never requests another payment', () => {
  const f = make();
  const original = response(f);
  const refreshed = {
    ...original,
    refund_cents: 10000,
    review_required: true,
    balance_due_cents: 10000,
    invoice_status: 'partially_paid',
    replayed: true,
  };
  const r = validateCrmReceipt(refreshed, f.request, original, f.intentId);
  assert.equal(r.review_required, true);
  assert.equal(r.original_receipt.paid, true);
  assert.equal(r.invoice_id, original.invoice_id);
});
test('CRM outage and lost response retry the identical immutable request after database restart', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'fw-crm-retry-'));
  dirs.push(directory);
  let time = 100;
  let store = await openOrderStore({ directory, now: () => time });
  const f = await paidAttempt(store);
  const requests = [];
  await store.drainCrm({
    send: async (request) => {
      requests.push(request);
      throw new CrmSyncError('connection_unconfirmed', true);
    },
  });
  assert.equal((await store.crmSync(f.record.id)).status, 'pending');
  await store.close();
  time += 5001;
  store = await openOrderStore({ directory, now: () => time });
  t.after(() => store.close());
  const receipt = response(f);
  const client = {
    send: async (request) => {
      requests.push(request);
      return receipt;
    },
  };
  await Promise.all([store.drainCrm(client), store.drainCrm(client)]);
  assert.equal((await store.crmSync(f.record.id)).status, 'synced');
  assert.deepEqual(requests[0], requests[1]);
  assert.equal(requests.length, 2);
  assert.equal((await store.crmSync(f.record.id)).tries, 2);
  await store.drain();
  assert.ok(
    (await store.confirmations(f.record.id)).every((x) => x.tries === 1),
  );
});
test('permanent CRM errors require review; manual retry preserves identity and paid status', async (t) => {
  const store = await fixtureStore(t);
  const f = await paidAttempt(store);
  await store.drainCrm({
    send: async () => {
      throw new CrmSyncError('http_409_review');
    },
  });
  assert.equal((await store.crmSync(f.record.id)).status, 'review');
  assert.equal((await store.attempt(f.record.id)).status, 'paid');
  let calls = 0;
  await store.drainCrm({
    send: async () => {
      calls++;
    },
  });
  assert.equal(calls, 0);
  await store.retryCrm(f.record.id);
  await store.drainCrm({
    send: async (request) => {
      assert.deepEqual(request, f.request);
      return response(f);
    },
  });
  assert.equal((await store.crmSync(f.record.id)).status, 'synced');
});
test('a refund event arriving during sync remains pending for a fresh observation', async (t) => {
  const store = await fixtureStore(t);
  const f = await paidAttempt(store);
  await store.drainCrm({
    send: async () => {
      await store.refreshCrm(f.intentId);
      return response(f);
    },
  });
  assert.equal((await store.crmSync(f.record.id)).status, 'pending');
  const original = (await store.crmSync(f.record.id)).receipt;
  await store.drainCrm({
    send: async () => ({
      ...original,
      refund_cents: 10000,
      review_required: true,
      invoice_status: 'partially_paid',
      balance_due_cents: 10000,
      replayed: true,
    }),
  });
  assert.equal((await store.crmSync(f.record.id)).status, 'review');
  assert.equal(
    (await store.crmSync(f.record.id)).receipt.invoice_id,
    original.invoice_id,
  );
});
test('legacy orders are not retrofitted; simulator success cannot enqueue a CRM invoice', async (t) => {
  const store = await fixtureStore(t);
  const order = validateOrder(sample);
  await store.createAttempt('legacy', 'browser', order);
  await store.createAttempt('legacy', 'browser', order, config);
  assert.equal((await store.attempt('legacy')).crm_binding, null);
  await store.bindPayment('legacy', { id: 'local_old', url: '/payment/' });
  await store.confirm('legacy', 'local_old', 'local-simulator');
  assert.equal(await store.crmSync('legacy'), null);
  const fresh = await store.createAttempt('fresh', 'browser', order, config);
  await store.bindPayment('fresh', {
    id: 'cs_test_fresh',
    url: 'https://checkout.stripe.com/c/pay/cs_test_fresh',
  });
  await assert.rejects(
    store.confirm('fresh', 'cs_test_fresh', 'local-simulator'),
  );
  assert.equal((await store.attempt(fresh.id)).status, 'pending');
  assert.equal(await store.crmSync('fresh'), null);
});
test('identical payment events queue only one CRM identity and two local confirmations', async (t) => {
  const store = await fixtureStore(t);
  const f = await paidAttempt(store);
  await store.confirm(
    f.record.id,
    f.request.session_id,
    'webhook',
    'evt_other',
    { intentId: f.intentId },
  );
  await store.drainCrm({
    send: async (request) => {
      assert.deepEqual(request, f.request);
      return response(f);
    },
  });
  await store.drain();
  assert.equal((await store.crmSync(f.record.id)).tries, 1);
  assert.equal((await store.confirmations(f.record.id)).length, 2);
});
test('authentication and data rejection pause sync while malformed success stays retryable', async () => {
  const f = make();
  for (const status of [401, 403, 409, 422]) {
    const client = createCrmClient(config, {
      fetcher: async () =>
        Response.json({ private: 'do not expose' }, { status }),
    });
    await assert.rejects(
      client.send(f.request, null, f.intentId),
      (e) => e.retryable === false && !e.message.includes('private'),
    );
  }
  for (const value of [{}, response(f, { total_cents: 1 })]) {
    const client = createCrmClient(config, {
      fetcher: async () => Response.json(value),
    });
    await assert.rejects(
      client.send(f.request, null, f.intentId),
      (e) => e.retryable === true,
    );
  }
  const client = createCrmClient(config, {
    fetcher: async () =>
      Response.json({}, { status: 503, headers: { 'retry-after': '5' } }),
  });
  await assert.rejects(
    client.send(f.request, null, f.intentId),
    (e) => e.retryable === true && e.delayMs === 5000,
  );
});
test('an insufficient Stripe account permission fails before creating a payment', async () => {
  const f = make();
  let creates = 0;
  const adapter = stripeAdapter('rkcs_test_synthetic', async (url) => {
    if (url.endsWith('/v1/account'))
      return Response.json(
        {
          error: {
            message: 'Restricted test account permission',
            type: 'invalid_request_error',
          },
        },
        { status: 403 },
      );
    creates++;
    return Response.json({});
  });
  await assert.rejects(
    adapter.create(
      f.order,
      'http://127.0.0.1:55821',
      f.binding.reference,
      'internal',
      f.binding,
    ),
    (error) => error.status === 502,
  );
  assert.equal(creates, 0);
});

test('a crashed CRM worker recovers its expired lease without minting a new order or payment', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'fw-crm-crash-'));
  dirs.push(directory);
  const script = `import {openOrderStore} from ${JSON.stringify(new URL('./firewood-checkout/store.mjs', import.meta.url).href)};
 const store=await openOrderStore({directory:${JSON.stringify(directory)},now:()=>1000});
 const order=${JSON.stringify(validateOrder(sample))};
 await store.createAttempt('crash-order','browser',order,${JSON.stringify({ sourceId: config.sourceId, accountId: config.accountId })});
 await store.bindPayment('crash-order',{id:'cs_test_crashworker',url:'https://checkout.stripe.com/c/pay/cs_test_crashworker'});
 await store.confirm('crash-order','cs_test_crashworker','webhook','evt_crashworker',{intentId:'pi_crashworker'});
 await store.drainCrm({send:async()=>{console.log('claimed');await new Promise(()=>{});}});`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => {
    if (child.exitCode === null && child.signalCode === null)
      child.kill('SIGKILL');
  });
  await new Promise((yes, no) => {
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
      if (output.includes('claimed')) yes();
    });
    child.once('error', no);
    child.once('exit', () => no(Error('Worker stopped before claiming.')));
  });
  const exited = once(child, 'exit');
  child.kill('SIGKILL');
  await exited;
  let time = 1001;
  const store = await openOrderStore({ directory, now: () => time });
  t.after(() => store.close());
  const saved = await store.crmSync('crash-order');
  assert.equal(saved.tries, 1);
  assert.ok(saved.lease_id);
  let calls = 0;
  const f = { request: saved.request, intentId: saved.intent_id };
  const client = {
    send: async (request) => {
      calls++;
      assert.deepEqual(request, saved.request);
      return response(f);
    },
  };
  await store.drainCrm(client);
  assert.equal(calls, 0);
  time = 47000;
  await store.drainCrm(client);
  assert.equal(calls, 1);
  assert.equal((await store.crmSync('crash-order')).status, 'synced');
  assert.equal((await store.orders()).length, 1);
});
