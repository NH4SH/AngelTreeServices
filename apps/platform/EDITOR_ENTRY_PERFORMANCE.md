# Document-editor entry and lookup reads

Verified October 26, 2026. The invoice/change-order save batches are pushed normally
to `origin/main` as `7d41729daec6df212c94aed51fa609ddac8a2640`. This editor-loading
batch is now pushed normally as `30231a8d706cd336c3e8f5fb1d83baae8519a808`, with
CI/Netlify skip markers. Published staging, production and the scanner are
unchanged. The subsequent local lookup follow-up is in `PAGED_QUOTE_LOOKUPS.md`.

## Measured result

The paired protected-staging runs used the same synthetic owner and documents,
plus 160 unrelated customers, locations, work orders and organization contacts.
Synthetic lookup notes intentionally exercised the fields the UI did not use.
Each editor has six full-navigation samples after one excluded warmup. Separate
authenticated HTML probes ran outside the timed intervals.

| Editor | HTML bytes before | HTML bytes after | Entry median before | Entry median after |
| --- | ---: | ---: | ---: | ---: |
| Quote | 1,102,686 | 203,620 | 874.5 ms | 899.5 ms |
| Change order | 426,349 | 46,192 | 874 ms | 682.5 ms |
| Invoice, unchanged control | 45,075 | 45,075 | 638 ms | 590 ms |

Quote HTML fell about **82%** and change-order HTML about **89%**. These are
uncompressed HTML/serialized-prop bytes, not compressed wire-byte or billing
claims. All 36 measured entries loaded without database warnings.

Change-order entry improved about **22%** in this sample. Quote entry did not show
a meaningful timing improvement. Outliers and the unchanged invoice control's
variation show that request/runtime/network variability still matters. This batch
does not establish production, cellular, real-device or load-test performance,
and it does not claim to eliminate every multi-second interaction delay.

## Implementation

`getQuoteEditorLookups` uses the caller's existing Supabase client and the same
active/archive filters and ordering. It selects only fields consumed by the
quote editor. Every existing customer, organization, contact and location choice
remains available within the original lookup contract. Unused billing details,
location gate codes, access/service notes and contact notes are no longer passed
to this browser form. Full readers used elsewhere are unchanged. Job, estimate,
material and category choices retain their existing readers.

`getChangeOrderForEditing` loads the current header, billing lines and its one
fixed work order through caller RLS. The editor's work-order select was already
disabled; fetching every unrelated job served no editable capability. Active
contacts are read only for that work order's organization, using stable
`full_name, id` pages if needed. The editor no longer requests unused approved
quotes, unrelated organizations' contacts or detail-only relation objects.
Creation and the full detail/history/email/portal readers remain unchanged.

The change-order form's contact type is narrowed to its actual fields; its
emitted JavaScript is identical to the pushed version. Save commands, browser
receipt transports, retry identities, revision checks, approval boundaries,
financial calculations, RLS, grants and SQL are unchanged. No migration or secret
is required.

The necessary failure-state change is explicit: if the change-order parent,
contact, material or category read fails, the page shows its existing warning and
a Reload editor link instead of mounting a saveable partial form. Missing or
archived parent jobs cannot fall back to global lookups. This avoids silently
emptying contact/material selections after an incomplete read. Genuine absence
still shows the existing unavailable-record state.

## Verification

- The full **3,222-check regression suite** passed. The subsequently added
  page-failure test passed separately with the four reader fault tests: **3,223
  distinct unit/regression checks** in total. Explicit typecheck, local production build,
  protected staging build, schema fingerprints and `git diff --check` passed.
- Reader fault tests cover absent/denied/malformed records, unavailable parents,
  no global fallback, customer jobs requiring no contact read, scoped contact
  pagination beyond 1,000 rows, missing/error responses and visible quote lookup
  failures. The rendered page test proves incomplete reads expose no save form.
- Native local and staging tests compare every quote lookup ID and displayed
  field against the original readers' selections, and change-order header,
  totals, revision, line and selected-parent/contact fields against authoritative
  caller-RLS reads. Disabled old sessions, active crew and anonymous clients gain
  no draft-editor access. Test actors are disabled and banned afterward.
- Actual local and protected-staging browsers switch individual customers and
  organizations, verify matching locations/jobs and all contact selectors, save
  with the keyboard, and confirm unchanged financial scope and selected contacts
  after refresh/reload. Returned HTML excludes unused private lookup notes/codes
  and unrelated change-order lookups.
- Desktop 1280 px and mobile 390 px renders were inspected in both environments.
  The incumbent visual design is preserved. No horizontal overflow, database
  warning, uncaught browser error or external application request occurred.
  The bounded Impeccable detector reported no findings.
- The protected, unpublished draft has one server function, no schedules or
  email/payment-provider credentials, and no private values embedded in its
  public, edge or function artifacts. Published releases remain unchanged.
- Staging remains at 129 migrations with unchanged public function/RLS
  fingerprints. Every pre-existing baseline customer, organization, location,
  job, quote, invoice, payment, checkout, change-order, token and activity row is
  compared by ID during cleanup. The 160 unrelated synthetic lookup groups are
  archived/deactivated, preserving their history. Main synthetic documents remain
  for verification history; test accounts are disabled and banned.
- The 78 pending files in the separate Firewood worktree and the runtime-security
  worktree commit are preserved. Main remains an ancestor. Only the task-owned
  local app/database are stopped; volumes and unrelated stacks remain.

Private evidence lives outside Git in
`/Users/noelsierra/Documents/Codex/2026-10-26/editor-entry-performance/`, including
`cloud-before.json`, `cloud-after.json`, native/browser results, desktop/mobile
captures, cleanup records, source fingerprints and `FINAL_VERIFICATION.json`.
Raw credentials and logs remain private. No customer emails, provider calls,
production writes, production deployment or scanner changes occurred.

## Remaining priority

Quote lookup lists retain their original global API row-limit behavior. The next
focused step should introduce searchable/paged customer, location and job choices
without dropping existing selections or recovery state. Continued navigation
timing work should distinguish server response delays from client loading; the
payload reduction here does not prove that all remaining latency is fixed.
Production release and the existing policy/mailbox/device/security follow-ups
retain their separate review boundaries.
