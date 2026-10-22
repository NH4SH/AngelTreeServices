import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { load } from './pr10-test-helpers.mjs';
import { prepareSendAttempt, readSendAttempt, forgetSendAttempt } from '../src/lib/change-orders/send-attempt.ts';

const uid = randomUUID(), id = randomUUID(), request = randomUUID(), deliveryId = randomUUID(), job = randomUUID(), tokenId = randomUUID();
const linkVersion = 'a1'.repeat(32);
const storedReceipt = { request_id: request, id, reviewed_revision: 4, delivery_id: deliveryId, job_id: job, organization_id: null,
  current_revision: 4, current_status: 'ready_to_send', additional_copy: false, replayed: false };
const acceptedRow = { id: deliveryId, state: 'accepted', repair_state: 'complete', history_recorded: true, provider_message_id: 'synthetic-provider-id', followup_sync_pending: false };
const delivery = load('../src/lib/email/delivery.ts', { 'server-only': {}, 'node:crypto': {}, '@/lib/email/delivery-commands': {}, '@/lib/email/delivery-context': {} });
function form(overrides = {}) {
  const f = new FormData();
  for (const [key, value] of Object.entries({ change_order_id: id, request_id: request, expected_revision: '4', additional_copy: '0', expected_link_version: linkVersion, ...overrides })) f.set(key, value);
  return f;
}
function fixture(options = {}) {
  const calls = [], events = [], paths = [], dispatches = [], transports = [], followups = [], frozen = [];
  const authDB = { auth: { getUser: async () => ({ data: { user: options.signedOut ? null : { id: uid } } }) },
    from: () => assert.fail('Sending must not perform separate application table writes') };
  const serviceDB = { from: () => assert.fail('Sending uses the reviewed database commands') };
  const receipt = { ...storedReceipt, ...options.receipt };
  const snapshot = { change_order: { id, total_cents: 10000, title: 'Reviewed synthetic scope', lines: [{ title: 'Synthetic work' }] }, party: { email: 'customer@example.invalid' } };
  const source = { order: { id, edit_revision: 4, change_order_number: 'CO-SYNTHETIC', title: 'Reviewed synthetic scope', total_cents: 10000,
    original_approved_amount_cents: 50000, customers: { display_name: 'Synthetic Customer', email: ' Customer@Example.Invalid ' }, organizations: null, approval_contact: null }, snapshot };
  const row = { ...(options.newRequest ? { id: deliveryId, state: 'prepared', repair_state: 'pending', history_recorded: false } : acceptedRow), ...options.row };
  const transport = async input => { transports.push(input); return delivery.deliveryResult(acceptedRow); };
  const actions = load('../src/lib/actions/change-orders.ts', {
    '@/lib/email/delivery-commands': { callDeliveryCommand: async (db, name, args) => {
      assert.equal(db, serviceDB, 'delivery commands use only the server client'); calls.push({ name, args }); events.push(name);
      if (options.errors?.[name]) return { data: null, error: options.errors[name] };
      if (name === 'get_change_order_send_request') return { data: options.recovered !== undefined ? options.recovered : options.newRequest ? null : receipt, error: null };
      if (name === 'get_change_order_send_source') return { data: options.source !== undefined ? options.source : source, error: null };
      if (name === 'prepare_change_order_send') return { data: options.prepared !== undefined ? options.prepared : receipt, error: null };
      if (name === 'get_outbound_delivery') return { data: row, error: null };
      assert.fail('Unexpected command ' + name);
    } },
    'next/cache': { revalidatePath: value => paths.push(value) },
    '@/lib/activity-log': { recordActivity: () => assert.fail('Preparation history belongs to the atomic command') },
    '@/lib/auth/roles': { getUserRoles: async () => options.roles ?? ['estimator'], hasAllowedRole: (roles, allowed) => roles.some(role => allowed.includes(role)), platformRoleGroups: { internalStaff: ['owner', 'admin', 'payroll_admin', 'estimator'] } },
    '@/lib/data/change-orders': { getChangeOrderDetail: () => assert.fail('Sending must never re-read/recompose an unbound record') },
    '@/lib/notifications/source-events': {}, '@/lib/portal/tokens': {},
    '@/lib/email/send': { sendEmailTransport: transport },
    '@/lib/email/config': { getEmailSetupState: () => ({ configured: options.configured !== false, from: 'Angel Tree <synthetic@example.invalid>', replyTo: 'office@example.invalid' }) },
    '@/lib/email/delivery': { deliveryResult: delivery.deliveryResult, freezeEmailPayload: (input, envelope) => { frozen.push({ input, envelope }); return delivery.freezeEmailPayload(input, envelope); },
      dispatchSavedEmail: async (savedId, db, send) => { events.push('dispatch'); assert.equal(db, serviceDB); assert.equal(send, transport); dispatches.push(savedId); return options.dispatchResult ?? send({ deliveryId: savedId }); } },
    '@/lib/email/delivery-followups': { completeDeliveryFollowups: async (db, savedId, result) => { assert.equal(db, serviceDB); followups.push(savedId); return result; } },
    '@/lib/portal/change-order-links': { createOrGetChangeOrderPortalTokenRecord: async args => { events.push('portal-token'); assert.deepEqual(args, { changeOrderId: id, supabase: authDB, requestId: request, revision: 4, linkVersion }); return { error: null, rawToken: 'synthetic-private-capability', tokenId }; } },
    '@/lib/portal/urls': { getPortalUrl: async (kind, raw) => { events.push('portal-url'); assert.equal(kind, 'change-order'); assert.equal(raw, 'synthetic-private-capability'); return 'https://synthetic.invalid/change-order/synthetic-private-capability'; } },
    '@/lib/supabase/server': { createClient: async () => authDB }, '@/lib/supabase/admin': { getServiceRoleClient: () => options.unavailable ? null : serviceDB },
    '@/lib/security/portal-rate-limit': {}, '@/lib/security/errors': { safeStaffMessage: value => value },
  });
  return { calls, events, paths, dispatches, transports, followups, frozen, snapshot, run: (overrides = {}) => actions.sendChangeOrderEmail({}, form(overrides)) };
}

test('first send binds actual staff, page revision, selected token, frozen envelope and reviewed source before dispatch', async () => {
  const f = fixture({ newRequest: true }), result = await f.run({ actor_id: randomUUID(), recipient: 'forged@example.invalid' });
  assert.equal(result.status, 'success'); assert.equal(result.saveDestination, `/admin/change-orders/${id}?email_confirmed=1`);
  assert.deepEqual(f.events, ['get_change_order_send_request', 'get_change_order_send_source', 'portal-token', 'portal-url', 'prepare_change_order_send', 'get_outbound_delivery', 'dispatch']);
  const args = f.calls.find(call => call.name === 'prepare_change_order_send').args;
  assert.deepEqual({ ...args, p_payload: undefined, p_expected_snapshot: undefined }, { p_request_id: request, p_change_order_id: id, p_expected_revision: 4, p_actor_id: uid, p_additional_copy: false, p_portal_token_id: tokenId, p_payload: undefined, p_expected_snapshot: undefined });
  assert.deepEqual(args.p_expected_snapshot, f.snapshot); assert.equal(args.p_payload.from, 'Angel Tree <synthetic@example.invalid>'); assert.equal(args.p_payload.reply_to, 'office@example.invalid');
  assert.deepEqual(args.p_payload.to, ['customer@example.invalid']); assert.deepEqual(args.p_payload.cc, []); assert.equal(args.p_payload.subject, 'CO-SYNTHETIC: Reviewed synthetic scope');
  assert.match(args.p_payload.text, /Additional amount: \$100\.00/); assert.match(args.p_payload.text, /Revised combined amount: \$600\.00/); assert.match(args.p_payload.text, /synthetic-private-capability/);
  assert.deepEqual(f.dispatches, [deliveryId]); assert.equal(f.transports.length, 1); assert.deepEqual(f.followups, [deliveryId]); assert.ok(f.paths.includes(`/admin/jobs/${job}`));
});
test('accepted recovery confirms saved delivery before reading current content or making a new portal link', async () => {
  const f = fixture({ receipt: { current_revision: 9, current_status: 'cancelled', replayed: true } }), result = await f.run({ expected_link_version: '' });
  assert.equal(result.status, 'success'); assert.deepEqual(f.calls.map(call => call.name), ['get_change_order_send_request', 'get_outbound_delivery']);
  assert.equal(f.frozen.length, 0); assert.deepEqual(f.dispatches, []); assert.deepEqual(f.transports, []); assert.deepEqual(f.followups, [deliveryId]);
});
test('an uncommitted legacy send request needs a reviewed link digest while already committed legacy requests remain recoverable', async () => {
  for (const digest of ['', 'bad', 'A'.repeat(64)]) {
    const pending = fixture({ newRequest: true }), result = await pending.run({ expected_link_version: digest });
    assert.equal(result.status, 'error'); assert.equal(result.saveRejected, true); assert.equal(result.reviewRequired, true);
    assert.deepEqual(pending.events, ['get_change_order_send_request']); assert.equal(pending.transports.length, 0);
  }
  const committed = fixture({ receipt: { replayed: true } }), recovered = await committed.run({ expected_link_version: '' });
  assert.equal(recovered.status, 'success'); assert.deepEqual(committed.events, ['get_change_order_send_request', 'get_outbound_delivery']);
  assert.equal(committed.transports.length, 0); assert.equal(committed.frozen.length, 0);
});
test('unknown or already dispatching recovery never rebuilds or redispatches customer email', async () => {
  for (const state of ['unknown', 'dispatching']) {
    const f = fixture({ row: { state, repair_state: 'needs_review', history_recorded: false } }), result = await f.run();
    assert.equal(result.status, 'error'); assert.match(result.message, /Delivery review/); assert.equal(result.saveDestination, undefined);
    assert.deepEqual(f.calls.map(call => call.name), ['get_change_order_send_request', 'get_outbound_delivery']); assert.equal(f.frozen.length, 0); assert.equal(f.dispatches.length, 0); assert.equal(f.transports.length, 0); assert.equal(f.followups.length, 0);
  }
});
test('accepted email with unreconciled history remains a repair outcome and never authorizes another transport', async () => {
  const f = fixture({ row: { repair_state: 'source_changed', history_recorded: false } }), result = await f.run();
  assert.equal(result.status, 'error'); assert.match(result.message, /Email accepted.*history needs review/); assert.equal(result.saveDestination, undefined);
  assert.deepEqual(f.dispatches, []); assert.deepEqual(f.transports, []); assert.deepEqual(f.followups, [deliveryId]); assert.equal(f.frozen.length, 0);
});
test('only saved prepared or explicitly retry-authorized rejected requests dispatch their original delivery', async () => {
  for (const row of [{ state: 'prepared' }, { state: 'rejected', retry_authorized: true }]) {
    const f = fixture({ row }), result = await f.run(); assert.equal(result.status, 'success'); assert.deepEqual(f.dispatches, [deliveryId]); assert.equal(f.frozen.length, 0);
  }
  const f = fixture({ row: { state: 'rejected', retry_authorized: false } }); assert.equal((await f.run()).status, 'error'); assert.equal(f.dispatches.length, 0);
});
test('definite lookup or preparation conflicts require review while uncertain acknowledgements retain retry identity', async () => {
  for (const name of ['get_change_order_send_request', 'get_change_order_send_source', 'prepare_change_order_send']) for (const code of ['PT409', '40001', '23514', '42501']) {
    const f = fixture({ newRequest: true, errors: { [name]: { code, message: 'Review the current record' } } }), result = await f.run();
    assert.equal(result.saveRejected, true); assert.equal(result.reviewRequired, true); assert.equal(result.saveDestination, undefined); assert.equal(f.dispatches.length, 0);
  }
  for (const name of ['get_change_order_send_request', 'prepare_change_order_send']) {
    const f = fixture({ newRequest: true, errors: { [name]: { code: 'DELIVERY_UNCONFIRMED', message: 'Private provider/database diagnostic' } } }), result = await f.run();
    assert.equal(result.saveRejected, false); assert.equal(result.reviewRequired, false); assert.match(result.message, /same request/); assert.doesNotMatch(result.message, /Private/); assert.equal(f.dispatches.length, 0);
  }
});
test('malformed recovered or newly prepared receipts cannot authorize delivery lookup or transport', async () => {
  for (const data of [{}, { ...storedReceipt, request_id: randomUUID() }, { ...storedReceipt, id: randomUUID() }, { ...storedReceipt, reviewed_revision: 5 }, { ...storedReceipt, additional_copy: true }, { ...storedReceipt, delivery_id: 'bad' }, { ...storedReceipt, job_id: 'bad' }, { ...storedReceipt, organization_id: 'bad' }, { ...storedReceipt, current_revision: 3 }, { ...storedReceipt, replayed: null }]) {
    for (const options of [{ recovered: data }, { newRequest: true, prepared: data }]) {
      const f = fixture(options); assert.equal((await f.run()).status, 'error'); assert.equal(f.calls.some(call => call.name === 'get_outbound_delivery'), false); assert.equal(f.dispatches.length, 0); assert.equal(f.paths.length, 0);
    }
  }
  const f = fixture({ row: { id: randomUUID() } }); assert.equal((await f.run()).status, 'error'); assert.equal(f.dispatches.length, 0);
});
test('missing or malformed reviewed source cannot create a token, prepare email or dispatch', async () => {
  for (const source of [null, {}, { order: { id, edit_revision: 5 }, snapshot: {} }, { order: { id, edit_revision: 4, total_cents: NaN } }]) {
    const f = fixture({ newRequest: true, source }); assert.equal((await f.run()).status, 'error'); assert.equal(f.events.includes('portal-token'), false); assert.equal(f.frozen.length, 0); assert.equal(f.dispatches.length, 0);
  }
});
test('unconfigured sending saves a first request and leaves it recoverable without transport', async () => {
  const f = fixture({ newRequest: true, configured: false }), result = await f.run(); assert.equal(result.status, 'error'); assert.match(result.message, /request is saved; no email was sent/);
  assert.ok(f.calls.some(call => call.name === 'prepare_change_order_send')); assert.equal(f.dispatches.length, 0); assert.equal(f.transports.length, 0); assert.equal(f.followups.length, 0); assert.notEqual(result.saveRejected, true);
});
test('explicit additional email binds its distinct intent and an uncertain transport never claims completion', async () => {
  const f = fixture({ newRequest: true, receipt: { additional_copy: true }, dispatchResult: delivery.deliveryResult({ ...acceptedRow, state: 'unknown' }) }), result = await f.run({ additional_copy: '1' });
  assert.ok(f.calls.filter(call => ['get_change_order_send_request', 'prepare_change_order_send'].includes(call.name)).every(call => call.args.p_additional_copy === true));
  assert.equal(result.status, 'error'); assert.equal(result.saveDestination, undefined); assert.equal(f.followups.length, 0); assert.deepEqual(f.dispatches, [deliveryId]);
});
test('invalid identifiers, unsupported copy flags, unavailable service storage and unauthorized sessions never prepare delivery', async () => {
  for (const input of [{ request_id: '' }, { change_order_id: 'bad' }, { expected_revision: '' }, { expected_revision: '-1' }, { expected_revision: '2.5' }, { expected_revision: '9007199254740992' }, { additional_copy: 'yes' }]) {
    const f = fixture(); assert.equal((await f.run(input)).status, 'error'); assert.equal(f.calls.length, 0); assert.equal(f.transports.length, 0);
  }
  for (const options of [{ unavailable: true }, { signedOut: true }, { roles: ['crew'] }]) { const f = fixture(options); assert.equal((await f.run()).status, 'error'); assert.equal(f.calls.length, 0); }
});
test('pending browser send identity survives source edits and reloads while storing only opaque identity', () => {
  const values = new Map(), storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const one = prepareSendAttempt(id, 4, false, storage), reloaded = prepareSendAttempt(id, 9, true, storage);
  assert.deepEqual(reloaded, one); assert.deepEqual(readSendAttempt(id, storage), one); assert.equal(reloaded.additionalCopy, false); assert.equal(reloaded.revision, 4);
  assert.deepEqual(Object.keys(JSON.parse([...values.values()][0])).sort(), ['additionalCopy', 'requestId', 'revision', 'sourceId']);
  const another = prepareSendAttempt(randomUUID(), 9, true, storage); assert.notEqual(another.requestId, one.requestId); forgetSendAttempt(id, storage); assert.equal(readSendAttempt(id, storage), undefined); assert.equal(prepareSendAttempt(id, 9, true, storage).revision, 9);
});
test('browser recovery rejects malformed cached requests and retains in-memory identity when storage is unavailable', () => {
  const broken = { getItem() { throw Error('unavailable'); }, setItem() { throw Error('unavailable'); }, removeItem() { throw Error('unavailable'); } };
  const one = prepareSendAttempt(id, 4, false, broken); assert.deepEqual(prepareSendAttempt(id, 9, true, broken, one), one); assert.doesNotThrow(() => forgetSendAttempt(id, broken));
  for (const record of [{ requestId: 'bad', sourceId: id, revision: 4, additionalCopy: false }, { requestId: request, sourceId: randomUUID(), revision: 4, additionalCopy: false }, { requestId: request, sourceId: id, revision: -1, additionalCopy: false }, { requestId: request, sourceId: id, revision: 4, additionalCopy: 'yes' }]) assert.equal(readSendAttempt(id, { ...broken, getItem: () => JSON.stringify(record) }), undefined);
  const withPrivateFields = { requestId: request, sourceId: id, revision: 4, additionalCopy: false, recipient: 'synthetic@example.invalid', portalToken: 'synthetic-capability' };
  assert.deepEqual(readSendAttempt(id, { ...broken, getItem: () => JSON.stringify(withPrivateFields) }), { requestId: request, sourceId: id, revision: 4, additionalCopy: false });
});
test('new browser send attempts retain the reviewed link digest across reload without storing a capability', () => {
  const values = new Map(), storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const original = prepareSendAttempt(id, 4, false, storage, undefined, linkVersion);
  assert.equal(original.linkVersion, linkVersion);
  const recovered = prepareSendAttempt(id, 9, true, storage, undefined, 'b2'.repeat(32));
  assert.deepEqual(recovered, original); assert.deepEqual(readSendAttempt(id, storage), original);
  assert.deepEqual(Object.keys(JSON.parse([...values.values()][0])).sort(), ['additionalCopy', 'linkVersion', 'requestId', 'revision', 'sourceId']);
  const opaque = JSON.stringify({ ...original, rawToken: 'synthetic-private-capability', portalUrl: 'https://synthetic.invalid/private' });
  storage.setItem(`change-order-email:${id}`, opaque);
  assert.deepEqual(readSendAttempt(id, storage), original);
  storage.setItem(`change-order-email:${id}`, JSON.stringify({ ...original, linkVersion: 'bad' }));
  assert.equal(readSendAttempt(id, storage).linkVersion, undefined);
});
