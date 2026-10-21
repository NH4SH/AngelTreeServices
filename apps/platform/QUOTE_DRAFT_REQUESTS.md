# Durable web quote creation

## Outcome

Quote-edit confirmation commit `9018a78` was pushed atomically, without force, to
main and its preserved branch. This PR05/PR12 follow-through is based on that main
on `codex/quote-draft-requests`, saved locally pending push. No deployment or
hosted database operation was performed.

The original installed `create_quote_draft` command creates two quotes and two
creation audits when called twice with the same actor and payload. That is valid
for separate intentional drafts, but unsafe as recovery from a lost response.
A rollback-only local reproduction confirmed that footprint.

New web quote submissions now keep one random request ID through validation,
transport errors, retries and browser draft restoration. The server calls
`create_quote_draft_request`, which serializes that identity, binds it to the
current actor and SHA-256 fingerprint of the header and ordered lines, then
delegates creation to the existing protected command. Quote, lines, mandatory
creation history and private receipt commit or roll back together.

The same actor and unchanged payload recover the original receipt. Changed
details or another actor cannot reuse it. Live staff authorization is checked
before and after waiting for the request lock. Replaying an edited or approved
quote returns its current status without updating it or issuing a second audit.

Initial confirmed creation preserves Save draft, Save and close, safe return
context and source-lead archiving. An uncertain result keeps the form. A replay
offers **Open saved quote** and retains the recovery copy, without automatic
navigation, acknowledgement or another source-lead archive. The original receipt
is not treated as confirmation of a later edit. A recovered lead may require
manual archiving after review. There are no automatic request retries or deletes.

## Boundaries preserved

- Existing quote validation, financial calculations, line/material relationships,
  organization contacts, work-order/source validation and transactional history
  remain in `create_quote_draft` without changing its SQL.
- Recurring, duplication, mobile and other existing creation callers retain their
  command. This package protects **web editor submissions**, not every independent
  quote-creation pathway. Different request IDs can intentionally create separate
  quotes; there is no broad customer-based deduplication.
- Migration 99 adds a private ledger with RLS, a restrictive false policy and no
  raw public/anon/authenticated/service grants. Only authenticated callers can
  execute the new staff command. It has an empty search path and five-second lock
  timeout, reuses the existing authorization/transaction boundary and never trusts
  user-editable metadata for authorization.
- Existing quote editing, draft privacy, employment/security redesign, billing,
  notifications, scanner and production settings remain intact.

## Verification

- All **1,839 regular results** passed, including 63 new request-confirmation
  checks and six tests of actual editor submit/restore callbacks with persistent
  hook slots. Errors, malformed/foreign receipts, request binding, organizations,
  source leads, navigation, replayed statuses, deadlines and draft retention are
  covered. Existing quote-edit and recovery checks still pass.
- **19 installed SQL scenarios / 20 TAP results** passed in a separate fresh local
  database. All four office roles, organization contacts, lost/exceptional
  responses, edited/approved replay, actor/payload mismatch, inactive/revoked
  access, anon/service denial and narrow private grants are covered. Late line,
  mandatory audit and receipt failures leave zero quotes, lines, audits or receipts.
- **Five independent-session committed races / six TAP results** passed in a
  separate local database, which was dropped afterward. Identical submissions
  yield one quote/audit/receipt and one replay; changed payload or actor yields one
  winner and rejection. Revocation or deactivation while waiting yields no quote.
- All 99 migrations replayed from empty locally. The catalog delta is exactly 12
  additions, with zero previous changes/removals. Original migrations remain
  untouched; generated public types add only the new RPC.
- A deliberately failed shared-local upgrade rolled back cleanly, then original
  migration 99 installed atomically. All 110 pre-existing public row sets,
  existing private rows and prior catalog definitions/policies/constraints remain
  unchanged. The existing native local migration ledger, buckets and scan switches
  are preserved; no blanket migration/reset was used. The new ledger is empty.
- Isolated Node 22.23.3 typecheck and optimized build passed with synthetic
  configuration. Final source overlays match the built bytes; offline schema and
  whitespace checks pass. Local database lint returned no errors.
- Local advisor WARN findings remain 42, with no new non-usage findings. INFO counts
  changed 531 to 538: nine added/two removed findings concern unused-index usage
  statistics across the two databases. This is not a hosted advisor verdict. The
  new authenticated staff RPC will require the same explicit SECURITY DEFINER
  review as the existing command during staging reconciliation; do not suppress
  the hosted rule or broaden privileges.
- The existing local sign-in endpoint returns 200, and the authenticated quote
  editor renders with its existing fields and actions. No browser form was
  submitted. Callback/adaptor tests and actual SQL tests are distinct from a full
  browser lost-network/mobile-device acceptance run.

## Files and operation

Migration: `supabase/migrations/20261021032121_quote_draft_requests.sql`.
Web: `src/lib/quotes/draft-request.ts`, `src/app/admin/quotes/actions.ts` and
`QuoteForm.tsx`. Contracts: generated database types and schema manifest.
Tests: `tests/quote-draft-*`, quote fixture and PR12 session adapter. The staging
source inventory appends the exact migration-99 hash; its inventory test expects
99 local files, without changing the historical 93–98 candidates or their seals.
The first full run correctly caught that stale inventory; the corrected complete
run passes. No checks were disabled.

Regular checks: `npm run test:unit`, `npm run typecheck`, `npm run build`, and
`npm run schema:check:offline`. Installed SQL/race suites are opt-in and require
`QUOTE_DRAFT_DISPOSABLE=1`, the established disposable Docker socket/binary and
`QUOTE_DRAFT_DATABASE` matching a newly replayed `ats_quote_fresh_<32 hex>` database.
They reject the shared/default and hosted targets. The editor tests use controlled
callbacks; the SQL tests exercise the installed commands as separate evidence.

Private evidence:
`/Users/noelsierra/Documents/Codex/2026-10-20/quote-draft-requests/`.

## Next step

Reconcile original migration 99 against the existing staging-98 preimage with an
isolated rehearsal, exact ledger/catalog/default/guard checks and synthetic
permission tests. Migration 99 remains separately deferred for hosted review;
hosting readiness stays false. No staging or production deployment was attempted.
Legacy uncertain recovery copies created before request IDs existed still require
the existing manual directory review; they cannot retroactively recover a receipt.
