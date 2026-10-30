// Explicit synthetic authority/lifecycle fixture. This is not an office API or
// a production transport. Only tests can approve, revoke or cancel these rows.
import { randomUUID } from 'node:crypto';
import { liveFixture } from '../live/test-fixture.mjs';
import { createIsolatedLiveClient } from '../live/client.mjs';
import { LIVE_PREPARE_PATH, LIVE_RENEW_PATH, LIVE_STATUS_PATH, canonicalLiveHandoff,
  priceLiveOrder } from './live-contract.mjs';
import { OFFICE_PRICE_REQUEST_PATH, OFFICE_PRICE_STATUS_PATH, OFFICE_ORDER_STATUS_PATH,
  officeBinding, parseOfficePriceRequest, parseOfficePriceStatusRequest,
  parseOfficeOrderStatusRequest, verifyOfficeSignature } from './office-contract.mjs';
import { createIsolatedOfficeClient } from './client.mjs';

export function officeFixture() {
  const source = liveFixture(), drafts = new Map(), workflows = new Map();
  const keyId = 'isolated-office-website-tests', secret = 'c'.repeat(64);
  let losePrice = false, losePrepare = false, unavailable = false, cancelDuringRenew = false;
  let transformPrice = value => value, transformStatus = value => value, officeCalls = 0;
  const same = (a, b) => canonicalLiveHandoff(a) === canonicalLiveHandoff(b);
  const json = (body, status = 200) => Response.json(body, { status });
  const hold = (state, id = [...source.mappings.keys()].at(-1)) => {
    const previous = workflows.get(id) ?? { state: 'active', revision: 0 };
    workflows.set(id, { ...previous, state, revision: previous.revision + 1 });
    const m = source.mappings.get(id); if (m) m.status = { ...m.status, observation_revision: m.status.observation_revision + 1 };
  };
  const live = createIsolatedLiveClient({ keyId: source.keyId, secret: source.secret, now: source.now,
    handle: async request => {
      const path = new URL(request.url).pathname;
      if (path === LIVE_STATUS_PATH) return json({ code: 'office_lifecycle_required' }, 503);
      if (path === LIVE_PREPARE_PATH) {
        const input = await request.clone().json(), approval = input.order.office_approval;
        const existing = source.mappings.get(input.order_id);
        if (existing && !same(existing.request, input)) return json({ code: 'accepted_order_conflict' }, 409);
        if (!existing && approval !== null) {
          const trusted = drafts.get(input.order_id), selected = input.order;
          if (!trusted || trusted.receipt.status !== 'approved' || Date.parse(trusted.receipt.approval.expires_at) <= source.now()
            || !same(Object.fromEntries(['approval_id', 'approved_at_ms', 'residential', 'single_discount_confirmed'].map(k => [k, trusted.receipt.approval[k]])), approval)
            || !same(trusted.request.draft, { quantity: selected.quantity, stacking: selected.stacking, contact: selected.contact })
            || !same(trusted.receipt.prices, { wood_cents: selected.wood_cents, stacking_cents: selected.stacking_cents, principal_cents: selected.principal_cents })) return json({ code: 'office_approval_required' }, 409);
        }
      }
      const parsed = await request.clone().json(), flow = workflows.get(parsed.order_id);
      const held = flow?.state !== undefined && flow.state !== 'active';
      if (held && (path !== LIVE_PREPARE_PATH || !source.mappings.has(parsed.order_id))) return json({ code: 'office_order_held' }, 409);
      const response = await source.handle(request);
      if (path === LIVE_PREPARE_PATH) {
        if (!workflows.has(parsed.order_id)) workflows.set(parsed.order_id, { state: 'active', revision: 0, issuedAt: new Date(source.now()).toISOString(), creditId: null, creditCents: 0 });
        if (losePrepare) { losePrepare = false; throw Error('lost_preparation_reply'); }
      }
      if (path === LIVE_RENEW_PATH && cancelDuringRenew) { cancelDuringRenew = false; hold('cancellation_requested', parsed.order_id); }
      if (held) return json({ ...await response.json(), payment_execution_ready: false, execution_blockers: ['office_order_held'], portal_url: null });
      return response;
    } });
  async function handle(request) {
    officeCalls++; const path = new URL(request.url).pathname, raw = await request.text();
    if (request.headers.get('x-ats-key-id') !== keyId || !verifyOfficeSignature({ raw, timestamp: request.headers.get('x-ats-timestamp'),
      signature: request.headers.get('x-ats-signature'), secret, path, nowMs: source.now() })) return json({}, 401);
    if (unavailable) return json({}, 503);
    const input = JSON.parse(raw);
    if (path === OFFICE_PRICE_REQUEST_PATH) {
      const value = parseOfficePriceRequest(input, { allowSyntheticContacts: true }); let saved = drafts.get(value.order_id);
      if (saved && !same(saved.request, value)) return json({}, 409);
      if (!saved) { saved = { request: value, receipt: { ...officeBinding(value.order_id), draft_hash: value.draft_hash,
        revision: 1, status: 'pending', approval: null, prices: null } }; drafts.set(value.order_id, saved); }
      if (losePrice) { losePrice = false; throw Error('lost_price_reply'); }
      return json(transformPrice(structuredClone(saved.receipt)));
    }
    if (path === OFFICE_PRICE_STATUS_PATH) {
      const value = parseOfficePriceStatusRequest(input), saved = drafts.get(value.order_id);
      if (!saved || saved.request.draft_hash !== value.draft_hash) return json({}, 409);
      return json(transformPrice(structuredClone(saved.receipt)));
    }
    if (path === OFFICE_ORDER_STATUS_PATH) {
      const value = parseOfficeOrderStatusRequest(input), mapping = source.mappings.get(value.order_id), workflow = workflows.get(value.order_id);
      if (!mapping || mapping.request.snapshot_hash !== value.snapshot_hash || mapping.receipt.invoice_id !== value.invoice_id || !workflow) return json({}, 409);
      const principal = mapping.request.order.principal_cents, raw = mapping.status.totals.balance_due_cents;
      return json(transformStatus({ ...structuredClone(mapping.status), ...officeBinding(value.order_id), order_state: workflow.state,
        workflow_revision: workflow.revision, fulfillment_ready: workflow.state === 'active' && !workflow.creditId && mapping.status.fulfillment_ready,
        accounting: { issued_at: workflow.issuedAt, original_principal_cents: principal, raw_balance_due_cents: raw,
          credited_principal_cents: workflow.creditCents, collectible_balance_cents: Math.max(0, raw - workflow.creditCents), credit_id: workflow.creditId } }));
    }
    return json({}, 404);
  }
  const office = createIsolatedOfficeClient({ handle, keyId, secret, now: source.now });
  return { live, office, source, drafts, workflows, now: source.now, advance: source.advance, handle, keyId, secret,
    credit(id = [...source.mappings.keys()].at(-1)) {
      const m = source.mappings.get(id), flow = workflows.get(id);
      if (!m || flow.state !== 'cancellation_requested' || m.status.payment_pending || !['failed', 'refunded'].includes(m.status.payment_state)
        || m.status.totals.gross_refunded_cents !== m.status.totals.gross_collected_cents) throw Error('reviewed_refunded_cancellation_required');
      if (flow.creditId) return flow.creditId;
      flow.creditId = randomUUID(); flow.creditCents = m.request.order.principal_cents; flow.revision++;
      m.status = { ...m.status, observation_revision: m.status.observation_revision + 1 }; return flow.creditId;
    },
    calls: () => officeCalls, unavailable: value => { unavailable = value; },
    loseNextPrice: () => { losePrice = true; }, loseNextPrepare: () => { losePrepare = true; },
    cancelOnRenew: () => { cancelDuringRenew = true; }, hold,
    transformPrice: fn => { transformPrice = fn; }, transformStatus: fn => { transformStatus = fn; },
    approve(id = [...drafts.keys()].at(-1)) {
      const saved = drafts.get(id), base = priceLiveOrder(saved.request.draft), wood = Math.round(base.wood_cents * .95), stack = Math.round(base.stacking_cents * .95);
      saved.receipt = { ...saved.receipt, revision: saved.receipt.revision + 1, status: 'approved',
        approval: { approval_id: randomUUID(), approved_at_ms: source.now(), residential: true,
          single_discount_confirmed: true, expires_at: new Date(source.now() + 3600000).toISOString() },
        prices: { wood_cents: wood, stacking_cents: stack, principal_cents: wood + stack } };
      return structuredClone(saved.receipt);
    },
    revoke(id = [...drafts.keys()].at(-1)) {
      const saved = drafts.get(id); saved.receipt = { ...saved.receipt, revision: saved.receipt.revision + 1,
        status: 'revoked', approval: null, prices: null };
    },
  };
}
