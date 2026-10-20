# Quote change-request safety

October 20, 2026. Customer portal acceptance commit `e90a9fc` is pushed to main
and `codex/customer-portal-acceptance`, with deployment skipped. This follow-up
continues the existing PR05/PR13 roadmap on `codex/quote-change-safety`, based on
that main commit. The new changes are local and pending push. Nothing was deployed.

## What changed

The former customer-change action wrote the note, quote status, reminder
cancellation and token use separately. Compensation after a quote-write failure
was another unchecked request; retries had no durable identity or reviewed
revision. Approval already had a transactional guard, but change requests did not.

The service-only `request_quote_changes_by_portal` command now:

- Locks request identity, then the existing job, quote and link in the established
  order. It checks capability binding, expiry/revocation and archive state after
  waiting. Wall-clock expiry applies even if the transaction began earlier.
- Requires the revision the customer reviewed. Each intentional message advances
  it once, including another message while already `change_requested`. Concurrent
  editing or approval receives a conflict instead of overwriting the other action.
- Commits the existing internal note, quote status, pending-reminder cancellation,
  token use, required audit event and private retry receipt together. Processing
  communications are left to the existing delivery/eligibility machinery.
- Replays an identical request without new notes, revisions, reminder writes or
  history. Changed payloads or links cannot reuse its identity. A valid link can
  recover an earlier acknowledgement after later approval without reopening the
  quote. Expired, revoked or archived access cannot recover it.

The browser keeps an opaque retry ID, reviewed revision and message digest in
session storage; it stores neither the raw capability nor message. An uncertain
retry retains the original revision even after reload or message editing. When
storage is unavailable, page-local retry identity still works. The message stays
in the form on errors; pending controls recover. POST is explicit so a native
pre-hydration submission cannot put private form fields in a GET query string.
No-JavaScript completion is not introduced by this change.

The server requires a complete, matching acknowledgement before showing success
or invoking the existing customer-activity pipeline. Uncertain results retain a
retry identity and honest wording, without exposing backend diagnostics.

## Security, compatibility and release boundaries

The public wrapper is executable only by `service_role`, and checks the trusted
service identity with no end-user subject. The private helper is not executable
by API roles. The private receipt table has RLS, no client policies and no API-role
table grants. Raw tokens and message text are absent from that table. Its foreign
keys follow existing quote/link deletion behavior; only retry metadata cascades.
Existing note/audit lifecycles and deletion authorization are unchanged.

A required `quote_change_request_recorded` audit event is inside the transaction.
The existing `quote_portal_changes_requested` customer-activity event/notification
runs afterward, with the stable note-based idempotency key. These serve separate
transaction-history and notification purposes. Retrying before the notification
boundary can recover that invocation; this is **not** a new transactional email
outbox or proof of provider delivery. The existing pipeline's crash boundary
between recording activity and preparing notices remains a PR14 follow-up.

All 93 earlier migration files and existing function bodies, grants, policies and
constraints remain intact. Migration 94 is pinned separately in
`supabase/staging/deferred-migrations.json`. Historical staging verification still
requires its exact reviewed 93-entry ledger and permissions; it does not accept
94 as installed. Unknown or altered source migrations still fail verification.
No target profile, Auth guard, credential, hosted ledger or readiness flag changed.
A separate staging reconciliation review is required before installing migration94.

## Verification

- **817 regular CRM unit/PostgreSQL regression results pass**, no failures/skips.
  This includes six new command/retry cases and the updated release guard checks.
- **12 local integration scenarios pass, 13 results with parent**: simultaneous
  duplicate/replayed requests; a second intentional note; stale/closed/archived
  refusal; competing approval; a real editor lock; revocation/expiry while waiting;
  actual wall-clock expiry during the wait; injected audit failure with complete
  rollback; replay after approval and denial after revocation; API-role denial and
  private-table privileges; existing link-deletion compatibility in a rolled-back
  synthetic transaction; actual server-action acknowledgement/notification identity
  and rendered POST form.
- The real browser rejected an outdated synthetic proposal, retained the message,
  and restored both controls. No customer note was created. Screenshot evidence:
  `/Users/noelsierra/Documents/Codex/2026-10-20/quote-change-safety/stale-request-retained.png`.
- Typecheck and optimized Next build pass in a separate current-source copy with
  synthetic configuration, no copied `.env`, real credentials or Netlify link.
- All **94 migrations** replayed into a new empty local database. Generated RPC
  types and migration fingerprints match; offline contract verification passes.
- SQL lint finds no schema errors. Advisors retain the baseline42 warnings and
  add no warnings/errors. Three new INFO findings are expected on an empty replay:
  two unused receipt indexes and RLS without policies on the deliberately private,
  API-inaccessible table. No client policy is added to silence that finding.

The first full run exposed release checks assuming the source inventory stopped
at93; the separately pinned deferred inventory addresses that without changing the
hosted candidate. One unrelated short-runtime communication test timed out during
concurrent replay; it passed in isolation and subsequent full runs. No unrelated
runtime behavior or test threshold was changed.

Integration commands use real local Auth/RLS/Postgres. Notification, rate-limit
and cache-revalidation boundaries are controlled doubles only in the loaded
server-action case; the browser stale request exercises the actual local action
and rate check. All test HTTP transports are restricted to the exact loopback
services. No email/Stripe provider or communication dispatcher was invoked.
Success-path notification delivery and a successful browser submission are not
claimed as tested here.

## Preservation and next step

All pre-existing row fingerprints across **110 public tables** are retained.
Original function definitions and constraints, native local migration ledger68,
policies, scan settings and bucket configuration match the captured baseline.
Four trial-run actors are disabled/separated with zero remaining sessions, and
all their capabilities are revoked. The separate browser capability is revoked.
Synthetic records and history remain; original review users/tokens are untouched.

Read-only Netlify metadata still identifies the ready production CSS-only deploy
`6ad6ecfc6c03786554247e4a`. No app deployment, hosted migration, production write,
scanner activation or environment change occurred.

Review and push this bounded package next. Continue existing protected-staging
reconciliation/runtime/access/CDN acceptance and PR14 notification recovery work;
the home scanner/restore/operator gates remain independent and outstanding.

Safe machine-readable results: `staging/QUOTE_CHANGE_REQUEST_VERIFICATION.json`.
Private local logs and replay/build receipts:
`/Users/noelsierra/Documents/Codex/2026-10-20/quote-change-safety/`.
