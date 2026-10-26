# Invoice-save responsiveness

Verified October 26, 2026. The preceding quote-save batch is pushed normally to
`origin/main` as `a157152b8cfec08600646780e02ed0fb421d6145`, with CI/Netlify skip
markers. The verified invoice and change-order batches were subsequently pushed
normally to main as `7d41729daec6df212c94aed51fa609ddac8a2640`, also with deployment
skipped. This report records their pre-push verification. Production and the home
scanner are unchanged.

## Result

| Confirmed ordinary invoice save | Before | After |
| --- | ---: | ---: |
| Median | 2,125 ms | 338.5 ms |
| Observed range | 1,885–2,297 ms | 257–533 ms |
| Saves confirmed after reload | 6/6 | 6/6 |

The paired synthetic staging samples show about an **84% reduction in save
acknowledgement latency**. Both cohorts edited due dates on the same synthetic
invoice with the same owner account. Additional synthetic validation fixtures were
added between cohorts. These small Wi-Fi samples are not production, cellular or
load-test guarantees. No payment/email provider requests occurred.

The endpoint returns the existing atomic command's validated receipt before the
full editor refresh. The editor then refreshes separately, preserving router
freshness and the user's current controls. The timing measures acknowledgement,
not completion of that background refresh. Save and close retains its original
Server Action and navigation behavior.

## Change boundary

- `InvoiceForm.tsx` uses `submitInvoiceEdit` only for ordinary existing-invoice
  saves. Creation, Firewood creation and save-and-close keep their original
  actions. Recovery is acknowledged only after a valid successful receipt.
- `/api/admin/invoices/[invoiceId]/edit` reuses **the unchanged `updateInvoice`**.
  That action still checks Auth and current roles, calls `save_invoice_details`
  once, validates the transaction receipt and invalidates the same record/list/
  customer/organization paths. There is no alternative financial write command.
- The new transport follows the verified quote boundary: configured Origin,
  matching URL/body identity, text-only multipart fields, the existing 26 MiB
  ceiling, forced ordinary-save intent, and private/no-store responses. Forwarded
  host headers cannot authorize a request. Transport uncertainty never causes
  automatic retry or fallback to another write.
- Receipt validation preserves the raw PostgreSQL timestamp and compares revision
  identities at microsecond precision, including equivalent timezone forms. It
  checks retained/new line IDs and rejects stale, incomplete or malformed replies.
- `getInvoiceForEditing` keeps current invoice fields, authoritative balances,
  billing lines and the displayed customer/organization/job labels. The editor
  no longer fetches unused payment/history objects. Full detail, history, payment,
  email and print consumers retain the original `getInvoiceDetail`.

No SQL, RLS, database grants, payment calculations, status transitions, tax rules,
terms, credentials or production configuration changed. In particular, pending
payments and open/processing checkout sessions still block edits inside the
existing transaction. The current CRM stores a provider-processing payment as
`pending` and/or a `processing` checkout; no new payment status was invented.

## Verification

- **3,214 unit/PostgreSQL checks passed**, plus typecheck, local production build,
  protected staging build, schema fingerprint and whitespace checks.
- New transport tests cover Origin enforcement behind ingress, forged forwarded
  host, URL/body mismatch, size limits, exact line identities, microsecond and
  timezone equivalence, invalid dates, stale/malformed receipts and no retries.
  Existing quote and invoice confirmation/recovery tests remain green.
- Native local and staging tests confirm editor fields/balances/terms against the
  full caller-RLS read; exact retained line identity; one successful atomic write;
  stale-write denial; committed writes with lost acknowledgement; safe explicit
  retry; pending-payment and open/processing-checkout rejection; and revoked access
  after application preflight. Payment/checkout cases use only new synthetic rows.
- Actual local and protected-staging browser tests confirm keyboard saving, totals
  and balances, preserved linked records/payments, editing during a delayed router
  refresh, recovery after a deliberately lost HTTP response, safe stale retry,
  review/discard of the recovery copy, and save-and-close with return context.
- Direct HTTP attempts with signed-out and active crew cookies cannot write
  through the new endpoint. The saved invoice remains unchanged. Test users are
  disabled and banned after use.
- Desktop (1280 px) and mobile (390 px) screenshots were inspected. No horizontal
  overflow, data warning or uncaught browser exception occurred. The bounded
  Impeccable check reported no findings; appearance was preserved.
- Staging remains at migration 129 with unchanged existing RLS policy/function
  hashes. Pre-existing staged records, including their invoice and payment rows,
  are compared to the pre-test baseline during cleanup. New synthetic fixtures
  and their history are retained; they are not production data.
- All 78 pending-work file hashes in the separate Firewood worktree and the
  runtime-security commit are preserved. Current main is an ancestor of this
  branch. Published staging and production releases remain unchanged.

Private evidence is retained in
`/Users/noelsierra/Documents/Codex/2026-10-26/invoice-save-performance/`:
`cloud-before.json`, `cloud-after.json`, `native-local.json`, `native-staging.json`,
`local-ui.json`, `cloud-ui.json`, cleanup records and `FINAL_VERIFICATION.json`.
Raw logs and credentials are outside Git. No customer emails, Stripe charges,
production writes, production deployments or scanner changes were made.

## Release and next priority

This batch needs no migration or new secret. A future authorized release must
retain the configured `APP_BASE_URL` binding. Full navigation and background
refresh still have their own loading time; they do not delay the confirmed-save
receipt. Next, measure change-order editor saves and apply the same focused
optimization only if their timings justify it. Production rollout stays separate.
