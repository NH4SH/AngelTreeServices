import { assertRuntimeDatabase } from './database.mjs';
import { officeOrders } from './orders.mjs';
import { catalog, CheckoutError } from './policy.mjs';
import { LIVE_TERMS_HASH, LIVE_PAYMENT_POLICY_HASH } from '../live/contract.mjs';
const services = new WeakSet();
export function assertReleaseService(service) { if (!services.has(service)) throw Error('bound_release_service_required'); }
export function createReleaseCustomerService({ db, live, office, now = Date.now }) {
  assertRuntimeDatabase(db);
  const orders = officeOrders({ db, live, office, now });
  const one = async (sql, args = []) => (await db.query(sql, args)).rows[0] ?? null;
  async function readRate(session) {
    const row = await one(`INSERT INTO fwofficev2_rate VALUES($1,$2,1) ON CONFLICT(id) DO UPDATE SET
      at=CASE WHEN fwofficev2_rate.at<=$3 THEN $2 ELSE fwofficev2_rate.at END,
      used=CASE WHEN fwofficev2_rate.at<=$3 THEN 1 ELSE fwofficev2_rate.used+1 END
      WHERE fwofficev2_rate.at<=$3 OR fwofficev2_rate.used<120 RETURNING id`, ['customer-state:' + session.id, now(), now() - 60000]);
    if (!row) throw new CheckoutError('Please wait a moment before checking again.', 429);
  }
  async function state(cookie) {
    const session = await orders.session(cookie); await readRate(session);
    const saved = await orders.state(cookie), paused = (await one('SELECT paused FROM fwofficev2_control WHERE id=true'))?.paused !== false;
    const common = { connectionVersion: 'firewood-office-live-v2', csrf: session.csrf, catalog, termsHash: LIVE_TERMS_HASH, paymentPolicyHash: LIVE_PAYMENT_POLICY_HASH, paused };
    if (!saved.orderSaved) {
      let officeDraft = null;
      if (session.draft_id) {
        const draft = await one('SELECT request FROM fwofficev2_drafts WHERE id=$1 AND session_id=$2', [session.draft_id, session.id]);
        if (draft) {
          officeDraft = { reference: draft.request.reference, draft: draft.request.draft,
            status: 'unconfirmed', prices: null, quoteReviewHash: null, expiresAt: null };
          try { officeDraft = await orders.reviewPrice(cookie); }
          catch { /* A saved request survives an interrupted or expired approval. */ }
        }
      }
      return { ...common, status: 'draft', order: null, officeDraft };
    }
    const row = await one('SELECT * FROM fwofficev2_orders WHERE id=$1 AND session_id=$2', [session.order_id, session.id]);
    if (!row) throw new CheckoutError('Your saved order needs office review. Please contact Angel.', 503);
    const prepared = await one('SELECT status,receipt FROM fwofficev2_prepare WHERE id=$1', [row.id]);
    const receipt = saved.verificationPending ? null : (await one('SELECT receipt FROM fwofficev2_observations WHERE id=$1', [row.id]))?.receipt;
    const payment = receipt ? { state: receipt.payment_state, totals: receipt.totals,
      previouslyPaid: receipt.original_paid_evidence !== null, pending: receipt.payment_pending,
      review: receipt.review_required, orderState: receipt.order_state,
      accounting: { creditCents: receipt.accounting.credited_principal_cents,
        balanceDueCents: receipt.accounting.collectible_balance_cents, creditRecorded: receipt.accounting.credit_id !== null } } : null;
    const q = row.chosen.quote;
    return { ...common, status: 'saved', officeDraft: null, order: { reference: row.request.reference,
      quote: Object.fromEntries(['quantity', 'label', 'stacking', 'woodCents', 'deliveryCents', 'stackingCents', 'totalCents', 'currency'].map(key => [key, q[key]])),
      officeApproved: q.officeApproved === true, contact: row.chosen.contact },
      preparation: prepared?.status ?? 'pending', payment, verificationPending: !receipt,
      canCheckPayment: !!receipt && receipt.order_state === 'active' && receipt.accounting.credit_id === null
        && receipt.accounting.collectible_balance_cents > 0 && !receipt.original_paid_evidence
        && !receipt.payment_pending && !receipt.review_required && ['unpaid', 'failed', 'offline_pending'].includes(receipt.payment_state),
      paymentExecutionReady: prepared?.receipt?.payment_execution_ready === true };
  }
  const service = Object.freeze({ session: orders.session, state,
    start: (...args) => db.runInMode(['preparation','office'],()=>orders.start(...args)),
    requestPrice: (...args) => db.runInMode(['preparation','office'],()=>orders.requestPrice(...args)),
    acceptPrice: (...args) => db.runInMode(['preparation','office'],()=>orders.acceptPrice(...args)),
    async resume(cookie, input) { const result = await db.runInMode(['collection','office'],()=>orders.resume(cookie, input)); return { held: result.held, next: result.next }; } });
  services.add(service); return service;
}
