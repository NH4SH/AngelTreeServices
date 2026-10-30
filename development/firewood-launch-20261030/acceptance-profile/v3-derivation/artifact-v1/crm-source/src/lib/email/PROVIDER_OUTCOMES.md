# PR10: bounded sends and honest outcomes

This is a local implementation contract. It does not authorize deployment,
production migrations, worker execution or changes to credentials/automation.

## Provider boundary

The raw transport, now named `sendEmailTransport`, bounds the complete request, including response-body
reading, to 10 seconds by default; caller cancellation is forwarded. History
writes have a separate five-second deadline. The transport rejects redirects.
Provider diagnostics are reduced to fixed codes; raw payloads, authorization
headers and transport errors do not become saved/displayed diagnostics.

- `accepted`: a successful response contains a usable provider ID. `ok` remains
  true if history fails. `historyRecorded` separately describes CRM persistence.
- `rejected`: a definite non-success response. Rate limits, 5xx and the provider's
  concurrent-idempotency response can retry with the **same** key and payload.
- `unknown`: dispatch began but no conclusive acceptance/rejection was received,
  including a stalled body or malformed success. No automatic resend.
- `not_attempted`: invalid input/configuration or cancellation before dispatch.

Acceptance is not inbox delivery. Idempotency keys are validated, never silently
truncated or rotated to recover ambiguity. Resend retains keys for 24 hours;
local retry guards stop at 23 hours. See the official
[Resend idempotency contract](https://resend.com/changelog/idempotency-keys).

## Queue and staff feedback

Customer reminders claim waves of three by default (configurable pool 1–5),
with a 20-second budget for starting work. This is an admission budget, not a
hard transaction-wide deadline: database/template preparation can consume time.
The worker leaves the unclaimed remainder pending. Each attempt returns a typed
status, outcome and persistence confirmation. Completion updates require the
same processing timestamp and attempt number; errors and zero updated rows are
failures. Recipients, source eligibility, current payment principal, existing
acceptance history and claim ownership are checked before sending.

Accepted-but-unrecorded and unknown outcomes produce explicit review guidance.
Known retryable rejections only return to pending when the failure was recorded,
with at most three attempts and the existing stable communication key. Missing
financial/history reads fail closed. Exact acceptance history for the same row
can reconcile an interrupted acknowledgment even outside the reminder window.
Expired processing leases are reconciled from their own acceptance receipt or
quarantined as failed; they are never blindly reclaimed for another send.

Manual quote/invoice composers preserve a request nonce within that mounted
composer, retain secure links after unknown/retryable outcomes, block another
send after acceptance/ambiguity, and distinguish failed CRM follow-up from
failed email dispatch. Invoice delivery still uses PR03/07's existing command and
reconciliation. Multiple-quote and change-order delivery capabilities remain.
Owner/admin activity notifications use a three-send pool; preference failures
stop sending, and incomplete acknowledgments are reported without abandoning
other recipients. Existing manager queue updates now check acknowledgment rows.

All five scheduled wrappers require the canonical HTTPS admin origin and an
existing valid worker credential, reject redirects and bound the response to
25 seconds. Their schedules and secret names are unchanged. Aborting the caller
cannot cancel a server transaction already running. Review queue/history after
uncertainty. Netlify documents a
[30-second scheduled-function limit](https://docs.netlify.com/build/functions/scheduled-functions/).
No wrapper was invoked against production during verification.

## Required photo history

`20261016134622_checked_photo_upload_and_communication_outcomes.sql` adds a private
AFTER INSERT trigger to `job_photos`. It writes `job_photo_uploaded` in the same
metadata transaction, keyed by the photo ID, with the authenticated uploader and
photo category. It applies to existing web, native and direct metadata callers.
A signed-in uploader cannot impersonate someone else. RLS, private Storage,
photo categories, read/delete policies and general audit-table privileges remain
unchanged. No callable privileged endpoint or historical backfill is added.

The web helper no longer attempts a denied best-effort audit insert. A definite
SQL rollback removes only the new Storage object. An uncertain metadata response
retains the private object for review, because metadata+audit may have committed.
Storage and metadata cannot be one PostgreSQL transaction; orphan review remains
necessary on transport/cleanup failures. Existing iOS callers also get the trigger
without a DTO/API change, but a full iOS simulator build was not part of PR10.

## Historical PR10 boundaries, superseded by PR14

PR14 now implements durable requests, frozen payloads, first-dispatch retry clocks,
provider evidence and operator repair. `sendTransactionalEmail` is the durable
wrapper; the bounded provider transport remains independently tested. See
[the PR14 contract](DELIVERY_RECONCILIATION.md) for current behavior. The paragraphs
below describe the original PR10 limitations for historical context.

PR10 did **not** implement exactly-once email or a durable outbound-intent table.
Reloading a manual composer loses its in-memory nonce/review hold. Queue retry
payloads are rebuilt from current sources; changed payloads with the same provider
key must be reviewed, never worked around by rotating keys. The legacy queue has
no durable first-attempt timestamp, so its conservative 23-hour retry cutoff uses
row creation time and may hold a long-scheduled retry earlier than necessary.

The planned PR14 work owned immutable attempts/payloads, cross-reload/cross-worker business
deduplication, atomic source/version/recipient lease checks, cancellation/payment
races during external I/O, deterministic appointment versions, business-day timing
and operator reconciliation tools. A process crash can still occur between
provider acceptance, history insertion and queue acknowledgment. Uncertain rows
are stopped for review rather than automatically resent. PR08/09's transactional
cancellation still applies only to pending visit messages.

For a future approved release, apply the additive migration before new photo
helper code, preserve existing keys/configuration, inspect stale processing and
unknown outcomes, and keep automation enablement a separate explicit decision.
Do not remove the audit trigger as a casual rollback: the helper relies on it.
