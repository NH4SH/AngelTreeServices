import assert from 'node:assert/strict';
import test from 'node:test';
import { processStripeWebhook } from '../src/lib/payments/webhook-recovery.ts';
import { WebhookProcessingError, safeWebhookLog } from '../src/lib/payments/webhook-logging.ts';
import { load } from './pr10-test-helpers.mjs';

const invoice = '00000000-0000-4000-8000-000000000001';
const token = '00000000-0000-4000-8000-000000000002';
const notice = '00000000-0000-4000-8000-000000000003';
const claim = { status: 'claimed', token, phase: 'effects_ready', invoice_id: invoice, communications_synced: false };
const send = { status: 'send', to: 'office@example.invalid', title: 'Synthetic payment', body: 'Local only', destination: '/admin', invoice_id: invoice };
const event = { id: 'evt_checkpoint_fixture', type: 'fixture.unhandled', created: 1792100000, livemode: false, data: { object: { id: 'obj_fixture' } } };
function fixture(options = {}) {
  const calls = [], sends = [], planning = [], providerReads = [];
  const value = (key, fallback) => Object.hasOwn(options, key) ? options[key] : fallback;
  const answer = data => { const q = { abortSignal() { return q; }, then(resolve, reject) { return Promise.resolve({ data, error: null }).then(resolve, reject); } }; return q; };
  const checkout = { id: notice, invoice_id: invoice, payment_channel: 'ach', currency: 'usd', total_charge_cents: 1000, stripe_checkout_session_id: 'cs_fixture' };
  const db = {
    rpc(name, args) {
      calls.push({ name, args });
      if (options.rpcError?.name === name) {
        const q = { abortSignal() { return q; }, then(resolve, reject) { return Promise.resolve({ data: null, error: options.rpcError.error }).then(resolve, reject); } }; return q;
      }
      const responses = {
        claim_stripe_webhook: value('claim', claim), prepare_stripe_webhook_snapshot: value('snapshot', token),
        apply_stripe_webhook: value('applied', { ignored: true }), mark_stripe_webhook_sync: true,
        begin_stripe_notification_email: value('attempt', send), finish_stripe_notification_email: true,
        complete_stripe_webhook: true, fail_stripe_webhook: true,
      };
      assert.ok(Object.hasOwn(responses, name), name); return answer(responses[name]);
    },
    from(table) {
      assert.ok(['admin_notifications', 'invoice_checkout_sessions'].includes(table));
      const q = { select() { return q; }, eq() { return q; }, in() { return q; }, order() { return q; }, limit() { return q; }, abortSignal() { return q; },
        maybeSingle() { return answer(checkout); }, then(resolve, reject) {
          return Promise.resolve({ data: value('notifications', []), error: value('notificationError', null) }).then(resolve, reject);
        } };
      return q;
    },
  };
  const stripe = { checkout: { sessions: { retrieve: async () => { providerReads.push('retrieve'); return {
    id: 'cs_fixture', livemode: false, status: 'complete', payment_status: 'unpaid', amount_total: 1000, currency: 'usd',
    client_reference_id: invoice, metadata: { invoice_id: invoice }, payment_intent: { id: 'pi_fixture', status: 'processing', livemode: false,
      metadata: { invoice_id: invoice }, amount: 1000, currency: 'usd' },
  }; } } } };
  const deps = { supabase: db, stripe, livemode: false,
    sendEmail: async input => { sends.push(input); return value('emailResult', { ok: true, configured: true, retryable: false, providerMessageId: 'local_message' }); },
    syncCommunications: async id => { planning.push(id); return value('sync', { error: null }); },
  };
  return { calls, sends, planning, providerReads, db, deps, run: e => processStripeWebhook(e ?? event, deps), count: name => calls.filter(c => c.name === name).length };
}
async function rejects(f, code, e) {
  await assert.rejects(f.run(e), error => error instanceof WebhookProcessingError && error.applicationErrorCode === code && error.retryable);
  assert.equal(f.count('complete_stripe_webhook'), 0);
}

test('confirmed downstream resume completes without repeating provider reads or financial apply', async () => {
  const f = fixture(); assert.equal((await f.run()).status, 'completed'); assert.deepEqual(f.planning, [invoice]);
  assert.equal(f.count('apply_stripe_webhook'), 0); assert.equal(f.providerReads.length, 0); assert.equal(f.count('mark_stripe_webhook_sync'), 1);
});
test('minimal SQL completed/busy/review claims require no owned processing', async () => {
  for (const status of ['completed', 'busy', 'review']) {
    const f = fixture({ claim: { status } }); assert.equal((await f.run()).status, status); assert.equal(f.calls.length, 1);
  }
});
test('unconfirmed claim fields never authorize a token or downstream work', async t => {
  const { phase, ...missingPhase } = claim, { communications_synced, ...missingSync } = claim, { invoice_id, ...missingInvoice } = claim;
  const cases = [null, {}, [], missingPhase, missingSync, missingInvoice, { ...claim, token: '' }, { ...claim, token: 'not-a-uuid' },
    { ...claim, phase: 'completed' }, { ...claim, communications_synced: 'false' }, { ...claim, invoice_id: 'wrong' }, { status: { toString: () => 'completed' } }];
  for (const [index, value] of cases.entries()) await t.test(String(index), async () => {
    const f = fixture({ claim: value }); await rejects(f, 'receipt_claim_invalid'); assert.equal(f.calls.length, 1); assert.equal(f.sends.length, 0);
  });
});
test('missing or ambiguous reminder planning cannot mark the durable checkpoint complete', async t => {
  for (const [index, sync] of [undefined, null, {}, [], { error: false }, { error: '' }, { error: 'Private planning detail' }].entries()) await t.test(String(index), async () => {
    const f = fixture({ sync }); await rejects(f, 'communication_sync_failed'); assert.equal(f.count('mark_stripe_webhook_sync'), 0); assert.equal(f.count('fail_stripe_webhook'), 1);
  });
});
test('notification reads require a confirmed array of distinct IDs before claiming any email', async t => {
  for (const [index, notifications] of [null, undefined, {}, [{}], [{ id: 'wrong' }], [{ id: notice }, { id: notice }]].entries()) await t.test(String(index), async () => {
    const f = fixture({ notifications }); await rejects(f, 'notification_read_failed'); assert.equal(f.count('begin_stripe_notification_email'), 0); assert.equal(f.sends.length, 0);
  });
  await rejects(fixture({ notifications: [], notificationError: undefined }), 'notification_read_failed');
});
test('notification preparation requires a recognized outcome and complete bound send payload', async t => {
  const { to, ...noTo } = send, { body, ...noBody } = send, { destination, ...noDestination } = send;
  const cases = [null, {}, { status: 'unknown' }, noTo, noBody, noDestination, { ...send, invoice_id: token }, { ...send, title: '' }];
  for (const [index, attempt] of cases.entries()) await t.test(String(index), async () => {
    const f = fixture({ notifications: [{ id: notice }], attempt }); await rejects(f, index === 6 ? 'notification_binding_invalid' : 'notification_claim_invalid');
    assert.equal(f.sends.length, 0); assert.equal(f.count('finish_stripe_notification_email'), 0);
  });
});
test('confirmed gone/done/review notification outcomes never submit another email', async () => {
  for (const status of ['gone', 'done', 'review']) {
    const f = fixture({ notifications: [{ id: notice }], attempt: { status } }); assert.equal((await f.run()).status, 'completed'); assert.equal(f.sends.length, 0);
  }
});
test('malformed sender acknowledgement is held for review and cannot authorize another send', async t => {
  const cases = [{}, null, { ok: false }, { ok: true, configured: true, retryable: false },
    { ok: false, configured: true, retryable: false, providerMessageId: 'local_message' },
    { ok: true, configured: true, retryable: false, providerMessageId: 'private invalid ID' },
    { ok: false, configured: true, retryable: false, providerMessageId: null, outcome: 'pending' },
    { ok: true, configured: true, retryable: false, providerMessageId: 'local_message', outcome: 'unknown' }];
  for (const [index, emailResult] of cases.entries()) await t.test(String(index), async () => {
    const f = fixture({ notifications: [{ id: notice }], emailResult }); await rejects(f, 'notification_delivery_uncertain');
    const finish = f.calls.find(c => c.name === 'finish_stripe_notification_email'); assert.equal(finish.args.p_outcome, 'review'); assert.equal(finish.args.p_provider_id, null); assert.equal(f.sends.length, 1);
    f.db.rpc = (original => (name, args) => name === 'begin_stripe_notification_email'
      ? { abortSignal() { return this; }, then(resolve) { return Promise.resolve({ data: { status: 'review' }, error: null }).then(resolve); } }
      : original(name, args))(f.db.rpc.bind(f.db));
    assert.equal((await f.run()).status, 'completed'); assert.equal(f.sends.length, 1);
  });
});
test('known sender outcomes preserve accepted, failed and review classification', async () => {
  for (const [emailResult, outcome] of [
    [{ ok: true, configured: true, retryable: false, providerMessageId: 'local_message' }, 'accepted'],
    [{ ok: true, configured: true, retryable: false, providerMessageId: null }, 'review'],
    [{ ok: false, configured: true, retryable: true, providerMessageId: null }, 'review'],
    [{ ok: false, configured: true, retryable: false, providerMessageId: null, outcome: 'unknown' }, 'review'],
    [{ ok: false, configured: true, retryable: false, providerMessageId: null }, 'review'],
    [{ ok: false, configured: true, retryable: false, providerMessageId: null, outcome: 'rejected' }, 'failed'],
    [{ ok: false, configured: true, retryable: false, providerMessageId: null, outcome: 'not_attempted' }, 'failed'],
    [{ ok: false, configured: false, retryable: false, providerMessageId: null }, 'failed'],
  ]) {
    const f = fixture({ notifications: [{ id: notice }], emailResult }); assert.equal((await f.run()).status, 'completed');
    assert.equal(f.calls.find(c => c.name === 'finish_stripe_notification_email').args.p_outcome, outcome);
  }
});
test('SQL nullable notification content stays supported without inventing a link', async () => {
  const f = fixture({ notifications: [{ id: notice }], attempt: { ...send, body: null, destination: null } }); assert.equal((await f.run()).status, 'completed');
  const sent = [];
  const adapter = load('../src/lib/payments/webhook-email.ts', { 'server-only': {}, '@/lib/email/send': { sendTransactionalEmail: async input => { sent.push(input); return {}; } },
    '@/lib/security/app-base-url': { buildCanonicalAppUrl: () => { throw Error('Null path must not be fabricated'); } } });
  await adapter.sendWebhookNotificationEmail(f.sends[0]); assert.equal(sent[0].text, ''); assert.equal(sent[0].subject, send.title);
});
test('snapshot failure prevents a second provider observation or financial apply', async () => {
  const e = { ...event, type: 'checkout.session.completed', data: { object: { id: 'cs_fixture' } } };
  const f = fixture({ claim: { ...claim, phase: 'pending', invoice_id: null }, snapshot: null }); await rejects(f, 'receipt_snapshot_invalid', e);
  assert.equal(f.providerReads.length, 1); assert.equal(f.count('apply_stripe_webhook'), 0);
});
test('financial apply must acknowledge the expected invoice before planning follows', async t => {
  const e = { ...event, type: 'checkout.session.completed', data: { object: { id: 'cs_fixture' } } };
  for (const [index, applied] of [null, {}, { invoice_id: token }, { ignored: true }, { invoice_id: invoice, ignored: 'true' }].entries()) await t.test(String(index), async () => {
    const f = fixture({ claim: { ...claim, phase: 'pending', invoice_id: null }, applied }); await rejects(f, 'receipt_apply_invalid', e);
    assert.equal(f.count('apply_stripe_webhook'), 1); assert.equal(f.planning.length, 0); assert.equal(f.sends.length, 0);
  });
  const f = fixture({ claim: { ...claim, phase: 'pending', invoice_id: null }, applied: { invoice_id: invoice } }); assert.equal((await f.run(e)).status, 'completed'); assert.equal(f.providerReads.length, 2);
});
test('initial and replayed ignored SQL acknowledgements remain valid; truthy flags do not', async () => {
  for (const applied of [{ ignored: true }, { invoice_id: null }]) {
    const f = fixture({ claim: { ...claim, phase: 'pending', invoice_id: null }, applied }); assert.equal((await f.run()).status, 'completed'); assert.equal(f.planning.length, 0);
  }
  await rejects(fixture({ claim: { ...claim, phase: 'pending' }, applied: { ignored: 'true' } }), 'receipt_apply_invalid');
});
test('provider supersession retains its existing retryable error code', async () => {
  const e = { ...event, type: 'checkout.session.completed', data: { object: { id: 'cs_fixture' } } };
  await rejects(fixture({ claim: { ...claim, phase: 'pending' }, rpcError: { name: 'apply_stripe_webhook', error: { details: 'provider_snapshot_superseded', message: 'Private diagnostic' } } }), 'provider_snapshot_superseded', e);
});

test('actual webhook route refuses HTTP acknowledgement until planning is confirmed', async () => {
  const f = fixture({ sync: {} }), logs = [], original = console.error;
  const route = load('../src/app/api/stripe/webhook/route.ts', {
    '@/lib/payments/webhook-recovery': { processStripeWebhook },
    '@/lib/payments/webhook-email': { sendWebhookNotificationEmail: f.deps.sendEmail },
    '@/lib/communications/queue': { syncInvoicePaymentCommunications: (_db, id) => f.deps.syncCommunications(id) },
    '@/lib/payments/webhook-logging': { safeWebhookLog },
    '@/lib/stripe/server': { getStripeWebhookSecret: () => 'synthetic-local-only', getStripeServerConfig: () => ({ configured: true, livemode: false, stripe: { webhooks: { constructEvent: () => event } } }) },
    '@/lib/supabase/admin': { getServiceRoleClient: () => f.db },
  });
  try {
    console.error = (...args) => logs.push(args);
    const response = await route.POST(new Request('http://127.0.0.1:3102/api/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': 'synthetic' }, body: '{}' }));
    assert.equal(response.status, 500); assert.doesNotMatch(await response.text(), /invoice|token|private/i);
  } finally { console.error = original; }
  assert.equal(f.count('mark_stripe_webhook_sync'), 0); assert.equal(f.count('complete_stripe_webhook'), 0);
  assert.equal(logs[0][1].applicationErrorCode, 'communication_sync_failed');
});
