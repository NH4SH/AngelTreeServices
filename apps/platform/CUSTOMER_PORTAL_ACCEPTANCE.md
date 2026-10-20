# Customer portal acceptance and privacy hardening

October 20, 2026. The verified dashboard fix `06f768d` is pushed to main and its
preserved branch, deployment skipped. This scanner-independent follow-up continues
the existing PR05/PR13 customer workflow and protected-staging acceptance roadmap.
The new portal changes remain local and pending push. Nothing was deployed.

## Changes

1. A literal JSON `null` sent to `/api/portal/views` reproducibly returned HTTP 500
   because the handler accessed properties without checking the parsed value.
   Non-object/array bodies now receive the existing invalid-input response and
   retain the shared rate check. Actual streamed UTF-8 bytes are capped at the
   existing 4,096-byte limit, including requests without Content-Length. Oversized
   requests receive 413; malformed/invalid input receives 400. Valid tracking
   requests still use the same checked, service-only RPC.
2. General route headers used `strict-origin-when-cross-origin` on customer portal
   pages and APIs. Those capability paths now use `no-referrer`, with their
   existing private/no-store policy. This keeps token-bearing paths out of
   same-site referrers. Normal staff headers, CSP, framing protection, file
   delivery rules, token validation, approval commands and rate limits are intact.

No schema/RLS/grant, financial logic, existing offboarding transaction, application
feature or environment/credential value was changed. The organization portal
placeholder remains inactive. No scanner configuration or activation was needed.

## Verified locally

The new opt-in integration suite passes six scenarios, seven results including
its parent, against real local Auth/Data API and the running app:

- An anonymous valid quote capability renders the correct $240 proposal. Internal
  notes/property access canaries, stored token hashes/encrypted fields and the
  server key are absent from the complete HTTP HTML/RSC response. Anonymous Data
  API clients cannot read the quote/token rows or invoke portal approval directly.
- Four concurrent view beacons for one session record one view and one first-view
  history event. RPC access stays service-only.
- A stale reviewed revision cannot approve. Concurrent current approvals reuse
  one work order and one required approval audit event; the page then renders
  "Proposal approved" and token use is recorded.
- A synthetic invoice renders its $240 balance. The existing manual-payment
  request command records a $60 cash fixture; replay retains one payment. Actual
  customer HTML then shows $180 due, with internal payment notes absent.
- Expired, revoked, unknown and wrong-document-type capabilities reveal neither
  the customer record nor its private canaries. Expired/revoked view requests
  return 404, and a revoked quote token cannot replay approval.
- Null/array/primitive/malformed tracking input is refused safely, chunked bodies
  over 4 KiB receive 413, foreign origins receive 403, and direct anonymous view
  RPC access is refused. These refusals do not increment invoice views.

Approval and manual-payment tests invoke the actual transactional database
commands. They do not claim to submit the browser approval Server Action or test
its notification provider. No email/payment provider, communication dispatcher or
checkout request was invoked. The invoice fixture is created only in the existing
disposable database. All test-process HTTP destinations are restricted to the
two exact loopback services; no outbound attempt occurred through that transport.

Four input unit cases and one header case were added. All **810 normal CRM unit/
PostgreSQL regression results pass**, with no failures or skips. Typecheck,
optimized Next build and offline schema contract pass. Public website code is
unchanged. Build and typecheck use a separate source copy containing the current
changes, synthetic staging configuration only, and no copied `.env`/real keys or
Netlify link. The actual target/readiness manifest is unchanged.

Next development mode replaces HTML Cache-Control with `no-cache, must-revalidate`.
The initial HTML assertion rejected that development behavior. A separate compiled
Next server, with synthetic configuration and outbound network blocked, verifies
quote/invoice/change-order page and API-denial responses explicitly send
`private, no-store, max-age=0` and `no-referrer`; framing remains DENY. That server
was stopped. This is local framework evidence, not hosted adapter/CDN proof.

## Preservation and release state

All three test actors, including the first test run's actor, are verified disabled and
separated with zero remaining Auth sessions. All their quote/invoice capabilities
are revoked. Their synthetic records and audit history are retained. No original
review account or token was revoked.

Before testing, fingerprints were captured for all 110 public tables and the
existing ledger/functions/policies/constraints/scan/bucket configuration. Original
row fingerprints in the other 109 tables remain present. `security_rate_limits`
is the sole changed pre-existing table: normal portal requests advance its shared
counters. Limits were not reset or bypassed. All captured schema/configuration
fingerprints remain identical, including the iterative review stack's ledger.

Read-only Netlify metadata after the requested dashboard push still reports the
ready production deploy `6ad6ecfc6c03786554247e4a`. No hosted writes, app deployment,
production migration, environment change or provider operation occurred. The
existing employee/UI/PR01–PR18 work, production hotfix worktree and pre-existing
untracked Impeccable files remain intact. Main was fetched before saving this
local package; no upstream work is missing.

Safe summary: `staging/CUSTOMER_PORTAL_ACCEPTANCE_VERIFICATION.json`.
Private evidence: `/Users/noelsierra/Documents/Codex/2026-10-20/customer-portal-acceptance/`.

## Next bounded follow-up

Continue the customer-requested quote-change branch: verify repeat requests,
concurrent approval/office edits and token revocation between lookup and save.
Those are separate from the approved-quote command exercised here and fit the
existing atomic editing/customer response roadmap. No failure of that branch is
asserted by this test package. Actual customer notification delivery, Stripe
settlement and full browser form submission remain separate acceptance work.

Protected hosted runtime/access/CDN proof and the existing home-Mac scanner,
signature monitoring and paired restore/operator gates remain required before
the larger CRM release. This local package changes no release-readiness flag.

Publication update, October20: verified commit `e90a9fc` was subsequently pushed
to main and `codex/customer-portal-acceptance`, deployment skipped. The dated
verification JSON above retains its original pre-push state. The next local
package is documented in `QUOTE_CHANGE_REQUEST_SAFETY.md`.
