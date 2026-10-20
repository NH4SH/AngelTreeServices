# Atomic customer-activity preparation and recovery

The verified office-alert read fix `170f55d` is pushed to `main` and
`codex/admin-alert-recipient-reads`, with deployment skipped. This follow-up closes
its explicitly deferred activity → notification/email-preparation crash boundary.
The employee redesign and all earlier CRM work remain intact.

## What changed

`prepare_customer_activity` commits the activity log entry, complete owner/admin
in-app audience, email preference decisions, immutable email requests and their
notification links in ONE transaction. A failure on the final recipient rolls
back the entire preparation. Email transport runs only after a positive, complete
receipt and outside the transaction. Fan-out remains capped at three concurrent
requests. A single JSON result avoids URL-sized recipient lists and Data API row
representation caps. The previous bounded read helpers remain covered separately.

A private preparation receipt binds the original request identity to the exact
redacted event facts. Identical replay returns original activity/delivery IDs;
different facts under the same key are rejected. Replay never adds today's new
administrators or re-enables previously skipped email. Name, recipient, content,
original preparation time, sender, reply-to, admin destination, related record IDs
and provider key are frozen. Existing `admin-activity:<notification UUID>` keys
and `admin_customer_activity` email classification are preserved. HTML is escaped.
No API key or provider credential is part of the saved payload.

Eligible recipients retain owner/admin roles and active profiles, with the
existing PR02 effective-access predicate also excluding separated, inactive or
archived employees. Overlapping owner/admin membership produces one notice.
Absent preferences keep the existing enabled default; explicit opt-outs, the
`other` category, unusable addresses and provider suppression retain in-app
notices with email skipped. Before dispatch, the normal PR14 claim rechecks live
access, role, email identity, preferences and suppression. It never redirects a
saved request to a newly changed address.

Two narrowly guarded extensions add the `admin_activity` kind to the existing
saved-email snapshot and eligibility helpers. Its snapshot describes the immutable
activity/notice, so later unrelated quote/invoice edits do not silently erase a
historical office alert. Existing financial, reminder, website-block, token and
customer billing-recipient predicates remain unchanged. No offboarding, financial,
Stripe, source transaction, customer reminder or production configuration was
rewritten.

## Recovery uses the existing Delivery review

Open **Leads & Communications → Delivery review**. No new queue or automatic
retry worker was introduced, and opening the page does not send email.

| Interruption/outcome | Result and recovery |
| --- | --- |
| Preparation transaction fails | No partial activity, notice or email request. Retry the same stable event. |
| Commit succeeds but response is lost | No speculative send; the complete saved requests remain visible for existing supervised review. Same-event replay reuses them. |
| Sending is unconfigured | Complete requests remain prepared; no claim/provider call. Review configuration and use existing supervised recovery. |
| Repeated/concurrent dispatch | Existing exclusive PR14 claim admits one attempt. Already accepted/dispatching/unknown requests do not auto-dispatch again. |
| Provider outcome uncertain | Existing owner/admin review, reason, attempt cap and first-dispatch 23-hour same-key window remain mandatory. No fresh-key workaround. |
| Accepted, history write interrupted | Acceptance remains saved; repair history or use verified provider evidence. Neither sends another message. |
| Signed provider event arrives later | Existing event ingestion repairs receipt/history and the linked notice status transactionally. |
| Recipient deactivated/opted out/address changed | Claim cancels rather than sending or changing the frozen address. |
| Legacy activity without the new receipt | Hold. No inferred audience, reconstructed message or historical bulk backfill. Review the old record/provider history manually. |

A private delivery→notification mapping updates `pending/sent/failed/skipped` and
attempt time from the original durable request, including webhook and supervised
repair paths. `sent` means provider acceptance, not inbox delivery. Explicit
additional copies keep their separate delivery history; they cannot overwrite the
original notice's delivery status. Read/unread status is unchanged.

The private tables have RLS enabled, no client policies, and no direct access for
anonymous, authenticated or service roles. The preparation RPC explicitly grants
only service-role execution and rejects an attached end-user identity. Existing
own-recipient notification policies and delivery-review permissions are retained.

## Verification

- **829 regular regression results passed.** Existing financial, scheduling,
  offboarding, permissions, private-file, communication and portal checks remain
  included. Obsolete multi-step emitter mocks were replaced with atomic-boundary
  checks; bounded directory helpers retain independent regression tests.
- **15 real PostgreSQL scenarios, 16 results including the parent, passed** in a
  NEW empty local database replayed through all95 migrations. No business rows
  were copied. Coverage includes late fault rollback, simultaneous same-event
  calls, an actually observed advisory-lock wait, payload collision, frozen
  replay,1,020 synthetic accounts with role overlap/disabled/separated/crew/
  opted-out exclusions, no-recipient/other-category paths, concurrent dispatcher
  claims, lost acknowledgements, live access changes, uncertainty/retry, expired
  retry windows, webhook recovery, history failure/repair, no audience expansion,
  malformed inputs, legacy holds, RPC grants and own-notification RLS.
- The loaded real PR14 dispatcher uses an actual PostgreSQL RPC adapter and a
  controlled provider callback. Simulated provider receipts exercise database
  reconciliation; they do not contact Resend or prove live inbox delivery.
- Read-only real local API directory checks passed. Anonymous preparation is
  denied and malformed service preparation is rejected through actual
  PostgREST, with zero business writes. Local liveness returns200.
- Node22 typecheck and an isolated Next.js build passed without touching the
  running development build. Generated types, offline schema fingerprint check,
  SQL lint and complete95-migration fresh replay passed.
- Fresh94 versus fresh95 local security/performance advisors:42 existing WARNs,
  no new WARNs or errors. Two new INFO notices describe the deliberately private
  tables with RLS enabled and no client policy (deny by default). INFO totals are
 532 before/after; index-usage hints also change as synthetic tests use indexes.
  These are local all-advisor results, not a new hosted staging verdict. SQL lint
  reports no errors.
- Shared disposable stack: all110 existing public-table row fingerprint sets,
  policies, existing constraints, buckets, scanner settings and native68-entry
  ledger preserved. Only the two documented existing helper definitions changed;
  four narrow functions and two private tables were added. No new synthetic
  business rows were inserted into the shared stack; scratch actors were retired.
- Actual browser inspection confirms the existing local dashboard and Delivery
  review render. No form submission, send or repair was performed using the
  browser's original session.

## Delivery boundary and remaining work

This transaction begins when `emitCustomerActivity` is invoked. It does NOT make
an earlier business mutation and the invocation one transaction. An interruption
before this call still requires the caller's durable event/replay mechanism.
Some older callers use changed-only branches or timestamp keys. They were left
intact rather than claiming exactly-once delivery across that separate boundary.
A follow-up should bind those source-event intents to their existing source
transactions and stable receipts, without rewriting financial logic or replaying
legacy customer messages. The existing stable quote-change receipt can already
replay this new preparation safely.

Migration95 is **local only**:
`supabase/migrations/20261020060328_atomic_customer_activity_notifications.sql`.
It was iterated on the disposable stack without altering its native ledger and
replayed independently in an empty database for the source contract. Hosted
staging remains at its previously reviewed94 migrations. The historical92/93/94
profiles and catalog seals remain unchanged;95 is checksum-pinned as deferred
source work. The94 read-only verifier now distinguishes that local source from
its exact94 hosted ledger; it does not apply it or grant readiness.

Next: separately reconcile migration95 and its privilege/catalog delta on the
assigned staging target, then continue the source-event handoff follow-up within
PR14. Existing protected runtime/CDN acceptance and scanner/restore/operator gates
remain outstanding. No app deployment or production database/configuration
change is included. Read-only Netlify metadata still shows ready CSS-only release
`6ad6ecfc6c03786554247e4a`.

Safe results: `staging/ATOMIC_CUSTOMER_ACTIVITY_VERIFICATION.json`.
Private local reproduction/build evidence:
`/Users/noelsierra/Documents/Codex/2026-10-20/atomic-admin-notifications/`.
Database-function guidance checked against the current
[Supabase documentation](https://supabase.com/docs/guides/database/functions).

## Publication and staging follow-up

October20: verified implementation `ce1ca85` is pushed to `main` and
`codex/atomic-admin-notifications`, deployment skipped. The separately authorized
reconciliation now installs unchanged migration95 on the assigned staging database.
See `STAGING_NOTIFICATION_RECONCILIATION.md` for current95 maintenance, exact local/
hosted catalog/permissions and remaining gates. The verification and local-only
statements above describe the implementation package's original review boundary;
no production or app deployment is implied by the staging follow-up.
