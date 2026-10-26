# Quote-save performance

Verified October 26, 2026. The preceding cloud-performance batch and its staging
reconciliation were pushed to `origin/main` at `38453056ad87fb6da10e4827342b5767324173b3`
with CI/Netlify skip markers. The verified quote-save batch was subsequently
pushed to main as `a157152`, also with skip markers. Production was not deployed,
reconfigured or written to; the home scanner was not touched.

## Measured result

Six synthetic staging saves before and six after the final change:

| Confirmed save | Before | After |
| --- | ---: | ---: |
| Median | 2,406 ms | 450.5 ms |
| Observed range | 2,215–2,700 ms | 362–712 ms |
| Successful saves with durable reload verification | 6/6 | 6/6 |

This is about an **81% reduction in confirmed-save latency** in this small Wi-Fi
sample. It is not a production latency guarantee or a cellular/capacity test.
Both cohorts used the same synthetic owner and quote. Other synthetic validation
fixtures were added between cohorts; these are controlled staging observations,
not a statistically isolated load test. No external provider requests occurred.

The editor previously waited for its entire Server Action re-render before
acknowledging a confirmed save. Removing unnecessary reads alone did not materially
change that button latency. The new ordinary-save transport returns the existing
command's confirmed receipt first; the router refresh runs separately. The table
measures the durable save acknowledgement, not completion of that background
refresh. Save-and-close retains the existing Server Action and full navigation.

## Implementation

- `QuoteForm.tsx` uses a receipt-only POST for existing quotes' **Save changes**.
  Creation and **Save and close** keep their existing Server Actions. The recovery
  copy is acknowledged only after a validated successful receipt. A background
  `router.refresh()` preserves cache freshness without holding the save button
  pending for a complete editor render.
- `/api/admin/quotes/[quoteId]/edit` calls the same `updateQuote` function, which
  performs fresh Auth/caller-RLS reads and invokes `save_quote_details` once. It
  retains the same receipt validation, lead archival, audit behavior and path
  invalidation. It adds no alternate financial command or privileged DB client.
- The endpoint requires the exact configured application Origin, validates the
  URL/body quote identity, rejects file-valued fields, bounds multipart input to
  the existing 26 MiB Server Action ceiling, forces ordinary-save intent and
  returns private/no-store responses. It does not trust forwarded-host headers.
- `submit-edit.ts` makes one request, checks the returned newer revision and
  retained/new line identities, and refuses malformed receipts. It never retries
  or falls back to another write after transport uncertainty.
- `updateQuote` runs independent account/contact/estimate/location/job preflight
  reads concurrently while retaining the old validation/error precedence. A
  derived location still receives the original ownership check. The database
  transaction repeats its live authorization and relationship checks as before.
- The editor's new `getQuoteForEditing` reads only the saved header and lines.
  History, notes, billing and contact joins remain available on the detail page
  and other existing consumers of `getQuoteDetail`. A supplemental staging read
  sample dropped from three requests / 691 ms to one request / 102 ms; these are
  supporting observations, not the paired save benchmark.

No database migration, RLS policy, transaction implementation, financial
calculation, customer link, communication command, environment value or secret
was changed. The UI retains its existing appearance and capabilities.

## Verification

- **3,211 unit/PostgreSQL checks passed**, plus typecheck, production build,
  schema-fingerprint and whitespace checks.
- New transport tests cover Origin enforcement, a forged forwarded host, URL/body
  identity, input size, exact retained identities, stale/malformed receipts and
  one-request-only uncertainty. Existing creation/restart recovery tests remain
  in place, with an added check distinguishing ordinary saves from save-and-close.
- Native local and staging tests compare the editor's header/lines to the full
  detail read under owner/crew RLS, confirm totals and identities, reject stale
  edits, simulate a committed write whose acknowledgement is lost, and revoke
  employment access after preflight but before the transaction. Explicit retries
  conflict without duplicating the original write.
- Real local and protected-staging browser tests passed for keyboard saving,
  retained/new lines and totals, desktop/mobile layouts, typing during a delayed
  router refresh, recovery after a lost HTTP acknowledgement, a safe conflicting
  retry, reload, and save-and-close with return context.
- Direct HTTP tests with signed-out and active crew cookies fail to save through
  the new endpoint and leave the saved quote unchanged. Test accounts are
  disabled and banned after use. No customer emails or payments are sent.
- Actual staging screenshots at 1280 px and 390 px were inspected. No horizontal
  overflow, data warnings or uncaught browser exceptions occurred. The bounded
  Impeccable detector pass found no issues in the changed editor files.
- Existing staging migrations remain at 129. All existing RLS policy/function
  hashes, two invoices, one payment and 24,000 cents of paid principal are
  unchanged. All 78 previously pending work-file hashes and the separate runtime
  security commit are preserved. The branch descends from current `origin/main`.

Private raw evidence, source fingerprints and cleanup records are retained at
`/Users/noelsierra/Documents/Codex/2026-10-26/quote-save-performance/`.
Key records are `SAVE_TIMINGS.json`, `native-local.json`, `native-staging.json`,
`local-ui.json`, `cloud-ui.json`, `database-preservation.json` and
`FINAL_VERIFICATION.json`. They contain no production test writes. Credentials
and raw logs are outside Git.

## Release considerations

No new migration is needed for this batch. Keep `APP_BASE_URL` bound to the
authorized application origin when eventually releasing it. Ordinary saves
acknowledge sooner while the editor refreshes; complete page navigation still
has its own loading cost. Background-refresh failure cannot undo a confirmed
transaction, and an uncertain write is never silently retried. Production
release and live verification remain pending explicit authorization.
