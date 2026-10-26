# Change-order save responsiveness

Verified October 26, 2026. Quote-save responsiveness is already pushed normally to
`origin/main` as `a157152b8cfec08600646780e02ed0fb421d6145`, with CI/Netlify skip
markers. The preceding verified invoice-save batch and this change-order batch
were subsequently pushed normally to main as
`7d41729daec6df212c94aed51fa609ddac8a2640`, also with deployment skipped. This report
records their pre-push verification. Production, the published staging app and the
home scanner are unchanged.

## Measured result

| Confirmed ordinary change-order save | Before | After |
| --- | ---: | ---: |
| Median | 2,279.5 ms | 348 ms |
| Observed range | 1,805–2,879 ms | 226–489 ms |
| Saves confirmed after reload | 6/6 | 6/6 |

The paired synthetic staging samples show about an **85% reduction in save
acknowledgement latency**. Both cohorts edited the reason on the same synthetic
change order, with the same owner account and line count. Independent synthetic
validation fixtures were added between cohorts. These small samples are not
production, cellular or capacity guarantees. Timing ends when the save is
confirmed and the button is usable; the separate background refresh has its own
loading time. Every measured save was then verified after a full reload.

## Implementation boundary

- `ChangeOrderEditor` uses a receipt-only request for ordinary **Save changes**.
  It refreshes the route separately after success. Appearance, labels, controls,
  original creation, Save for review and **Save and close** are preserved. The
  form exposes its existing pending state through `aria-busy`.
- `/api/admin/change-orders/[changeOrderId]/edit` calls the **unchanged**
  `updateChangeOrder`. The action still performs its Auth/role checks, invokes
  `save_change_order_draft` once, validates the transaction receipt, and invalidates
  the same record, directory, job and organization paths.
- The HTTP boundary follows the verified quote/invoice pattern: configured Origin,
  exact URL/body identity, text-only multipart fields, the existing 26 MiB ceiling,
  forced ordinary-save intent, and private/no-store responses. Forwarded-host
  headers cannot authorize another Origin. Exceptions report uncertainty.
- `submitChangeOrderEdit` validates the successful revision and exact ordered line
  identities. It preserves `saveRejected` and `reviewRequired`, including an old
  request's replay outcome. Unsolicited destinations and unrelated fields cannot
  drive navigation. It makes one request with a 15-second client timeout and has
  no automatic retry or alternative writer.
- Existing `prepareDraftAttempt` / `useDraftSave` continue to own request identity,
  payload digest, expected revision, opaque session-storage recovery, line mapping
  and explicit retry. A committed write with a lost response can be confirmed by
  replay without another write or audit entry. Changed uncertain input remains
  blocked; a replay still requires review before further editing.

No Server Action, SQL function, migration, RLS, grant, effective-access rule,
approval/cancellation behavior, financial calculation, link command, email command,
secret, production setting or scanner configuration changed. Revision identities
are checked as advancing integers; existing header/line triggers can advance a
revision more than once within a single atomic save. The existing audit and
request ledger determine whether an operation was duplicated.

## Verification

- **3,218 regression/unit/PostgreSQL checks passed**, plus explicit typecheck,
  local production build, protected staging build, schema fingerprints and
  `git diff --check`.
- New transport checks cover Origin/ingress binding, forged forwarded host,
  URL/body mismatch, duplicate identities, files, advertised and streamed size
  limits, forced intent, one command call, exceptions, malformed/stale receipts,
  exact line mappings, review/rejection flags and no retry/fallback.
- Native local and staging tests confirm committed-request replay without another
  audit event; replay after a later edit; stale-write rejection; one winner for
  concurrent editors; approval/edit races; approved-record edit denial; complete
  rollback for a late invalid line; and denial of an old session after access is
  disabled. Synthetic approval tests preserve parent scheduling and record links.
- Actual local and protected-staging browsers confirm keyboard saving, accurate
  totals, retained/new line IDs, unchanged parent job and active customer link,
  and preservation of newer typing while the separate route refresh is held.
- A real synthetic HTTP write is deliberately committed before its response is
  aborted. The form keeps its opaque request/revision, blocks changed input,
  survives reload and confirms an explicit replay without another write/audit.
  Original save-and-close navigation remains intact. Signed-out and active crew
  cookies cannot edit through the new endpoint.
- Desktop 1280 px and mobile 390 px renders were inspected locally and on staging.
  No overflow, data warning or uncaught browser error occurred. The bounded
  Impeccable detector reported no findings. The existing CRM design is preserved.
- Staging remains at 129 migrations. RLS policy and existing public function
  fingerprints are unchanged. Every pre-existing staged customer, location, job,
  quote, invoice, payment, checkout and activity row in the baseline is compared
  by ID during cleanup; test history is retained. Synthetic actors are disabled
  and banned after verification.
- The protected, unpublished staging draft contains one server function, no
  scheduled functions or email/payment-provider credentials, and no private
  values embedded in public/edge/function artifacts. Published staging and
  production releases are unchanged.
- The complete preceding invoice implementation, all 78 pending-work hashes in
  the other Firewood worktree, and the separate runtime-security commit are
  preserved. The shared customer-experience review receives only an appended
  checkpoint. Current main remains an ancestor; no force push or reset occurred.

Private evidence is retained outside Git in
`/Users/noelsierra/Documents/Codex/2026-10-26/change-order-save-performance/`:
`cloud-before.json`, `cloud-after.json`, `native-local.json`, `native-staging.json`,
`local-ui.json`, `cloud-ui.json`, desktop/mobile captures, cleanup records and
`FINAL_VERIFICATION.json`. Credentials and raw logs remain private. Only the
owned loopback app/database are stopped after testing; volumes and unrelated
stacks remain. No real customer email, payment-provider call or production write
was made.

## Release and next priority

This batch needs no migration or new secret. A future authorized release must
retain the configured `APP_BASE_URL` Origin binding. The invoice and change-order
batches are pushed as `7d41729`; production release remains separate.
Next, measure document-editor entry and lookup loading before choosing another
performance change. This save optimization intentionally leaves those reads and
all existing business/communications work in place.
