import { randomUUID, createHash } from 'node:crypto';

export const CONTROLLED_RECIPIENT = 'info@angeltreeservice.org';
const RETRY_WINDOW = 23 * 60 * 60 * 1000; // Provider deduplication expires at 24 hours.
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/iu;

export class MailError extends Error {
  constructor(code, retryable = false, delay = 0) { super(code); Object.assign(this, { code, retryable, delay }); }
}

export function controlledPayload(message, from) {
  if (!/^[^<>\r\n]+ <[a-z0-9._+-]+@(?:firewood\.angeltreeservice\.org|angeltreeservice\.org|angeltreeservices\.org|resend\.dev)>$/iu.test(from ?? '')) throw new MailError('sender_unconfirmed');
  if (!['customer','owner'].includes(message?.audience) || !/^\[TEST\] /u.test(message.subject) || typeof message.text !== 'string') throw new MailError('invalid_test_message');
  // Recipient, reply destination, and headers cannot be supplied by the order.
  return { from, to: [CONTROLLED_RECIPIENT], reply_to: CONTROLLED_RECIPIENT, subject: `[TEST COPY: ${message.audience}] ${message.subject.slice(7)}`,
    text: `CONTROLLED WEBSITE TEST — do not dispatch.\nThis ${message.audience} copy was routed to the owner for testing.\n\n${message.text}` };
}

export function resendTestMailer({ key, from, fetcher = fetch } = {}) {
  if (!/^re_[A-Za-z0-9_\-]+$/u.test(key ?? '')) throw new MailError('email_key_missing');
  return {
    payload: message => controlledPayload(message, from),
    async send(payload, id) {
      const fields = Object.keys(payload ?? {}).sort().join();
      // Older frozen payloads must retry byte-for-byte with their original key.
      // New messages route replies only to the fixed owner mailbox.
      if (payload?.to?.length !== 1 || payload.to[0] !== CONTROLLED_RECIPIENT || !payload.subject?.startsWith('[TEST COPY: ')
        || !['from,subject,text,to','from,reply_to,subject,text,to'].includes(fields)
        || (Object.hasOwn(payload, 'reply_to') && payload.reply_to !== CONTROLLED_RECIPIENT)) throw new MailError('recipient_blocked');
      // Revalidate stored payloads too: a later config change cannot widen the allowlist.
      controlledPayload({ audience: 'owner', subject: '[TEST] check', text: '' }, payload.from);
      const idempotencyKey = `ats-firewood-test/${createHash('sha256').update(id).digest('hex')}`;
      let response;
      try { response = await fetcher('https://api.resend.com/emails', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000), headers: {
        Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey,
      }, body: JSON.stringify(payload) }); }
      catch { throw new MailError('email_response_unconfirmed', true); }
      if (!response.ok) {
        const seconds = Number(response.headers.get('retry-after'));
        throw new MailError(`email_http_${response.status}`, response.status === 429 || response.status >= 500,
          Number.isFinite(seconds) ? Math.min(300000, Math.max(0, seconds * 1000)) : 0);
      }
      let result; try { result = await response.json(); } catch { throw new MailError('email_response_unconfirmed', true); }
      if (!UUID.test(result?.id ?? '')) throw new MailError('email_response_unconfirmed', true);
      return result.id;
    },
  };
}

// Each claim commits before network I/O. The stable, frozen payload and provider
// key cover a crash after send but before acknowledgement. Beyond the provider's
// deduplication window, pause for review instead of risking a duplicate email.
export async function drainControlledEmail(db, mailer, { now = Date.now, limit = 2, budgetLimit = 10 } = {}) {
  if (!Number.isInteger(budgetLimit) || budgetLimit < 1 || budgetLimit > 16) throw new Error('invalid_test_email_budget');
  if (!mailer) return { disabled: true, accepted: 0, review: 0 };
  const result = { accepted: 0, review: 0 };
  for (let i = 0; i < Math.min(limit, 2); i++) {
    const row = await db.transaction(async tx => {
      const value = (await tx.query(`SELECT d.*,o.message FROM firewood_test_email_delivery d
        JOIN firewood_test_outbox o ON o.id=d.id
        WHERE d.status='pending' AND d.retry_at <= $1 AND d.lease_until <= $1
        ORDER BY d.id FOR UPDATE OF d SKIP LOCKED LIMIT 1`, [now()])).rows[0];
      if (!value) return null;
      if (value.first_attempt_at !== null && now() - Number(value.first_attempt_at) >= RETRY_WINDOW) {
        await tx.query("UPDATE firewood_test_email_delivery SET status='review',last_code='deduplication_window_expired' WHERE id=$1", [value.id]);
        return { review: true };
      }
      let payload = value.payload;
      if (!payload) {
        // A fixed total budget prevents an unattended test worker sending endlessly.
        const budget = (await tx.query('UPDATE firewood_test_email_budget SET used=used+1 WHERE id=1 AND used<$1 RETURNING used', [budgetLimit])).rows[0];
        if (!budget) {
          await tx.query("UPDATE firewood_test_email_delivery SET status='review',last_code='test_budget_exhausted' WHERE id=$1", [value.id]);
          return { review: true };
        }
        try { payload = mailer.payload(value.message); }
        catch {
          await tx.query("UPDATE firewood_test_email_delivery SET status='review',last_code='sender_or_message_unconfirmed' WHERE id=$1", [value.id]);
          return { review: true };
        }
      }
      const lease = randomUUID();
      await tx.query(`UPDATE firewood_test_email_delivery SET payload=$2,lease_id=$3,lease_until=$4,
        tries=tries+1,first_attempt_at=COALESCE(first_attempt_at,$5) WHERE id=$1`,
      [value.id, JSON.stringify(payload), lease, now() + 45000, now()]);
      return { ...value, payload, lease, tries: value.tries + 1 };
    });
    if (!row) break;
    if (row.review) { result.review++; continue; }
    try {
      const id = await mailer.send(row.payload, row.id);
      await db.query(`UPDATE firewood_test_email_delivery SET status='accepted',provider_id=$3,accepted_at=$4,
        lease_id=NULL,lease_until=0,last_code=NULL WHERE id=$1 AND lease_id=$2`, [row.id, row.lease, id, now()]);
      result.accepted++;
    } catch (error) {
      const known = error instanceof MailError ? error : new MailError('email_response_unconfirmed', true);
      const delay = Math.min(300000, Math.max(known.delay, 30000 * 2 ** Math.min(row.tries - 1, 4)));
      await db.query(`UPDATE firewood_test_email_delivery SET status=$3,last_code=$4,retry_at=$5,
        lease_id=NULL,lease_until=0 WHERE id=$1 AND lease_id=$2`,
      [row.id, row.lease, known.retryable ? 'pending' : 'review', known.code, now() + delay]);
      if (!known.retryable) result.review++;
    }
  }
  return result;
}
