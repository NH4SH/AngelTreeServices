// Real candidate sender/dispatcher; all DB, context and provider IO are synthetic and explicit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve, dirname, relative, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url)), sourceRoot = resolve(here, '../crm-runtime/source');
const require = createRequire(import.meta.url), ts = require('/Users/noelsierra/Documents/Codex/2026-10-29/firewood-finalization/recovery/private-release/source/apps/platform/node_modules/typescript');
await mkdir(join(here, 'generated'), { recursive: true });
const output = await mkdtemp(join(here, 'generated', 'owned-')), memo = new Map(), pins = [];
const stubs = {};
for (const [name, content] of Object.entries({
  server: 'export {};',
  context: 'export function readReleasedContext(mode){return globalThis.ATS_RECEIPT_FIXTURE.readContext(mode);}',
  admin: 'export function getServiceRoleClient(){return globalThis.ATS_RECEIPT_FIXTURE.db;}',
  config: 'export function getEmailProviderConfig(){return {apiKey:"synthetic_unit_key_not_real",from:"ATS <test@fixture.invalid>",replyTo:"office@fixture.invalid"};}export function getEmailSetupState(){return {configured:true,from:"ATS <test@fixture.invalid>",replyTo:"office@fixture.invalid"};}',
  followups: 'export async function completeDeliveryFollowups(db,id,result){return result;}',
})) { stubs[name] = join(output, name + '.stub.mjs'); await writeFile(stubs[name], content); }
async function compile(path) {
  path = resolve(path); if (memo.has(path)) return memo.get(path);
  const out = join(output, relative(sourceRoot, path).replace(/\.ts$/u, '.mjs')); memo.set(path, out);
  const bytes = await readFile(path); pins.push({ path: relative(sourceRoot, path), sha256: createHash('sha256').update(bytes).digest('hex') });
  let code = bytes.toString();
  if (path.endsWith('.ts')) code = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const match of [...code.matchAll(/(?:\bfrom\s*|\bimport\s*)['"]([^'"]+)['"]/gu)]) {
    const name = match[1]; let target;
    if (name === 'server-only') target = stubs.server;
    else if (name.includes('runtime-admission/released-context.mjs')) target = stubs.context;
    else if (name === '@/lib/supabase/admin') target = stubs.admin;
    else if (name === '@/lib/email/config') target = stubs.config;
    else if (name === '@/lib/email/delivery-followups') target = stubs.followups;
    else if (name.startsWith('node:')) continue;
    else if (name.startsWith('@/')) target = await compile(join(sourceRoot, 'src', name.slice(2)) + '.ts');
    else if (name.startsWith('.')) {
      let local = resolve(dirname(path), name); if (!/\.(?:ts|mjs)$/u.test(local)) local += '.ts'; target = await compile(local);
    } else throw Error('Unexpected test runtime import: ' + name);
    code = code.replace(match[0], () => match[0].replace(name, () => pathToFileURL(target).href));
  }
  await mkdir(dirname(out), { recursive: true }); await writeFile(out, code); return out;
}
const delivery = await import(pathToFileURL(await compile(join(sourceRoot, 'src/lib/email/delivery.ts'))));
const sender = await import(pathToFileURL(await compile(join(sourceRoot, 'src/lib/email/send.ts'))));
const contract = await import(pathToFileURL(await compile(join(sourceRoot, 'src/lib/firewood/handoff/live-contract.mjs'))));
const id = '00000000-0000-4000-8000-000000000001', paymentId = '00000000-0000-4000-8000-000000000002';
const invoiceId = '00000000-0000-4000-8000-000000000003', orderId = '00000000-0000-4000-8000-000000000004';
const attemptId = '00000000-0000-4000-8000-000000000005';
const copy = value => structuredClone(value);
const originalFetch = globalThis.fetch;
test.after(() => { globalThis.fetch = originalFetch; delete globalThis.ATS_RECEIPT_FIXTURE; });
function fixture({ ordinary = false, emailType = 'payment_confirmation' } = {}) {
  const state = { sending: true, collection: false, fetches: [], commands: [], reads: [], aliases: ['original-request', 'same-payment-alias'], history: [], attempts: [],
    source: { managed: true, contract: contract.LIVE_HANDOFF_CONTRACT, source_id: contract.LIVE_HANDOFF_SOURCE,
      environment_id: contract.LIVE_HANDOFF_ENVIRONMENT, account_id: contract.LIVE_ACCOUNT, mode: 'live', livemode: true,
      terms_hash: contract.LIVE_TERMS_HASH, payment_policy_hash: contract.LIVE_PAYMENT_POLICY_HASH,
      invoice_id: invoiceId, order_id: orderId, sender_enabled: true, allowed: false, receipt_authority: 'crm',
      order_state: 'cancellation_requested', surcharge_reporting: false },
    payment: { id: paymentId, invoice_id: invoiceId, status: 'succeeded' },
    invoice: { id: invoiceId, invoice_number: ordinary ? 'INV-ORDINARY' : 'INV-FW-' + orderId.toUpperCase(),
      document_terms_version: ordinary ? 'legacy-2026-10-22' : contract.LIVE_TERMS_POLICY.version },
    row: { id, state: 'prepared', repair_state: 'pending', provider_message_id: null, provider_key: 'receipt/payment/' + paymentId,
      attempt_count: 0, retry_authorized: false, context: { kind: 'other', email_type: emailType, invoice_id: invoiceId, payment_id: paymentId },
      payload: { from: 'ATS <test@fixture.invalid>', reply_to: 'office@fixture.invalid', to: ['customer@fixture.invalid'], cc: [], subject: 'Payment received', text: 'Synthetic receipt.' } },
    onClaim: null, onFetch: null, claimDenied: false, claimAckLost: false, getUnavailable: false };
  if (ordinary) state.source = { managed: false };
  const db = { rpc(name, args) { state.commands.push({ name, args: copy(args) }); return { async abortSignal() {
    if (name === 'get_firewood_live_collector_context') return { data: copy(state.source), error: null };
    if (name === 'get_outbound_delivery') return state.getUnavailable ? { data: null, error: { code: 'synthetic' } }
      : { data: { ...copy(state.row), history_recorded: state.history.length > 0 }, error: null };
    if (name === 'claim_outbound_delivery') {
      if (state.claimDenied || !['prepared', 'rejected'].includes(state.row.state)) return { data: null, error: null };
      state.row.state = 'dispatching'; state.row.attempt_id = attemptId; state.row.attempt_count++;
      state.attempts.push({ id: attemptId, outcome: null }); await state.onClaim?.();
      if (state.claimAckLost) return { data: null, error: { code: 'synthetic_ack_lost' } };
      return { data: { id, attempt_id: attemptId, payload: copy(state.row.payload), context: copy(state.row.context), idempotency_key: state.row.provider_key }, error: null };
    }
    if (name === 'finish_outbound_delivery') {
      assert.equal(args.p_delivery_id, id); assert.equal(args.p_attempt_id, attemptId);
      if (state.row.state !== 'accepted') {
        state.row.state = args.p_outcome; state.row.provider_message_id = args.p_provider_message_id;
        state.row.repair_state = args.p_outcome === 'accepted' ? 'complete' : 'needs_review'; state.row.retry_authorized = false;
      }
      state.attempts[0].outcome ??= args.p_outcome;
      if (!state.history.length) state.history.push({ delivery: id, outcome: args.p_outcome, provider: args.p_provider_message_id });
      return { data: { ...copy(state.row), history_recorded: true }, error: null };
    }
    throw Error('Unexpected RPC: ' + name);
  } }; }, from(table) { assert.ok(['payments', 'invoices'].includes(table), table); return {
    select(columns) { state.reads.push({ table, columns }); return this; }, eq(field, value) { assert.equal(field, 'id'); this.id = value; return this; },
    abortSignal() { return this; }, async maybeSingle() { return { data: copy(table === 'payments' ? state.payment : state.invoice), error: null }; },
  }; } };
  state.db = db;
  state.readContext = mode => state.sending ? {
    mode, modes: { status: true, sending: true, collection: state.collection }, ...{
      contract: contract.LIVE_HANDOFF_CONTRACT, source: contract.LIVE_HANDOFF_SOURCE, environment: contract.LIVE_HANDOFF_ENVIRONMENT,
      account: contract.LIVE_ACCOUNT, portalOrigin: contract.LIVE_PORTAL_ORIGIN, websiteOrigin: contract.LIVE_WEBSITE_ORIGIN,
      termsHash: contract.LIVE_TERMS_HASH, paymentPolicyHash: contract.LIVE_PAYMENT_POLICY_HASH },
    namespace: 'ats-home-continuous-abcdef123456', generation: 4, bindingSha256: 'a'.repeat(64), schemaSha256: 'b'.repeat(64),
    releaseSha256: 'c'.repeat(64), authorityPublicKeyFingerprint: 'd'.repeat(64), installationOverlaySha256: 'e'.repeat(64),
    signingKeyId: 'synthetic-key', signingKeyFingerprint: 'f'.repeat(64), stripeKeyFingerprint: '1'.repeat(64),
    sourceId: 'ats_crm_primary_20261029', systemIdentifier: '7700000000000000000', sourceBoot: 'synthetic', databaseBoot: 'synthetic',
    topologyFingerprint: '2'.repeat(32), timeline: 1, observedAtMs: Date.now(), expiresAtMs: Date.now() + 10000,
  } : null;
  globalThis.ATS_RECEIPT_FIXTURE = state;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.resend.com/emails'); state.fetches.push({ url, options });
    if (state.onFetch) return state.onFetch();
    return { ok: true, status: 200, json: async () => ({ id: 'synthetic_provider_accepted' }) };
  };
  return state;
}
const dispatch = state => delivery.dispatchSavedEmail(id, state.db, sender.sendEmailTransport);
const count = (s, command) => s.commands.filter(c => c.name === command).length;
for (const [name, change] of [
  ['sending mode', s => { s.sending = false; }], ['source sender', s => { s.source.sender_enabled = false; }],
  ['wrong source account', s => { s.source.account_id = 'foreign'; }], ['refunded payment', s => { s.payment.status = 'refunded'; }],
  ['wrong declared invoice', s => { s.row.context.invoice_id = '00000000-0000-4000-8000-000000000099'; }],
  ['missing declared live invoice', s => { s.row.context.invoice_id = null; }],
  ['registered invoice lost live markers', s => { s.invoice.invoice_number = 'INV-ORDINARY'; s.invoice.document_terms_version = 'legacy-2026-10-22'; }],
]) test('preclaim ' + name + ' hold preserves prepared delivery, aliases and history with no attempt', async () => {
  const s = fixture(); change(s); const prior = copy(s.row), aliases = copy(s.aliases);
  const result = await dispatch(s); assert.equal(result.outcome, 'not_attempted'); assert.equal(s.fetches.length, 0);
  assert.equal(count(s, 'claim_outbound_delivery'), 0); assert.deepEqual(s.row, prior); assert.deepEqual(s.aliases, aliases);
  assert.equal(s.attempts.length, 0); assert.equal(s.history.length, 0);
});
test('late valid receipt is accepted despite collection/preparation/cancellation holds', async () => {
  const s = fixture(); const result = await dispatch(s); assert.equal(result.ok, true); assert.equal(s.fetches.length, 1);
  assert.equal(s.row.state, 'accepted'); assert.equal(s.attempts.length, 1); assert.equal(s.history.length, 1);
  assert.equal(JSON.parse(s.fetches[0].options.body).tags[0].value, id);
});
for (const [name, change] of [['sending', s => { s.sending = false; }], ['source', s => { s.source.sender_enabled = false; }]])
  test(name + ' closing after real claim completes the same attempt not_attempted without transport', async () => {
    const s = fixture(); s.onClaim = () => change(s); const result = await dispatch(s);
    assert.equal(result.outcome, 'not_attempted'); assert.equal(s.fetches.length, 0); assert.equal(s.row.state, 'not_attempted');
    assert.equal(s.row.repair_state, 'needs_review'); assert.equal(s.row.retry_authorized, false);
    assert.equal(s.attempts.length, 1); assert.equal(s.attempts[0].id, attemptId); assert.equal(s.attempts[0].outcome, 'not_attempted');
    assert.deepEqual(s.aliases, ['original-request', 'same-payment-alias']);
  });
test('provider-boundary gate catches closure after dispatcher check but before actual provider fetch', async () => {
  const s = fixture(); const result = await delivery.dispatchSavedEmail(id, s.db, input => { s.sending = false; return sender.sendEmailTransport(input); });
  assert.equal(result.outcome, 'not_attempted'); assert.equal(s.fetches.length, 0); assert.equal(s.attempts[0].outcome, 'not_attempted');
});
test('provider timeout after request remains unknown despite sending closing and is never reset or resent', async () => {
  const s = fixture(); s.onFetch = () => { s.sending = false; throw Error('synthetic_provider_timeout'); };
  const first = await dispatch(s); assert.equal(first.outcome, 'unknown'); assert.equal(s.row.state, 'unknown');
  assert.equal(s.attempts[0].outcome, 'unknown'); assert.equal(s.row.retry_authorized, false); assert.equal(s.fetches.length, 1);
  const second = await dispatch(s); assert.equal(second.outcome, 'unknown'); assert.equal(s.fetches.length, 1); assert.equal(s.attempts.length, 1);
});
test('positive acceptance after sender closes remains recordable and later no-resend review is not gated', async () => {
  const s = fixture(); s.onFetch = () => { s.sending = false; s.source.sender_enabled = false; return { ok: true, status: 200, json: async () => ({ id: 'synthetic_provider_accepted' }) }; };
  assert.equal((await dispatch(s)).ok, true); assert.equal(s.row.provider_message_id, 'synthetic_provider_accepted');
  assert.equal((await dispatch(s)).ok, true); assert.equal(s.fetches.length, 1); assert.equal(s.attempts.length, 1); assert.equal(s.history.length, 1);
});
test('ordinary receipt keeps provider request and history behavior while all Firewood sending is held', async () => {
  const s = fixture({ ordinary: true }); s.sending = false;
  assert.equal((await dispatch(s)).ok, true); assert.equal(s.fetches.length, 1); assert.equal(s.row.state, 'accepted');
  const body = JSON.parse(s.fetches[0].options.body);
  assert.deepEqual(body, { from: s.row.payload.from, to: s.row.payload.to, reply_to: s.row.payload.reply_to,
    tags: [{ name: 'crm_delivery_id', value: id }], subject: s.row.payload.subject, text: s.row.payload.text });
  assert.equal(s.fetches[0].options.headers['Idempotency-Key'], s.row.provider_key); assert.equal(s.history.length, 1);
});
test('ordinary nonreceipt email performs no new payment/source reads and retains original provider behavior', async () => {
  const s = fixture({ ordinary: true, emailType: 'invoice' }); s.sending = false;
  assert.equal((await dispatch(s)).ok, true); assert.equal(s.reads.length, 0); assert.equal(count(s, 'get_firewood_live_collector_context'), 0); assert.equal(s.fetches.length, 1);
});
test('saved live receipt cannot borrow another payload after its actual claim', async () => {
  const s = fixture(); const result = await delivery.dispatchSavedEmail(id, s.db, input => sender.sendEmailTransport({ ...input, to: 'different@fixture.invalid' }));
  assert.equal(result.outcome, 'not_attempted'); assert.equal(s.fetches.length, 0); assert.equal(s.attempts[0].outcome, 'not_attempted');
});
test('a caller cannot disguise a saved live receipt as another email type at the provider boundary', async () => {
  const s = fixture(); const result = await delivery.dispatchSavedEmail(id, s.db, input => {
    s.sending = false; return sender.sendEmailTransport({ ...input, emailType: 'invoice' });
  });
  assert.equal(result.outcome, 'not_attempted'); assert.equal(s.fetches.length, 0); assert.equal(s.attempts[0].outcome, 'not_attempted');
});
test('lost native claim acknowledgement preserves uncertainty without provider call or fabricated not_attempted finish', async () => {
  const s = fixture(); s.claimAckLost = true;
  const result = await dispatch(s); assert.equal(result.outcome, 'unknown'); assert.equal(s.fetches.length, 0);
  assert.equal(s.row.state, 'dispatching'); assert.equal(s.attempts[0].outcome, null); assert.equal(count(s, 'finish_outbound_delivery'), 0);
});
test('native claim denial makes no attempt, history or provider call', async () => {
  const s = fixture(); s.claimDenied = true; const prior = copy(s.row);
  assert.equal((await dispatch(s)).outcome, 'not_attempted'); assert.deepEqual(s.row, prior); assert.equal(s.fetches.length, 0); assert.equal(s.history.length, 0);
});
test('unreadable saved delivery cannot fall through to a new claim', async () => {
  const s = fixture(); s.getUnavailable = true;
  assert.equal((await dispatch(s)).outcome, 'not_attempted'); assert.equal(count(s, 'claim_outbound_delivery'), 0); assert.equal(s.fetches.length, 0);
});
test('direct raw live receipt without a saved claimed attempt has no transport or history authority', async () => {
  const s = fixture(); const result = await sender.sendEmailTransport({ to: 'customer@fixture.invalid', subject: 'x', text: 'x', emailType: 'payment_confirmation',
    relatedPaymentId: paymentId, relatedInvoiceId: invoiceId });
  assert.equal(result.outcome, 'not_attempted'); assert.equal(s.fetches.length, 0); assert.equal(s.history.length, 0);
});
await writeFile(join(output, 'HARNESS_SOURCE_PINS.json'), JSON.stringify({ scope: 'actual-candidate-sender-dispatcher-with-explicit-synthetic-context-DB-provider-stubs', sourceRoot, pins, noRealProviders: true, noRealDatabase: true }, null, 2) + '\n');
