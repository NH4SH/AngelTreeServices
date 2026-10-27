# Invoice editor and creation lookup loading

Verified October 26, 2026. Quote lookups are pushed normally to `origin/main` as
`c53da30006e99205ad4ede983ce64c43b47c68de`, using CI/Netlify skip markers. This
invoice follow-up is now pushed normally as
`a5dd8343d9179bd309d2a37a2e4b43c6a1057d7b`, also with deployment skipped.
Production and published staging are unchanged. Its local change-order follow-up
is documented in `CHANGE_ORDER_LOADING.md`.

## Result and measurement

New invoices use searchable 20-row customer, organization, service-location and
work-order pages. Only selected/prefilled IDs are hydrated on entry. Work orders
are filtered to completed/ready-to-invoice before paging. Exact saved selections
remain reachable beyond the global API cap, independently of page one.

| Surface | HTML before | HTML after | Entry median before | Entry median after |
| --- | ---: | ---: | ---: | ---: |
| New-invoice drawer | 1,543,842 bytes | 140,882 bytes | 1,477.5 ms | 764 ms |
| Existing invoice editor | 45,095 bytes | 44,914 bytes | 634 ms | 581 ms |

The final paired runs use the same synthetic owner and settled records, six full
navigations per surface/version after one excluded warmup, and separate HTML
probes outside each timed interval. New-invoice HTML fell about 91%; its measured
entry median fell about 48%. The existing editor was already small, and the
timing variation does not establish a meaningful latency benefit there. These
are uncompressed HTML/serialized-prop bytes and staging observations, not
production, cellular, real-device, load-test or bandwidth-billing guarantees.

## Implementation and preserved behavior

The existing quote lookup control is reused with invoice-specific configuration.
Locations/work orders stay bound to the selected contracting party. Customer
name, phone, email and billing-address search remain supported without returning
billing addresses or private property notes in lookup payloads. Responses retain
caller RLS, live effective-access/office-role checks and private/no-store headers.
Default quote lookup behavior is unchanged.

Native dropdowns and keyboard controls remain. Browsing, Enter in search and
failed requests do not write or change a pinned selection. Restored drafts keep
their raw linked IDs while labels resolve; unresolved choices block saving.
Explicit party changes clear dependent selections. Work-order-only entry URLs
resolve that exact eligible work order's party/property directly. Conflicting
customer/work-order prefills show a warning and retain unresolved IDs for review,
with no global fallback. These are the required interaction changes from
replacing preloaded lists.

Walk-in customer creation remains available through the original atomic command.
Firewood uses the same bounded loader because it shares the form. Its
customer-only choices, required delivery address, editable prices, stacking,
household confirmation, tax treatment and terms are unchanged. New customer
contact details are not added to the existing recovery schema.

Existing invoice editing now selects only its consumed header fields, original
billing lines and small linked labels. Missing/error/malformed billing-line reads
or failed category reads show a reload state instead of a saveable partial form.
Full detail, payment and history readers elsewhere are unchanged.

Creation/edit actions, receipt transports, request IDs, revision checks,
save-and-close, return context, balances, payments, checkout locks, terms, RLS,
grants, SQL and draft schema are unchanged. Existing financial commands still
check access and locks transactionally. No migration, dependency update, new
environment variable or secret is required.

## Verification

- **3,240 regression checks** passed under Node 22.23.4, plus explicit typecheck,
  local production build, protected staging build, offline schema and whitespace
  checks. The rendered-page fault test confirms incomplete reads mount no form.
- Native local/staging tests passed page 56 across 1,105 customers, locations and
  eligible work orders, exact individual/organization prefills, billing-address
  search, foreign-party/noninvoiceable-job denial and editor-field equality
  against authoritative caller-RLS records.
- Existing native invoice transaction tests passed locally and in staging:
  confirmed save, stale revision, lost receipt/explicit retry, pending payment,
  open/processing checkout and access revoked after preflight.
- Actual local/staging browsers passed paging, lookup failure/retry, off-page
  recovery with a delayed label response, keyboard creation/editing, work-order
  prefills, walk-in creation and Firewood with stacking. Totals, line IDs, links
  and payments were checked. The first walk-in test correctly hit existing
  duplicate-contact protection because its phone matched a synthetic customer;
  the corrected test uses a unique synthetic email and retains earlier history.
- Anonymous/crew and disabled owner sessions were denied; a live role grant was
  recognized. Separate read-only quote browser checks preserved pinned selections
  and original quote job eligibility when sharing the control.
- Desktop 1,280 px and mobile 390 px local/staging screenshots were inspected.
  CRM styling and keyboard behavior are preserved. No overflow, uncaught browser
  error or unexpected external app request occurred. The bounded Impeccable check
  reported no findings.
- Staging remains at 129 migrations with unchanged public RLS/function
  fingerprints and automatic sending OFF. Full baseline snapshots paginate;
  every pre-existing baseline record is compared by exact ID after testing.
- Test accounts are disabled/banned and lose old-token access. Unused owned
  directories and the new walk-in's customer/property are archived without
  deleting records; synthetic invoices and transaction history remain. Only the
  owned local app/database are stopped, retaining volumes and unrelated stacks.
  The 78 pending Firewood-worktree files and security-worktree commit are preserved.
- Protected unpublished staging drafts have one server function, no schedules or
  email/payment-provider credentials and no private values embedded in public,
  edge or function artifacts. Published releases, production and scanner remain
  unchanged. The new implementation remains uncommitted and unpushed.

Private evidence, before/after measurements and screenshots are outside Git at
`/Users/noelsierra/Documents/Codex/2026-10-26/invoice-lookup-loading`.

## Next focused priority

Measure change-order list/creation loading. Its page currently loads form options
even when only browsing records. Apply conditional/scoped/paged reads where the
measurement warrants them, preserving atomic change-order commands. Other release,
policy, mailbox/device/accessibility and security work retain their existing roadmap.
