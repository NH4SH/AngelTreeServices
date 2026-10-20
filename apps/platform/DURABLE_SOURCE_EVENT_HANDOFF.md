# Durable customer source-event handoff

October 20, 2026. Reconciliation commit `ca30809` is pushed to `main` and
`codex/staging-notification-reconciliation`, with deployment skipped. This next
PR14 package is local on `codex/durable-source-event-handoff`, aligned with main `074b94e`. The incoming website-only service-area update was
preserved by fast-forward; it changes no app/build dependency or migration.
No hosted database/configuration was written, no app or scanner was deployed,
and no real provider request was made. Hosted staging remains the reviewed
95-migration candidate. The new 96th migration is local and explicitly deferred.

## What changed

Previously, a customer change could commit before JavaScript invoked notification
preparation. An interrupted response could lose that handoff; changed-only calls
and timestamp identities made replay unreliable. Migration95 already made alert
preparation atomic. This package closes the preceding boundary for the five
current customer paths:

| Customer action | Durable identity |
| --- | --- |
| Quote approval | Quote + first portal approval |
| Quote change request | Quote + committed request note |
| Additional-work approval | Change order + first portal approval |
| Additional-work changes/decline | Change order + reviewed response request UUID |
| Invoice payment preference | Invoice + actual transition audit UUID |

A private trigger on the existing required source audit saves the immutable event
and its SHA256 fingerprint **in the source transaction**. A failure to save intent
rolls back the source transaction. The app retrieves that saved identity instead
of rebuilding the message from subsequently edited records or customer names.
Preparation acknowledges the source in the same transaction as migration95's
activity, notices and saved outbound requests. Provider I/O remains outside SQL.

The original quote approval, quote-change, change-order approval and invoice
preference SQL commands are unchanged, byte for byte. No original SQL function,
constraint, trigger definition, business RLS policy, financial calculation or
permission boundary was replaced. Source rows have no foreign key to their
original audit: existing source deletion behavior is preserved and intent is not
silently cascaded away. Existing source/claim eligibility still controls sending.

### Change-order responses

The previous response action separately updated status, inserted a note and marked
the token used. A new service-only command performs those writes, the required
audit, saved source event and retry receipt atomically. It locks job → change order
→ token, rechecks actual wall-clock expiry/revocation after waiting, and refuses
stale or closed additions. Concurrent approval cannot be reopened by a response.

Client retry metadata stores only digests, an opaque request ID and the exact
reviewed timestamp in session storage. It does not store the token or message.
Same-message response-loss retries reuse that identity; different wording creates
a new request without silently upgrading the reviewed record version. A confirmed
rejection/success clears it. When storage is unavailable, page-local retry identity
remains available. Receipt replay cannot overwrite a later staff/approval change.

### Recovery and mixed versions

Delivery review has a collapsed **Customer activity awaiting alerts** section for
live owners/admins, bounded to20 rows per page with independent pagination. An
operator opens the record, gives a reason and chooses **Prepare alerts — no email**.
The authenticated review receipt binds the source, reviewer, reason and request.
Preparation rechecks live access and its15-minute authority after business locks.
It never calls transport. Existing delivery controls separately govern any send.
Refresh and review again if authority expires or preparation is unconfirmed.

The normal updated customer path can prepare and dispatch through the existing
exclusive dispatcher. It requires a complete, exact saved receipt; missing
configuration persists the preparation without claiming transport. Uncertain
outcomes retain the same IDs and existing provider/retry windows. No cron job,
background replay worker, new email provider or new environment variable was added.
Audience is chosen at first preparation; source facts are frozen at source commit.
Existing claim-time live permission and source-eligibility checks still apply.

Older invoice clients can still send timestamp-key notifications after the old
preference command. Their newly captured intent is deliberately held for manual
review; the updated wrapper marks its own path unambiguously. The marker only
classifies compatibility and grants no authority. An unchanged preference retry
can find its earlier source; a genuine away-and-back transition gets a different
identity. Preference selection records no payment and changes no invoice totals.

There is **no historical backfill**. Old records with no saved source do not mint
an alert when reopened/retried. Existing differently keyed activity is held rather
than guessed or duplicated. Older change-order JS callers outside the new response
command retain their previous multi-request behavior until the app is upgraded.
This is not a claim that every historical/old client now has atomic responses, or
that provider acceptance guarantees exactly-once inbox delivery.

## Verification

- **849 regular regression results pass**, including13 new helper, endpoint,
  receipt, no-send recovery and response-identity results. Existing application
  suites remain in the gate; no production credentials are required.
- **17 real PostgreSQL integration scenarios /18 TAP results pass** in a separate
  fresh local database. They exercise original commands plus the new response
  server action, real concurrent sessions/row locks, approval versus response,
  revocation/expiry while waiting, stale/replayed responses, atomic rollback on
  injected source/preparation faults, unchanged preference retries, legacy holds,
  frozen facts, exact reviewed authority including offboarding while waiting,
  role/sequence/private-table denial and rejected browser audit forgery.
- The actual automatic handoff uses the actual existing exclusive dispatcher with
  a stub transport: simultaneous/repeated preparation makes one simulated provider
  acceptance/history record, with no invoice-audit recursion. The separate manual
  recovery leaves all delivery attempt counters0. Every test recipient is synthetic.
- Fresh empty replay of all96 original migration files succeeds; generated schema
  types/manifest and offline fingerprint check pass. SQL lint reports no errors.
  Compared with a fresh95 baseline, all-advisor WARNs stay42 with no new WARN/error.
  New INFO findings are two deliberately private RLS tables without client policies
  and three unused FK-support indexes; aggregate unused-index counts are influenced
  by the integration workload. No permissive grants/policies silence the findings.
- Node22 typecheck and optimized build pass in an isolated source copy using only
  synthetic staging configuration, no copied credentials/env, no hosting link and
  no schedules/deployment. No dependency or lockfile changed.
- The shared disposable local stack received only migration96 in one transaction;
  its native68-entry ledger was not rewritten. All110 pre-existing public-table
  row fingerprint sets remain intact. Every pre-existing public/private function,
  constraint and trigger definition matches its separately retained pre-upgrade
  snapshot. Policies, private buckets and scanner/configuration switches match.
- Local REST confirms schema reload, exact service lookup and three anonymous
  denials. The existing signed-in local app renders the new pending queue, record
  link and labelled recovery form; both disclosures work by keyboard. One new
  synthetic pending quote request is retained for review, with its own token
  revoked. No shared-local notice/email was prepared or sent. Positive recovery,
  role revocation, loading/error receipts and dispatch tests stay in scratch DBs.
  The browser screenshot checks the current908px viewport; separate phone-size
  rendering and a real hosted transport/CDN acceptance test are not claimed.

Private local reproduction/evidence:
`/Users/noelsierra/Documents/Codex/2026-10-20/source-event-handoff/`.
Safe results: `staging/SOURCE_EVENT_HANDOFF_VERIFICATION.json`.
Browser screenshot: the evidence directory's `recovery-screen.png`.

## Release boundary and next step

The source inventory now has96 checksum-pinned migrations. The historical95
maintenance verifier accepts the pinned newer local source file, but continues to
require the exact95 **hosted** ledger/catalog/grants and empty protected state.
Earlier candidates, readiness flags and all95 original migration bytes are intact.
No hosted key was retrieved, created, rotated or exposed. Read-only Netlify metadata
still shows ready CSS-only production deploy `6ad6ecfc6c03786554247e4a`.
Employee redesign, financial/concurrency work and parked MacBook scanner work are
preserved. Existing untracked review material is excluded from this package.

Next: separately reconcile migration96 on the assigned protected staging target,
using the existing exact-preimage, rollback, permission and synthetic-test process.
That review must account for the two private tables, eight new routines, one new
trigger and narrow API grants while preserving the no-send Auth guard and OFF
switches. Staging schema success does not authorize app deployment, production
migration, customer sends, legacy bulk replay or scanner activation. Protected
staging runtime/access/CDN acceptance and scanner/restore/operator gates remain.

References: [Supabase functions](https://supabase.com/docs/guides/database/functions),
[database advisors](https://supabase.com/docs/guides/database/database-advisors),
[current changelog](https://supabase.com/changelog).

### Follow-up status

Implementation `ef9defd` is now pushed to main and its branch, deployment skipped.
The assigned staging database has been reconciled to the unchanged96th migration;
see `STAGING_SOURCE_EVENT_RECONCILIATION.md` for exact verification, hosted advisor
review and the current read-only maintenance command. No app or production change
was part of that reconciliation.
