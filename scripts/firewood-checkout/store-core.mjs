import { confirmationMessages } from './confirmations.mjs';
import { randomUUID } from 'node:crypto';
import { createCrmBinding, CrmSyncError } from './crm.mjs';

// The same transactional operations run on local Postgres and the isolated hosted test database.
export function createOrderStore(db, { now = Date.now, beforeCapture = async () => {}, close = async () => {}, controlledEmail = false } = {}) {
  let draining;
  let syncing;
  const query = (sql, params) => db.query(sql, params);
  const one = async (sql, params) => (await query(sql, params)).rows[0] ?? null;
  return {
    async summary() {
      return one(`SELECT (SELECT count(*)::int FROM firewood_test_attempts) AS orders,
        (SELECT count(*)::int FROM firewood_test_attempts WHERE status='paid') AS paid,
        (SELECT count(*)::int FROM firewood_test_email_delivery WHERE status='pending') AS pending,
        (SELECT count(*)::int FROM firewood_test_email_delivery WHERE status='accepted') AS accepted,
        (SELECT count(*)::int FROM firewood_test_email_delivery WHERE status='review') AS review,
        (SELECT count(*)::int FROM firewood_test_crm_sync) AS crm_rows`);
    },
    async session(id) {
      return (await one('SELECT data FROM firewood_test_browser_sessions WHERE id=$1 AND expires >= $2', [id, now()]))?.data ?? null;
    },
    async createSession(id, data) {
      const { csrf, expires, status, attempt, receipt } = data;
      await query('INSERT INTO firewood_test_browser_sessions(id,data,expires) VALUES($1,$2,$3)',
        [id, JSON.stringify({ csrf, expires, status, attempt, receipt }), expires]);
    },
    async saveSession(id, data) {
      // An in-flight save must not recreate a session revoked by reset/expiry.
      // Store only authorization/current-attempt pointers, not contact data.
      const { csrf, expires, status, attempt, receipt } = data;
      await query('UPDATE firewood_test_browser_sessions SET data=$2,expires=$3 WHERE id=$1 AND expires >= $4',
        [id, JSON.stringify({ csrf, expires, status, attempt, receipt }), expires, now()]);
    },
    async forgetSession(id) { await query('DELETE FROM firewood_test_browser_sessions WHERE id=$1', [id]); },
    async purgeSessions() { await query('DELETE FROM firewood_test_browser_sessions WHERE expires < $1', [now()]); },
    async createAttempt(id, reference, order, crmConfig = null) {
      const binding = crmConfig ? createCrmBinding(order, crmConfig) : null;
      await query('INSERT INTO firewood_test_attempts(id,reference,order_number,quote,contact,created_at,crm_binding) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING',
        [id, reference, binding?.reference ?? `FW-TEST-${id.slice(0, 16).toUpperCase()}`, JSON.stringify(order.quote), JSON.stringify(order.contact), now(), binding ? JSON.stringify(binding) : null]);
      return one('SELECT * FROM firewood_test_attempts WHERE id=$1', [id]);
    },
    attempt(id) { return one('SELECT * FROM firewood_test_attempts WHERE id=$1', [id]); },
    async bindPayment(id, payment) {
      const row = await one('UPDATE firewood_test_attempts SET payment_id=$2,payment_url=$3 WHERE id=$1 AND (payment_id IS NULL OR payment_id=$2) RETURNING id', [id, payment.id, payment.url]);
      if (!row) throw new Error('The stored test payment does not match.');
    },
    async confirm(id, paymentId, source, eventId = null, proof = null) {
      return db.transaction(async tx => {
        const record = (await tx.query('SELECT * FROM firewood_test_attempts WHERE id=$1 FOR UPDATE', [id])).rows[0];
        if (!record || record.payment_id !== paymentId) throw new Error('The test payment has no matching stored order.');
        if (eventId) {
          const claimed = (await tx.query('INSERT INTO firewood_test_payment_events(id,attempt,received_at) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET id=EXCLUDED.id RETURNING attempt', [eventId, id, now()])).rows[0];
          if (claimed.attempt !== id) throw new Error('The test event belongs to another order.');
        }
        if (record.status !== 'paid') {
          if (record.crm_binding && (source === 'local-simulator' || !/^cs_test_/u.test(paymentId) || !/^pi_[A-Za-z0-9_]+$/u.test(proof?.intentId ?? ''))) throw new Error('A verified test payment is required for CRM sync.');
          await tx.query("UPDATE firewood_test_attempts SET status='paid',paid_at=$2,confirmed_by=$3 WHERE id=$1", [id, now(), source]);
          if (record.crm_binding) await tx.query('INSERT INTO firewood_test_crm_sync(attempt,request,intent_id,updated_at) VALUES($1,$2,$3,$4) ON CONFLICT(attempt) DO NOTHING',
            [id, JSON.stringify({ ...record.crm_binding, session_id: paymentId }), proof.intentId, now()]);
          for (const message of confirmationMessages(record, { controlledEmail })) {
            await tx.query('INSERT INTO firewood_test_outbox(id,attempt,audience,message) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING',
              [`${id}:${message.audience}`, id, message.audience, JSON.stringify(message)]);
            if (controlledEmail) await tx.query('INSERT INTO firewood_test_email_delivery(id) VALUES($1) ON CONFLICT(id) DO NOTHING', [`${id}:${message.audience}`]);
          }
        }
        return { ...record.quote, orderNumber: record.order_number, confirmedBy: record.confirmed_by ?? source };
      });
    },
    // Capture and acknowledgement share a transaction. A crash cannot lose a
    // confirmation between marking it handled and saving its inspectable copy.
    async drain() {
      if (controlledEmail) return; // The durable hosted email worker owns delivery.
      if (draining) return draining;
      draining = (async () => {
        const rows = (await query("SELECT id FROM firewood_test_outbox WHERE status='pending' AND retry_at <= $1 ORDER BY id", [now()])).rows;
        for (const { id } of rows) {
          try {
            await db.transaction(async tx => {
              const row = (await tx.query("SELECT * FROM firewood_test_outbox WHERE id=$1 AND status='pending' FOR UPDATE", [id])).rows[0];
              if (!row) return;
              await beforeCapture(row.message);
              await tx.query('INSERT INTO firewood_test_confirmations(id,message,captured_at) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING', [id, JSON.stringify(row.message), now()]);
              await tx.query("UPDATE firewood_test_outbox SET status='captured',tries=tries+1 WHERE id=$1", [id]);
            });
          } catch {
            await query("UPDATE firewood_test_outbox SET tries=tries+1,retry_at=$2 WHERE id=$1 AND status='pending'", [id, now() + 30000]);
          }
        }
      })().finally(() => { draining = null; });
      return draining;
    },
    async confirmations(id) {
      return (await query(controlledEmail
        ? `SELECT o.audience,COALESCE(d.status,'pending') AS status,COALESCE(d.tries,0) AS tries,o.message FROM firewood_test_outbox o LEFT JOIN firewood_test_email_delivery d ON d.id=o.id WHERE o.attempt=$1 ORDER BY o.audience`
        : 'SELECT audience,status,tries,message FROM firewood_test_outbox WHERE attempt=$1 ORDER BY audience', [id])).rows;
    },
    async crmSync(id) { return one('SELECT * FROM firewood_test_crm_sync WHERE attempt=$1', [id]); },
    async refreshCrm(intentId) {
      if (!/^pi_[A-Za-z0-9_]+$/u.test(intentId ?? '')) return;
      await query("UPDATE firewood_test_crm_sync SET status='pending',revision=revision+1,retry_at=0,updated_at=$2 WHERE intent_id=$1", [intentId, now()]);
    },
    async retryCrm(id) {
      await query("UPDATE firewood_test_crm_sync SET status='pending',revision=revision+1,retry_at=0,last_code=NULL,updated_at=$2 WHERE attempt=$1", [id, now()]);
    },
    async drainCrm(client) {
      if (!client) return;
      if (syncing) return syncing;
      syncing = (async () => {
        const rows = (await query("SELECT attempt FROM firewood_test_crm_sync WHERE status='pending' AND retry_at <= $1 AND lease_until <= $1 ORDER BY updated_at LIMIT 20", [now()])).rows;
        for (const { attempt } of rows) {
          const lease = randomUUID();
          const row = await one("UPDATE firewood_test_crm_sync SET lease_id=$2,lease_until=$3,tries=tries+1 WHERE attempt=$1 AND status='pending' AND retry_at <= $4 AND lease_until <= $4 RETURNING *", [attempt, lease, now() + 45000, now()]);
          if (!row) continue;
          try {
            const receipt = await client.send(row.request, row.receipt, row.intent_id);
            await query("UPDATE firewood_test_crm_sync SET receipt=$3,processed_revision=$4,status=CASE WHEN revision<>$4 THEN 'pending' WHEN $5 THEN 'review' ELSE 'synced' END,last_code=CASE WHEN $5 THEN 'financial_review' ELSE NULL END,retry_at=0,lease_id=NULL,lease_until=0,updated_at=$6 WHERE attempt=$1 AND lease_id=$2",
              [attempt, lease, JSON.stringify(receipt), row.revision, receipt.review_required, now()]);
          } catch (error) {
            const known = error instanceof CrmSyncError ? error : new CrmSyncError('connection_unconfirmed', true);
            const delay = Math.min(300000, Math.max(known.delayMs, 5000 * 2 ** Math.min(row.tries - 1, 6)));
            await query("UPDATE firewood_test_crm_sync SET status=CASE WHEN revision<>$5 OR $3 THEN 'pending' ELSE 'review' END,last_code=$4,retry_at=$6,lease_id=NULL,lease_until=0,updated_at=$7 WHERE attempt=$1 AND lease_id=$2",
              [attempt, lease, known.retryable, known.code, row.revision, now() + delay, now()]);
          }
        }
      })().finally(() => { syncing = null; });
      return syncing;
    },
    // Used only by the local owner CLI/tests; never exposed over HTTP.
    async orders() { return (await query('SELECT a.order_number,a.status,a.quote,a.created_at,a.paid_at,s.status AS crm_status,s.last_code AS crm_code,s.receipt->>\'invoice_number\' AS crm_invoice FROM firewood_test_attempts a LEFT JOIN firewood_test_crm_sync s ON s.attempt=a.id ORDER BY a.created_at DESC')).rows; },
    async findOrder(number) { return one('SELECT * FROM firewood_test_attempts WHERE order_number=$1', [number]); },
    async close() { if (draining) await draining; if (syncing) await syncing; await close(); },
  };
}
