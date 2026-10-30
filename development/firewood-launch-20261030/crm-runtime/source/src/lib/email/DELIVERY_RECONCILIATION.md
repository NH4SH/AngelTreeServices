# PR14 — delivery reconciliation and safe notification repair

This contract describes local, opt-in recovery. It does not authorize a deployment,
hosted migration, provider configuration change, backlog replay, or automation enablement.
It extends [PR10's bounded transport](PROVIDER_OUTCOMES.md) and PR13's atomic intake.

## What is saved before a send

A service-only command saves a business identity, the original provider idempotency
key, frozen envelope/body, source snapshot, actor and request aliases. Private
attempts record dispatch before provider I/O. The sender requires positive save
and claim acknowledgements; absent or timed-out acknowledgements never authorize
I/O. The original key/body/envelope survive a reload, another staff member, sender
configuration changes and a lost response. New sends carry a `crm_delivery_id` tag.
No API key or webhook signing secret is stored in these records.

Manual quote, multiple-quote, invoice and change-order sends reuse the existing
permission, recipient and secure-link checks. Source versions are checked under
job → quote → invoice → change-order → visit → queue → delivery locks. Receipt
repair changes document status and writes its required audit atomically. If the
source changed during I/O, the receipt remains saved and the current document is
preserved for review. Queue completion requires the original queue claim; it
cannot overwrite a newer lease or cancellation. Reminder preparation has a
separate durable pending flag and never invokes a sender.

Website intake retains the exact normalized submission in the intake transaction.
All office recipients are frozen atomically before dispatch begins. Recovery
addresses each recipient separately; it does not reconstruct an earlier message
from a later lead or new notification preferences. An older request with no saved
submission remains a manual-review item. A public intake replay cannot restart a
notice attempt.

## Outcomes and retries

- **Accepted by email provider** is a provider receipt, not proof of inbox delivery
  or reading. Existing `email_events.status = sent` keeps that acceptance meaning.
- **Delivery reported** means the receiving mail server accepted the message.
- Delayed, failed, suppressed, bounced and complained remain distinct. Negative
  terminal evidence cannot be overwritten by older sent/delivered events.
- **Uncertain** means dispatch began without a conclusive result. Opening a page,
  reloading a composer or repairing CRM history never automatically resends it.
- A retryable definitive rejection can use the original key/body under the existing
  bounded reminder policy. Unknown or expired dispatch leases require explicit
  owner/administrator authorization. There are at most three dispatch attempts,
  and same-request retries stop 23 hours after **first dispatch**, before the
  provider's documented 24-hour retention. Row creation time is not the clock.
- An old reminder retry without a saved delivery is held rather than assigned a
  new key. No unknown/expired request is made retryable by rotating its key.
- An additional current email requires explicit intent. Known acceptance can
  authorize one deliberate additional copy, subject to current eligibility.
  A never-dispatched intent or a single definitive no-send rejection may be
  replaced with current content; the old intent is retained, cancelled and audited.
  An ambiguous attempt cannot use that path to evade its review hold.

The provider and PostgreSQL cannot share one transaction. In-flight email cannot
be recalled when a source changes. This protocol retains evidence and avoids
blind retries; it does **not** promise exactly-once delivery or prevent a person
from deliberately sending a second, explicitly confirmed email.

## Operator review

Open **Leads & Communications → Delivery review**. Staff can see compact delivery
facts; frozen bodies, secure portal links and credentials are not returned by the
list command. Owner/administrator recovery requires a review reason.

- **Repair CRM history — no email:** reapply saved acceptance/status/audit evidence
  and retry pending reminder preparation. No provider send is made.
- **Check provider — no email:** retrieve a provider message using GET only. Verify
  its saved delivery tag, sender, to/cc, subject and dispatch time before accepting
  its receipt. A typed reference alone proves nothing.
- **Retry the same saved request — sends email:** explicitly reuse the frozen request
  only when its lease, attempt limit, source eligibility and retry window permit.
- **Send one additional copy — sends email:** an explicit, audited new request.
  Document copies retain the same staff permission boundary; administrative
  notice recovery remains owner/administrator-only.
- **Record review — no email:** acknowledge an exception without inventing evidence.
- **Prepare office notices:** explicitly contacts the office using the saved
  submission; never the customer. Already frozen recipients are not sent anew.

Earlier uncertain manual attempts can be verified by an owner/administrator using
a provider message ID. Recipient, subject and the original send time must match.
That repairs the receipt only: no guessed historical body/version, document-status
change or resend. Some legacy notices cannot be repaired automatically.

## Signed provider events

`POST /api/resend/webhook` verifies the original raw bytes with Svix HMAC, constant-time
comparison and a five-minute timestamp window before parsing or writing. The
stream has a 256 KiB limit and a five-second read deadline. Event IDs and payload
hashes are deduplicated; collisions fail. Provider IDs/tags and impacted recipients
must agree with saved evidence; unsafe matches are quarantined. Events can arrive
before the send response and repair a lost acknowledgement. Only minimal routing,
status and hash facts are retained, not raw webhook bodies or provider diagnostics.

Supported events are `email.sent`, `email.delivered`, `email.delivery_delayed`,
`email.failed`, `email.suppressed`, `email.bounced` and `email.complained`.
Signed matching bounce/complaint/suppression events stop pending messages to the
impacted address. Provider lookup alone does not create address suppressions.
Unsupported signed events are acknowledged without processing. Missing configuration
or an unconfirmed database receipt returns a retryable failure. Repeated verified
receipts may retry history repair; they never invoke an email sender.

New private tables have RLS enabled and no direct client grants. Service commands
require the service role with no user JWT. Authenticated list/review commands check
live staff/admin status. Client writes cannot forge the new provider facts.
Existing public/storage RLS policies and PR03/06/07 financial commands are preserved.
Stripe recovery stays in its existing receipt/manager recovery protocol; do not
replay financial work solely to repair an email.

## Future approved rollout requirements

No provider configuration was changed during local implementation. Before a future
approved release, apply the additive migration before the new sender code, then
configure the Resend endpoint and verify it in an approved test environment:

- `RESEND_WEBHOOK_SECRET`: signing secret for this endpoint, obtained from Resend.
- `RESEND_WEBHOOK_SECRET_PREVIOUS`: optional previous signing secret during rotation.
- Existing `RESEND_API_KEY`, `EMAIL_FROM` and optional `EMAIL_REPLY_TO` are preserved.
  Provider lookup additionally needs an existing key authorized to retrieve sent
  emails; a sending-only key may not permit this GET. Do not broaden or rotate
  credentials without separate authorization.
- Endpoint: the approved application's `/api/resend/webhook`, subscribed to the
  seven events above. Do not expose a local test endpoint or reuse another
  service's signing secret.

There is no blanket legacy backfill, automatic uncertain-send retry worker or new
scheduler. Keep all automation settings unchanged. Review legacy unknown requests
and any in-flight work explicitly during rollout. Local tests use stub providers,
generated test signatures and disposable database records; real Resend acceptance,
webhook registration and inbox delivery were not verified.

See [the test instructions](../../../tests/README.md#pr14--durable-delivery-and-safe-repair).
Primary provider contracts:
[raw signature verification](https://resend.com/docs/webhooks/verify-webhooks-requests),
[idempotency retention](https://resend.com/docs/dashboard/emails/idempotency-keys),
[GET email evidence](https://resend.com/docs/api-reference/emails/retrieve-email), and
[Svix manual verification](https://docs.svix.com/receiving/verifying-payloads/how-manual).
