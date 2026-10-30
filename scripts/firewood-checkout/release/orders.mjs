// Separate native order wrapper. Frozen review code remains unchanged; actual
// native bindings and admission are required before the runtime can use it.
import { randomUUID } from 'node:crypto';
import { token, digest, equal, SESSION_MS } from '../production/runtime/checkout.mjs';
import { assertRuntimeDatabase } from './database.mjs';
import { assertLiveClient, liveStoreIdentity, prepareOrderBinding } from './live-client.mjs';
import { orderInput, CheckoutError } from './policy.mjs';
import { canonicalHandoff, handoffDigest, LIVE_TERMS_HASH, LIVE_PAYMENT_POLICY_HASH,
  validatePrepareReceipt } from '../live/contract.mjs';
import { assertOfficeClient, officeIdentity, makeOfficeDraft } from './office-client.mjs';
import { validateOfficeAccounting } from '../office-v2/office-accounting.mjs';

function assertRuntimeBinding(db, live, office) {
  const d = assertRuntimeDatabase(db), l = assertLiveClient(live), o = assertOfficeClient(office);
  if (d.kind === 'isolated' ? !l.isolated || !o.isolated : l.isolated || o.isolated || l.keyId !== d.liveKeyId || o.keyId !== d.officeKeyId)
    throw Error('matching_native_client_database_required');
}

const fail = (message, status = 409) => { throw new CheckoutError(message, status); };
const json = value => JSON.stringify(value);
const same = (a, b) => canonicalHandoff(a) === canonicalHandoff(b);
function identity(live, office) {
  assertLiveClient(live, {}); assertOfficeClient(office, {});
  return handoffDigest({ live: liveStoreIdentity(live), office: officeIdentity(office) });
}
export const officeStoreIdentity = identity;

export async function installOfficeOrderStore(db, live, office) {
  assertRuntimeBinding(db, live, office);
  if (assertRuntimeDatabase(db).kind !== 'isolated') throw Error('guarded_native_installer_required');
  const hash = identity(live, office);
  await db.transaction(async tx => {
    await tx.query('SELECT pg_advisory_xact_lock(987134232)');
    const existing = (await tx.query("SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_type='BASE TABLE'")).rows;
    if (existing.some(row => !row.table_name.startsWith('fwofficev2_'))
      || existing.length && !existing.some(row => row.table_name === 'fwofficev2_identity')) throw Error('fresh_office_namespace_required');
    await tx.query('CREATE TABLE IF NOT EXISTS fwofficev2_identity(id boolean PRIMARY KEY CHECK(id), hash text NOT NULL)');
    const before = (await tx.query('SELECT hash FROM fwofficev2_identity WHERE id=true')).rows[0];
    if (before && before.hash !== hash) throw Error('office_identity_conflict');
    await tx.query('INSERT INTO fwofficev2_identity VALUES(true,$1) ON CONFLICT DO NOTHING', [hash]);
    await tx.query('CREATE TABLE IF NOT EXISTS fwofficev2_sessions(id text PRIMARY KEY, csrf text NOT NULL, expires bigint NOT NULL, draft_id uuid, order_id uuid UNIQUE)');
    await tx.query('CREATE TABLE IF NOT EXISTS fwofficev2_control(id boolean PRIMARY KEY CHECK(id), paused boolean NOT NULL)');
    await tx.query('INSERT INTO fwofficev2_control VALUES(true,true) ON CONFLICT DO NOTHING');
    await tx.query('CREATE TABLE IF NOT EXISTS fwofficev2_rate(id text PRIMARY KEY, at bigint NOT NULL, used integer NOT NULL)');
    await tx.query('CREATE TABLE IF NOT EXISTS fwofficev2_drafts(id uuid PRIMARY KEY, session_id text NOT NULL REFERENCES fwofficev2_sessions(id), request jsonb NOT NULL, created_at bigint NOT NULL)');
    await tx.query(`CREATE TABLE IF NOT EXISTS fwofficev2_price_queue(id uuid PRIMARY KEY REFERENCES fwofficev2_drafts(id),
      status text NOT NULL CHECK(status IN ('pending','requested','review')), tries integer NOT NULL DEFAULT 0,
      retry_at bigint NOT NULL DEFAULT 0, lease uuid, lease_until bigint NOT NULL DEFAULT 0)`);
    await tx.query('CREATE TABLE IF NOT EXISTS fwofficev2_prices(id uuid PRIMARY KEY REFERENCES fwofficev2_drafts(id), revision bigint NOT NULL, receipt jsonb NOT NULL)');
    await tx.query('CREATE TABLE IF NOT EXISTS fwofficev2_price_history(id uuid NOT NULL REFERENCES fwofficev2_drafts(id), revision bigint NOT NULL, receipt jsonb NOT NULL, PRIMARY KEY(id,revision))');
    await tx.query(`CREATE TABLE IF NOT EXISTS fwofficev2_orders(id uuid PRIMARY KEY, session_id text UNIQUE NOT NULL REFERENCES fwofficev2_sessions(id),
      chosen jsonb NOT NULL, request jsonb NOT NULL, office_receipt jsonb, created_at bigint NOT NULL)`);
    await tx.query(`CREATE TABLE IF NOT EXISTS fwofficev2_prepare(id uuid PRIMARY KEY REFERENCES fwofficev2_orders(id),
      status text NOT NULL CHECK(status IN ('pending','prepared','review')), receipt jsonb, invoice_id uuid UNIQUE,
      tries integer NOT NULL DEFAULT 0, retry_at bigint NOT NULL DEFAULT 0, lease uuid, lease_until bigint NOT NULL DEFAULT 0)`);
    await tx.query(`CREATE TABLE IF NOT EXISTS fwofficev2_observations(id uuid PRIMARY KEY REFERENCES fwofficev2_orders(id), revision bigint NOT NULL, receipt jsonb NOT NULL,
      CHECK(COALESCE(receipt->>'order_state' IN ('active','cancellation_requested','cancelled')
        AND jsonb_typeof(receipt->'workflow_revision')='number' AND (receipt->>'workflow_revision')::bigint>=0
        AND jsonb_typeof(receipt->'accounting')='object' AND receipt->'accounting' ?& array['issued_at','original_principal_cents','raw_balance_due_cents','credited_principal_cents','collectible_balance_cents','credit_id'],false)))`);
    await tx.query('CREATE TABLE IF NOT EXISTS fwofficev2_history(id uuid NOT NULL REFERENCES fwofficev2_orders(id), revision bigint NOT NULL, receipt jsonb NOT NULL, PRIMARY KEY(id,revision))');
    await tx.query(`CREATE OR REPLACE FUNCTION fwofficev2_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'immutable_office_history'; END $$`);
    for (const table of ['identity', 'drafts', 'orders', 'price_history', 'history']) {
      await tx.query('DROP TRIGGER IF EXISTS fwofficev2_guard ON fwofficev2_' + table);
      await tx.query('CREATE TRIGGER fwofficev2_guard BEFORE UPDATE OR DELETE ON fwofficev2_' + table + ' FOR EACH ROW EXECUTE FUNCTION fwofficev2_immutable()');
    }
    await tx.query(`CREATE OR REPLACE FUNCTION fwofficev2_observation_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF TG_OP='DELETE' OR NEW.id IS DISTINCT FROM OLD.id OR NEW.revision<OLD.revision
        OR NEW.revision=OLD.revision AND NEW.receipt IS DISTINCT FROM OLD.receipt
        OR NEW.receipt->>'invoice_id' IS DISTINCT FROM OLD.receipt->>'invoice_id'
        OR (NEW.receipt->>'workflow_revision')::bigint < (OLD.receipt->>'workflow_revision')::bigint
        OR NEW.receipt->>'workflow_revision'=OLD.receipt->>'workflow_revision' AND NEW.receipt->>'order_state' IS DISTINCT FROM OLD.receipt->>'order_state'
        OR OLD.receipt->>'order_state'<>'active' AND NEW.receipt->>'order_state'='active'
        OR OLD.receipt->>'order_state'='cancelled' AND NEW.receipt->>'order_state'<>'cancelled'
        OR NEW.receipt#>'{accounting,issued_at}' IS DISTINCT FROM OLD.receipt#>'{accounting,issued_at}'
        OR NEW.receipt#>'{accounting,original_principal_cents}' IS DISTINCT FROM OLD.receipt#>'{accounting,original_principal_cents}'
        OR OLD.receipt#>'{accounting,credit_id}'='null'::jsonb AND NEW.receipt#>'{accounting,credit_id}'<>'null'::jsonb
          AND (NEW.receipt->>'workflow_revision')::bigint<=(OLD.receipt->>'workflow_revision')::bigint
        OR OLD.receipt#>'{accounting,credit_id}'<>'null'::jsonb AND
          (NEW.receipt#>'{accounting,credit_id}' IS DISTINCT FROM OLD.receipt#>'{accounting,credit_id}'
            OR NEW.receipt#>'{accounting,credited_principal_cents}' IS DISTINCT FROM OLD.receipt#>'{accounting,credited_principal_cents}')
        OR OLD.receipt->'original_paid_evidence'<>'null'::jsonb AND NEW.receipt->'original_paid_evidence' IS DISTINCT FROM OLD.receipt->'original_paid_evidence'
      THEN RAISE EXCEPTION 'immutable_office_observation'; END IF; RETURN NEW; END $$`);
    await tx.query('DROP TRIGGER IF EXISTS fwofficev2_guard ON fwofficev2_observations');
    await tx.query('CREATE TRIGGER fwofficev2_guard BEFORE UPDATE OR DELETE ON fwofficev2_observations FOR EACH ROW EXECUTE FUNCTION fwofficev2_observation_guard()');
    await tx.query(`CREATE OR REPLACE FUNCTION fwofficev2_price_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF TG_OP='DELETE' OR NEW.id IS DISTINCT FROM OLD.id OR NEW.revision<OLD.revision
        OR NEW.revision=OLD.revision AND NEW.receipt IS DISTINCT FROM OLD.receipt
      THEN RAISE EXCEPTION 'immutable_office_price'; END IF; RETURN NEW; END $$`);
    await tx.query('DROP TRIGGER IF EXISTS fwofficev2_guard ON fwofficev2_prices');
    await tx.query('CREATE TRIGGER fwofficev2_guard BEFORE UPDATE OR DELETE ON fwofficev2_prices FOR EACH ROW EXECUTE FUNCTION fwofficev2_price_guard()');
    await tx.query(`CREATE OR REPLACE FUNCTION fwofficev2_preparation_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF TG_OP='DELETE' OR NEW.id IS DISTINCT FROM OLD.id OR OLD.invoice_id IS NOT NULL AND NEW.invoice_id IS DISTINCT FROM OLD.invoice_id
      THEN RAISE EXCEPTION 'immutable_office_invoice'; END IF; RETURN NEW; END $$`);
    await tx.query('DROP TRIGGER IF EXISTS fwofficev2_guard ON fwofficev2_prepare');
    await tx.query('CREATE TRIGGER fwofficev2_guard BEFORE UPDATE OR DELETE ON fwofficev2_prepare FOR EACH ROW EXECUTE FUNCTION fwofficev2_preparation_guard()');
  });
}

export function officeOrders({ db, live, office, now = Date.now }) {
  assertRuntimeBinding(db, live, office);
  assertRuntimeDatabase(db); const expectedIdentity = identity(live, office);
  const one = async (sql, args = []) => (await db.query(sql, args)).rows[0] ?? null;
  const ready = async () => { if ((await one('SELECT hash FROM fwofficev2_identity WHERE id=true'))?.hash !== expectedIdentity) throw Error('office_identity_conflict'); };
  async function rate(id, limit = 20) {
    const row = await one(`INSERT INTO fwofficev2_rate VALUES($1,$2,1) ON CONFLICT(id) DO UPDATE SET
      at=CASE WHEN fwofficev2_rate.at<=$3 THEN $2 ELSE fwofficev2_rate.at END,
      used=CASE WHEN fwofficev2_rate.at<=$3 THEN 1 ELSE fwofficev2_rate.used+1 END
      WHERE fwofficev2_rate.at<=$3 OR fwofficev2_rate.used<$4 RETURNING id`, [id, now(), now() - 60000, limit]);
    if (!row) fail('Please wait before trying again.', 429);
  }
  async function session(cookie, create = false) {
    await ready();
    let row = /^[a-f0-9]{48}$/u.test(cookie ?? '') ? await one('SELECT * FROM fwofficev2_sessions WHERE id=$1 AND expires>$2', [digest(cookie), now()]) : null;
    if (!row && create) { await rate('sessions', 120); cookie = token(); row = await one('INSERT INTO fwofficev2_sessions(id,csrf,expires) VALUES($1,$2,$3) RETURNING *', [digest(cookie), token(), now() + SESSION_MS]); }
    if (!row) fail('Reload the checkout to continue with your saved order.', 403);
    return { ...row, cookie };
  }
  const csrf = (s, value) => { if (!equal(s.csrf, value)) fail('Reload the checkout before continuing.', 403); };
  const active = async () => { if ((await one('SELECT paused FROM fwofficev2_control WHERE id=true'))?.paused !== false) fail('Online ordering is paused. Please contact Angel.'); };
  const order = id => one('SELECT * FROM fwofficev2_orders WHERE id=$1', [id]);
  async function owned(cookie) {
    const s = await session(cookie), row = s.order_id ? await order(s.order_id) : null;
    if (row && row.session_id !== s.id) throw Error('office_session_order_mismatch');
    return { s, row };
  }
  async function savePrice(id, receipt) {
    await db.transaction(async tx => {
      await tx.query('SELECT id FROM fwofficev2_drafts WHERE id=$1 FOR UPDATE', [id]);
      const before = (await tx.query('SELECT receipt FROM fwofficev2_prices WHERE id=$1', [id])).rows[0]?.receipt;
      if (before && (receipt.revision < before.revision || receipt.revision === before.revision && !same(receipt, before))) throw Error('office_price_version_conflict');
      await tx.query('INSERT INTO fwofficev2_price_history VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [id, receipt.revision, json(receipt)]);
      const history = (await tx.query('SELECT receipt FROM fwofficev2_price_history WHERE id=$1 AND revision=$2', [id, receipt.revision])).rows[0];
      if (!same(history.receipt, receipt)) throw Error('office_price_version_conflict');
      await tx.query('INSERT INTO fwofficev2_prices VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET revision=EXCLUDED.revision,receipt=EXCLUDED.receipt', [id, receipt.revision, json(receipt)]);
    });
  }
  async function priceAttempt(id) {
    const claimed = await db.transaction(async tx => {
      const row = (await tx.query("SELECT * FROM fwofficev2_price_queue WHERE id=$1 AND status='pending' AND retry_at<=$2 AND lease_until<=$2 FOR UPDATE", [id, now()])).rows[0];
      if (!row) return null; const lease = randomUUID();
      await tx.query('UPDATE fwofficev2_price_queue SET lease=$2,lease_until=$3,tries=tries+1 WHERE id=$1', [id, lease, now() + 60000]); return { ...row, lease, tries: row.tries + 1 };
    });
    if (!claimed) return;
    try {
      const draft = await one('SELECT request FROM fwofficev2_drafts WHERE id=$1', [id]);
      const before = (await one('SELECT receipt FROM fwofficev2_prices WHERE id=$1', [id]))?.receipt;
      const receipt = await office.requestPrice(draft.request, before); await savePrice(id, receipt);
      await db.query("UPDATE fwofficev2_price_queue SET status='requested',lease=NULL,lease_until=0,retry_at=0 WHERE id=$1 AND lease=$2", [id, claimed.lease]);
    } catch (error) {
      await db.query('UPDATE fwofficev2_price_queue SET status=$3,retry_at=$4,lease=NULL,lease_until=0 WHERE id=$1 AND lease=$2',
        [id, claimed.lease, error.retryable !== false && claimed.tries < 12 ? 'pending' : 'review', now() + Math.min(3600000, 5000 * 2 ** Math.min(claimed.tries - 1, 9))]);
    }
  }
  function draftInput(input) {
    const allowed = ['csrf', 'quantity', 'stacking', 'name', 'email', 'phone', 'address', 'address2', 'city', 'state', 'postal', 'notes'];
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !allowed.includes(key))) fail('Only customer details and the wood/stacking choice belong in an office request.', 400);
    // Validation only; this does not record customer acceptance or an order.
    return orderInput({ ...input, termsAccepted: true, householdUseConfirmed: true, termsHash: LIVE_TERMS_HASH, paymentPolicyHash: LIVE_PAYMENT_POLICY_HASH }, live);
  }
  async function requestPrice(cookie, input) {
    const { s, row } = await owned(cookie); csrf(s, input?.csrf); await rate('price:' + s.id); await active();
    if (row) fail('Your accepted order is saved. Contact Angel before changing it.');
    const chosen = draftInput(input);
    const id = await db.transaction(async tx => {
      const locked = (await tx.query('SELECT * FROM fwofficev2_sessions WHERE id=$1 AND expires>$2 FOR UPDATE', [s.id, now()])).rows[0];
      if (!locked || locked.order_id) fail('Your order is saved or the session has expired. Reload to continue.');
      const previous = locked.draft_id ? (await tx.query('SELECT * FROM fwofficev2_drafts WHERE id=$1', [locked.draft_id])).rows[0] : null;
      const draftId = previous && same(previous.request.draft, { quantity: chosen.quote.quantity, stacking: chosen.quote.stacking, contact: chosen.contact }) ? previous.id : randomUUID();
      const request = makeOfficeDraft(draftId, chosen, office);
      await tx.query('INSERT INTO fwofficev2_drafts VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING', [draftId, s.id, json(request), now()]);
      await tx.query("INSERT INTO fwofficev2_price_queue(id,status) VALUES($1,'pending') ON CONFLICT DO NOTHING", [draftId]);
      await tx.query('UPDATE fwofficev2_sessions SET draft_id=$2 WHERE id=$1', [s.id, draftId]); return draftId;
    });
    await priceAttempt(id); return reviewPrice(cookie);
  }
  const reviewHash = (draft, receipt) => handoffDigest({ draft, receipt });
  async function trustedPrice(s) {
    const draft = s.draft_id ? await one('SELECT * FROM fwofficev2_drafts WHERE id=$1 AND session_id=$2', [s.draft_id, s.id]) : null;
    if (!draft) fail('Request an office price before continuing.');
    await priceAttempt(draft.id);
    const previous = (await one('SELECT receipt FROM fwofficev2_prices WHERE id=$1', [draft.id]))?.receipt;
    if (!previous) fail('Your office request is saved and is being checked.', 503);
    const receipt = await office.priceStatus(draft.request, previous); await savePrice(draft.id, receipt);
    return { draft, receipt };
  }
  async function reviewPrice(cookie) {
    const { s, row } = await owned(cookie); if (row) fail('Your accepted order is already saved.');
    const { draft, receipt } = await trustedPrice(s);
    return { reference: draft.request.reference, draft: draft.request.draft, status: receipt.status,
      prices: receipt.prices, expiresAt: receipt.approval?.expires_at ?? null,
      quoteReviewHash: receipt.status === 'approved' ? reviewHash(draft.request, receipt) : null, orderAccepted: false };
  }
  async function saveAccepted(s, chosen, id, officeReceipt) {
    return db.transaction(async tx => {
      const locked = (await tx.query('SELECT * FROM fwofficev2_sessions WHERE id=$1 AND expires>$2 FOR UPDATE', [s.id, now()])).rows[0];
      if (!locked) fail('Reload the checkout before continuing.', 403);
      if (locked.order_id) {
        const existing = (await tx.query('SELECT * FROM fwofficev2_orders WHERE id=$1', [locked.order_id])).rows[0];
        if (!same(existing.chosen, chosen)) fail('Your accepted order is saved. Contact Angel before changing it.'); return existing;
      }
      if ((await tx.query('SELECT paused FROM fwofficev2_control WHERE id=true FOR UPDATE')).rows[0]?.paused !== false) fail('Online ordering is paused.');
      if (officeReceipt && locked.draft_id !== id) fail('Your office request changed. Review the current price.');
      if (officeReceipt && (Date.parse(officeReceipt.approval.expires_at) <= now() || officeReceipt.approval.approved_at_ms > now()))
        fail('The office price expired. Contact Angel for a current price.');
      const at = now(), request = prepareOrderBinding({ id, number: 'FW-' + id.slice(0, 8).toUpperCase(), ...chosen, created_at: at }, live);
      await tx.query('INSERT INTO fwofficev2_orders VALUES($1,$2,$3,$4,$5,$6)', [id, s.id, json(chosen), json(request), officeReceipt ? json(officeReceipt) : null, at]);
      await tx.query("INSERT INTO fwofficev2_prepare(id,status) VALUES($1,'pending')", [id]);
      await tx.query('UPDATE fwofficev2_sessions SET order_id=$2 WHERE id=$1', [s.id, id]); return { id, chosen, request };
    });
  }
  async function start(cookie, input) {
    const { s } = await owned(cookie); csrf(s, input?.csrf); await rate('accept:' + s.id); const chosen = orderInput(input, live);
    const row = await saveAccepted(s, chosen, randomUUID(), null); await prepareAttempt(row.id); return { orderSaved: true, reference: row.request.reference };
  }
  async function acceptPrice(cookie, input) {
    const { s, row } = await owned(cookie); csrf(s, input?.csrf); await rate('accept:' + s.id);
    const keys = ['csrf', 'quoteReviewHash', 'termsHash', 'paymentPolicyHash', 'termsAccepted', 'householdUseConfirmed'];
    if (!input || Object.keys(input).some(key => !keys.includes(key))) fail('Review the office price without supplying a price or approval.', 400);
    if (row) {
      if (!row.office_receipt || reviewHash(makeOfficeDraft(row.id, row.chosen, office), row.office_receipt) !== input.quoteReviewHash
        || input.termsHash !== LIVE_TERMS_HASH || input.paymentPolicyHash !== LIVE_PAYMENT_POLICY_HASH
        || input.termsAccepted !== true || input.householdUseConfirmed !== true) fail('Your accepted order is saved. Contact Angel before changing it.');
      return { orderSaved: true, reference: row.request.reference };
    }
    const { draft, receipt } = await trustedPrice(s);
    if (receipt.status !== 'approved' || input.quoteReviewHash !== reviewHash(draft.request, receipt)) fail('Review the current office price before accepting.');
    const c = draft.request.draft, { quoteReviewHash, ...acceptance } = input;
    const chosen = orderInput({ ...c.contact, quantity: c.quantity, stacking: c.stacking, ...acceptance }, live);
    // The UI-only hash is removed before policy parsing; authority comes exclusively
    // from the fresh CRM receipt, never from a browser-supplied amount or UUID.
    chosen.quote = { ...chosen.quote, woodCents: receipt.prices.wood_cents, stackingCents: receipt.prices.stacking_cents,
      totalCents: receipt.prices.principal_cents, officeApproved: true,
      officeApproval: Object.fromEntries(['approval_id', 'approved_at_ms', 'residential', 'single_discount_confirmed'].map(key => [key, receipt.approval[key]])) };
    const saved = await saveAccepted(s, chosen, draft.id, receipt); await prepareAttempt(saved.id); return { orderSaved: true, reference: saved.request.reference };
  }
  async function prepareAttempt(id) {
    const claimed = await db.transaction(async tx => {
      const row = (await tx.query("SELECT * FROM fwofficev2_prepare WHERE id=$1 AND status='pending' AND retry_at<=$2 AND lease_until<=$2 FOR UPDATE", [id, now()])).rows[0];
      if (!row) return null; const lease = randomUUID();
      await tx.query('UPDATE fwofficev2_prepare SET lease=$2,lease_until=$3,tries=tries+1 WHERE id=$1', [id, lease, now() + 60000]); return { ...row, lease, tries: row.tries + 1 };
    });
    if (!claimed) return;
    try {
      const row = await order(id), receipt = validatePrepareReceipt(await live.prepare(row.request), row.request);
      await db.query("UPDATE fwofficev2_prepare SET status='prepared',receipt=$3,invoice_id=$4,lease=NULL,lease_until=0 WHERE id=$1 AND lease=$2", [id, claimed.lease, json(receipt), receipt.invoice_id]);
    } catch (error) {
      await db.query('UPDATE fwofficev2_prepare SET status=$3,retry_at=$4,lease=NULL,lease_until=0 WHERE id=$1 AND lease=$2',
        [id, claimed.lease, error.retryable !== false && claimed.tries < 12 ? 'pending' : 'review', now() + Math.min(3600000, 5000 * 2 ** Math.min(claimed.tries - 1, 9))]);
    }
  }
  async function observe(row) {
    const prepared = await one('SELECT * FROM fwofficev2_prepare WHERE id=$1', [row.id]);
    if (!prepared?.receipt) fail('Your saved invoice is being prepared.', 503);
    const before = (await one('SELECT receipt FROM fwofficev2_observations WHERE id=$1', [row.id]))?.receipt;
    const value = await office.orderStatus(row.request, prepared.receipt, before);
    return db.transaction(async tx => {
      await tx.query('SELECT id FROM fwofficev2_orders WHERE id=$1 FOR UPDATE', [row.id]);
      const current = (await tx.query('SELECT receipt FROM fwofficev2_observations WHERE id=$1', [row.id])).rows[0]?.receipt;
      validateOfficeAccounting(value.accounting, null, current?.accounting ?? null);
      if (current && (value.observation_revision < current.observation_revision || value.workflow_revision < current.workflow_revision
        || current.accounting.credit_id === null && value.accounting.credit_id !== null && value.workflow_revision <= current.workflow_revision
        || value.observation_revision === current.observation_revision && !same(value, current)
        || value.workflow_revision === current.workflow_revision && value.order_state !== current.order_state
        || current.order_state !== 'active' && value.order_state === 'active'
        || current.order_state === 'cancelled' && value.order_state !== 'cancelled'
        || current.original_paid_evidence && !same(current.original_paid_evidence, value.original_paid_evidence))) throw Error('office_lifecycle_version_conflict');
      await tx.query('INSERT INTO fwofficev2_history VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [row.id, value.observation_revision, json(value)]);
      const historical = (await tx.query('SELECT receipt FROM fwofficev2_history WHERE id=$1 AND revision=$2', [row.id, value.observation_revision])).rows[0];
      if (!same(historical.receipt, value)) throw Error('office_lifecycle_version_conflict');
      await tx.query('INSERT INTO fwofficev2_observations VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET revision=EXCLUDED.revision,receipt=EXCLUDED.receipt', [row.id, value.observation_revision, json(value)]);
      return value;
    });
  }
  async function state(cookie) {
    const { row } = await owned(cookie); if (!row) return { orderSaved: false, fulfillmentReady: false, paymentExecutionReady: false, messagesPlanned: 0 };
    let status = null, verificationPending = false;
    try { status = await observe(row); } catch { verificationPending = true; }
    const historical = status ?? (await one('SELECT receipt FROM fwofficev2_observations WHERE id=$1', [row.id]))?.receipt;
    return { orderSaved: true, reference: row.request.reference, chosen: row.chosen, verificationPending,
      orderState: status?.order_state ?? 'unconfirmed', paymentState: status?.payment_state ?? 'unconfirmed',
      originalPaidEvidence: historical?.original_paid_evidence ?? null, totals: historical?.totals ?? null,
      fulfillmentReady: status?.order_state === 'active' && status.fulfillment_ready === true,
      paymentExecutionReady: false, messagesPlanned: 0 };
  }
  const canPay = status => status.order_state === 'active' && status.accounting.credit_id === null
    && status.accounting.collectible_balance_cents > 0 && !status.original_paid_evidence && !status.payment_pending
    && !status.review_required && ['unpaid', 'failed', 'offline_pending'].includes(status.payment_state);
  async function resume(cookie, input) {
    const { s, row } = await owned(cookie); csrf(s, input?.csrf); await rate('resume:' + s.id);
    if (!input || Object.keys(input).some(key => key !== 'csrf') || !row) fail('Use your saved order to check payment options.');
    if (!canPay(await observe(row))) return { held: true, next: null };
    let prepared = await one('SELECT * FROM fwofficev2_prepare WHERE id=$1', [row.id]), receipt = prepared.receipt;
    if (!receipt.payment_execution_ready || !receipt.portal_url || Date.parse(receipt.expires_at) <= now() + 5000) {
      receipt = validatePrepareReceipt(await live.renew(row.request, receipt), row.request);
      if (receipt.invoice_id !== prepared.invoice_id || receipt.capability_version < prepared.receipt.capability_version) throw Error('office_invoice_renewal_conflict');
      await db.transaction(async tx => {
        const current = (await tx.query('SELECT * FROM fwofficev2_prepare WHERE id=$1 FOR UPDATE', [row.id])).rows[0];
        if (receipt.invoice_id !== current.invoice_id || receipt.capability_version < current.receipt.capability_version
          || receipt.capability_version === current.receipt.capability_version && (receipt.portal_url !== current.receipt.portal_url || receipt.expires_at !== current.receipt.expires_at)) throw Error('office_invoice_renewal_conflict');
        await tx.query('UPDATE fwofficev2_prepare SET receipt=$2 WHERE id=$1', [row.id, json(receipt)]);
      });
    }
    // Cancellation during renewal must hold the link too. CRM's atomic collector
    // remains authoritative for a cancellation that races after this check.
    if (!canPay(await observe(row)) || !receipt.payment_execution_ready || !receipt.portal_url || Date.parse(receipt.expires_at) <= now() + 5000) return { held: true, next: null };
    return { held: false, next: receipt.portal_url, invoiceId: receipt.invoice_id };
  }
  async function refreshOrder(id) { await ready(); const row = await order(id); if (!row) throw Error('owned_order_required'); return observe(row); }
  async function work({ limit = 20, preparation = true, onObservation = null } = {}) {
    await ready(); if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) throw Error('bounded_office_worker_required');
    if (typeof preparation !== 'boolean') throw Error('explicit_preparation_gate_required');
    if (preparation) {
      await db.runInMode(['preparation','office'],async()=>{
        for (const row of (await db.query("SELECT id FROM fwofficev2_price_queue WHERE status='pending' AND retry_at<=$1 AND lease_until<=$1 ORDER BY id LIMIT $2", [now(), limit])).rows) await priceAttempt(row.id);
        for (const row of (await db.query("SELECT id FROM fwofficev2_prepare WHERE status='pending' AND retry_at<=$1 AND lease_until<=$1 ORDER BY id LIMIT $2", [now(), limit])).rows) await prepareAttempt(row.id);
      });
    }
    let checked = 0;
    for (const row of (await db.query("SELECT o.* FROM fwofficev2_orders o JOIN fwofficev2_prepare p ON p.id=o.id WHERE p.status='prepared' AND p.next_status_at<=$1 ORDER BY p.next_status_at,o.created_at LIMIT $2", [now(),limit])).rows) {
      try { const receipt = await observe(row); checked++; if (onObservation) await onObservation(row.id,receipt); }
      catch { /* A failed observation retains its trusted history and hold. */ }
      await db.query('UPDATE fwofficev2_prepare SET next_status_at=$2 WHERE id=$1',[row.id,now()+15000]);
    }
    return { checked, messagesPlanned: 0, emailsSent: 0 };
  }
  return Object.freeze({ session, requestPrice, reviewPrice, acceptPrice, start, state, resume, work, refreshOrder });
}
