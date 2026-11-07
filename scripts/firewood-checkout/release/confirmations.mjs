// Server-only order confirmations. CRM remains the payment-receipt authority.
// Installation/admission and real sending are supplied by the guarded runtime.
import { randomUUID } from 'node:crypto';
import { canonicalLiveHandoff, liveHandoffDigest } from '../live/live-contract.mjs';
import { officeBinding, validateOfficeOrderStatus } from '../office-v2/office-contract.mjs';
const same = (a, b) => canonicalLiveHandoff(a) === canonicalLiveHandoff(b);
const json = value => JSON.stringify(value);
const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
export const CONFIRMATION_WINDOW_MS = 23 * 3600000;
export const paidAndActive = receipt => receipt?.order_state === 'active' && receipt.fulfillment_ready === true
  && receipt.payment_state === 'paid' && receipt.original_paid_evidence !== null && !receipt.payment_pending && !receipt.review_required
  && receipt.accounting?.credit_id === null && receipt.accounting.collectible_balance_cents === 0;

function verified(receipt, row, invoice) {
  const input = { ...officeBinding(row.id), snapshot_hash: row.request.snapshot_hash, invoice_id: invoice,
    known_revision: null, known_workflow_revision: null };
  validateOfficeOrderStatus(receipt, input);
  if (receipt.totals.invoice_principal_cents !== row.request.order.principal_cents) throw Error('confirmation_order_binding_required');
  return paidAndActive(receipt);
}
export function orderMessages(row, receipt) {
  if (!paidAndActive(receipt)) throw Error('fresh_paid_active_order_required');
  const contact = row.chosen.contact, quote = row.chosen.quote, proof = receipt.original_paid_evidence;
  const message = { replyTo: 'info@angeltreeservice.org', subject: 'Your firewood order ' + row.request.reference,
    text: [row.request.reference + ' — order details', quote.label + (quote.stacking ? ' with stacking' : ' delivered'),
      'Order subtotal: ' + money(quote.totalCents), 'Credit-card surcharge collected: ' + money(proof.surcharge_collected_cents),
      'Total payment recorded: ' + money(proof.gross_collected_cents),
      'Delivery to: ' + contact.address + (contact.address2 ? ', ' + contact.address2 : '') + ', ' + contact.city + ', ' + contact.state + ' ' + contact.postal,
      ...(contact.notes ? ['Your instructions: ' + contact.notes] : []),
      'Payment was recorded for this order. Your payment page provides the separate payment receipt.',
      'Angel Tree Services will contact you with a delivery date within one week of ordering. This does not promise delivery within one week.',
      'For specific scheduling or changes, call (540) 388-8715.',
      'A full refund applies before delivery is scheduled or at least 48 hours before the agreed delivery window begins. Later customer cancellations are non-refundable.',
      'A full refund also applies if Angel cancels, cannot fulfill, or you decline a reschedule initiated by Angel. Contact the office to arrange a refund.',
      'Keep your checkout page to check the current order status. A later cancellation or refund is recorded separately.'
    ].join('\n') };
  return [['customer_order', contact.email, message], ['owner_order', 'info@angeltreeservice.org', {
    ...message, subject: 'Paid firewood order ' + row.request.reference,
    text: message.text + '\nCustomer: ' + contact.name + '\nEmail: ' + contact.email + '\nPhone: ' + contact.phone,
  }]];
}

export async function installConfirmationStore(db) {
  await db.transaction(async tx => {
    await tx.query('ALTER TABLE fwofficev2_prepare ADD COLUMN IF NOT EXISTS next_status_at bigint NOT NULL DEFAULT 0');
    await tx.query(`CREATE TABLE IF NOT EXISTS fwofficev2_confirmations(order_id uuid PRIMARY KEY REFERENCES fwofficev2_orders(id),
      observation_revision bigint NOT NULL, paid_evidence jsonb NOT NULL, messages jsonb NOT NULL, created_at bigint NOT NULL)`);
    await tx.query(`CREATE TABLE IF NOT EXISTS fwofficev2_outbox(order_id uuid NOT NULL REFERENCES fwofficev2_confirmations(order_id),
      kind text NOT NULL CHECK(kind IN ('customer_order','owner_order')),recipient text NOT NULL,message jsonb NOT NULL,
      idempotency_key text NOT NULL UNIQUE,status text NOT NULL CHECK(status IN ('pending','processing','accepted','review','suppressed')),
      tries integer NOT NULL DEFAULT 0,retry_at bigint NOT NULL DEFAULT 0,lease uuid,lease_until bigint NOT NULL DEFAULT 0,
      first_send_at bigint,provider_id text UNIQUE,last_code text,created_at bigint NOT NULL,PRIMARY KEY(order_id,kind))`);
    await tx.query(`CREATE TABLE IF NOT EXISTS fwofficev2_heartbeat(id boolean PRIMARY KEY CHECK(id),lease uuid,lease_until bigint NOT NULL DEFAULT 0,
      started_at bigint,finished_at bigint,last_code text)`);
    await tx.query('INSERT INTO fwofficev2_heartbeat(id)VALUES(true) ON CONFLICT DO NOTHING');
    await tx.query('DROP TRIGGER IF EXISTS fwofficev2_guard ON fwofficev2_confirmations');
    await tx.query('CREATE TRIGGER fwofficev2_guard BEFORE UPDATE OR DELETE ON fwofficev2_confirmations FOR EACH ROW EXECUTE FUNCTION fwofficev2_immutable()');
    await tx.query(`CREATE OR REPLACE FUNCTION fwofficev2_outbox_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF TG_OP='DELETE' OR (NEW.order_id,NEW.kind,NEW.recipient,NEW.message,NEW.idempotency_key,NEW.created_at)
        IS DISTINCT FROM (OLD.order_id,OLD.kind,OLD.recipient,OLD.message,OLD.idempotency_key,OLD.created_at)
        OR OLD.first_send_at IS NOT NULL AND NEW.first_send_at IS DISTINCT FROM OLD.first_send_at
        OR OLD.provider_id IS NOT NULL AND NEW.provider_id IS DISTINCT FROM OLD.provider_id
        OR OLD.status IN ('accepted','review','suppressed') AND NEW.status<>OLD.status
        OR NEW.tries<OLD.tries THEN RAISE EXCEPTION 'immutable_order_confirmation'; END IF; RETURN NEW; END $$`);
    await tx.query('DROP TRIGGER IF EXISTS fwofficev2_guard ON fwofficev2_outbox');
    await tx.query('CREATE TRIGGER fwofficev2_guard BEFORE UPDATE OR DELETE ON fwofficev2_outbox FOR EACH ROW EXECUTE FUNCTION fwofficev2_outbox_guard()');
  });
}

// The caller supplies a fresh authenticated observation. Recheck the locked
// stored version so an intervening cancellation cannot queue an old paid view.
export async function captureConfirmation(db, orderId, receipt, now = Date.now) {
  return db.transaction(async tx => {
    const row = (await tx.query('SELECT * FROM fwofficev2_orders WHERE id=$1 FOR UPDATE', [orderId])).rows[0];
    if (!row) throw Error('confirmation_order_required');
    const current = (await tx.query('SELECT receipt FROM fwofficev2_observations WHERE id=$1', [orderId])).rows[0]?.receipt;
    const invoice = (await tx.query('SELECT invoice_id FROM fwofficev2_prepare WHERE id=$1', [orderId])).rows[0]?.invoice_id;
    if (!current || !same(current, receipt) || !verified(receipt, row, invoice)) return { captured: false };
    const messages = orderMessages(row, receipt), at = now();
    await tx.query('INSERT INTO fwofficev2_confirmations VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
      [row.id, receipt.observation_revision, json(receipt.original_paid_evidence), json(messages), at]);
    const saved = (await tx.query('SELECT * FROM fwofficev2_confirmations WHERE order_id=$1', [row.id])).rows[0];
    if (!same(saved.paid_evidence, receipt.original_paid_evidence) || !same(saved.messages, messages)) throw Error('confirmation_proof_conflict');
    for (const [kind, recipient, message] of messages) {
      const key = 'fw-order-v2-' + liveHandoffDigest({ binding: officeBinding(row.id), kind, authority: 'website-order-confirmation' });
      await tx.query("INSERT INTO fwofficev2_outbox(order_id,kind,recipient,message,idempotency_key,status,created_at)VALUES($1,$2,$3,$4,$5,'pending',$6)ON CONFLICT DO NOTHING",
        [row.id, kind, recipient, json(message), key, at]);
    }
    return { captured: true };
  });
}

// Fresh admission and CRM lifecycle checks precede each provider attempt. An
// uncertain send keeps the exact frozen payload/key, then requires office review
// before the provider's idempotency retention can expire. Never mint a new key.
export async function drainConfirmations({ db, freshStatus, mailer, admitted, now = Date.now, limit = 2 }) {
  if (typeof admitted !== 'function' || typeof freshStatus !== 'function' || !Number.isInteger(limit) || limit < 1 || limit > 10) throw Error('bounded_confirmation_runtime_required');
  if (!mailer || !await admitted()) return { accepted: 0, held: true };
  const due = (await db.query("SELECT order_id,kind FROM fwofficev2_outbox WHERE status IN ('pending','processing') AND retry_at<=$1 AND lease_until<=$1 ORDER BY created_at,order_id,kind LIMIT $2", [now(), limit])).rows;
  let accepted = 0;
  for (const item of due) {
    if (!await admitted()) break;
    const fresh = await freshStatus(item.order_id);
    if (!fresh) continue;
    const claimed = await db.transaction(async tx => {
      const row = (await tx.query('SELECT * FROM fwofficev2_outbox WHERE order_id=$1 AND kind=$2 FOR UPDATE', [item.order_id, item.kind])).rows[0];
      if (!row || !['pending','processing'].includes(row.status) || row.lease_until > now() || row.retry_at > now()) return null;
      const current = (await tx.query('SELECT receipt FROM fwofficev2_observations WHERE id=$1', [row.order_id])).rows[0]?.receipt;
      if (!current || !same(fresh, current)) return null;
      if (!paidAndActive(fresh)) {
        if (fresh.order_state !== 'active' || fresh.accounting.credit_id !== null) await tx.query("UPDATE fwofficev2_outbox SET status='suppressed',last_code='order_no_longer_active' WHERE order_id=$1 AND kind=$2", [row.order_id,row.kind]);
        return null;
      }
      if (row.first_send_at !== null && now() - Number(row.first_send_at) >= CONFIRMATION_WINDOW_MS) {
        await tx.query("UPDATE fwofficev2_outbox SET status='review',last_code='uncertain_delivery_review' WHERE order_id=$1 AND kind=$2", [row.order_id,row.kind]); return null;
      }
      const lease = randomUUID();
      await tx.query("UPDATE fwofficev2_outbox SET status='processing',tries=tries+1,lease=$3,lease_until=$4,first_send_at=coalesce(first_send_at,$5) WHERE order_id=$1 AND kind=$2",
        [row.order_id,row.kind,lease,now()+90000,now()]);
      return { ...row, lease };
    });
    if (!claimed) continue;
    try {
      if (!await admitted()) throw Error('confirmation_admission_pending');
      const result = await mailer.send({ ...claimed.message, to: claimed.recipient }, claimed.idempotency_key, claimed.kind);
      if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(result ?? '')) throw Error('confirmation_provider_unverified');
      const r = await db.query("UPDATE fwofficev2_outbox SET status='accepted',provider_id=$4,lease=NULL,lease_until=0,last_code=NULL WHERE order_id=$1 AND kind=$2 AND lease=$3 RETURNING order_id", [claimed.order_id,claimed.kind,claimed.lease,result]);
      accepted += r.rows.length;
    } catch {
      await db.query("UPDATE fwofficev2_outbox SET status='pending',retry_at=$4,lease=NULL,lease_until=0,last_code='confirmation_delivery_pending' WHERE order_id=$1 AND kind=$2 AND lease=$3",
        [claimed.order_id,claimed.kind,claimed.lease,now()+Math.min(3600000,5000*2**Math.min(claimed.tries,9))]);
    }
  }
  return { accepted, held: false };
}
