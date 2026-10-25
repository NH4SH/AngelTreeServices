---
version: 1
slug: "record-email-history"
primary_target: "apps/platform/src/components/record-email-history-browser.tsx"
related_targets: ["apps/platform/src/components/record-delivery-requests-browser.tsx", "apps/platform/src/app/admin/communications/email/[recordType]/[recordId]/page.tsx", "apps/platform/src/app/admin/communications/email/[recordType]/[recordId]/loading.tsx", "apps/platform/src/lib/email/record-delivery-requests.ts", "apps/platform/src/lib/email/record-history-scope.ts", "apps/platform/src/app/admin/quotes/[quoteId]/page.tsx", "apps/platform/src/app/admin/invoices/[invoiceId]/page.tsx", "apps/platform/src/app/admin/change-orders/[changeOrderId]/page.tsx", "apps/platform/src/styles/globals.css"]
---

# Recorded document-email history and delivery requests

Mode: Operate/Read. Internal staff review recorded email outcomes and prepared or
unresolved delivery requests for one proposal, invoice, or change order. Ordinary
code-led extension of the existing communications and record views. The user
confirmed All recorded outcomes as the default on October 24, 2026; Needs attention
is secondary. On October 25 the user confirmed All recorded emails remains the
default, with a separate Prepared & unresolved view and read-only review links.

## Direction contract

THESIS: Make the complete recorded history and separate prepared or unresolved
requests available from their record while keeping the existing recent previews
and workflow controls in place.
OWN-WORLD: Inherit the green/neutral CRM shell, system sans-serif typography,
existing filter links, secondary actions, pagination, flat communication rows,
status indicators, focus treatment, and native disclosures. RecordReminderBrowser
is the composition precedent. The dark dashboard contract excludes this surface.
STORY: Identify the record, scan recorded outcomes or prepared, in-flight, unknown
and repair-pending requests, page through exact scoped results, expand Delivery
details or Request details, and open existing Delivery review when needed.
FIRST VIEWPORT: Back to record, Email history and record identity, the short
acceptance-versus-delivery explanation for recorded emails or request explanation
for Prepared & unresolved, All recorded emails / Needs attention / Prepared &
unresolved, then a results panel with Refresh, exact count, paging, subjects and
outcomes.
FORM: Precisely scoped ordinary extension; no concept seed, approved comp or
quality card. Subjects, recipients, dates and references wrap. Native Delivery
details and Request details retain their disclosure markers; narrow-screen
interactive links and summaries use the existing touch-target size. No added
imagery, metrics, forms or mutation controls.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

For this ordinary extension, the finish requirement preserves existing system
documents; this surface brief records the local decisions. No shipping rasters.

## Behavior and boundaries

- Browse 30 recorded `email_events` rows per page, newest first, with exact counts
  from the same caller/RLS scope. View and page links preserve the record scope.
- Show acceptance, delivery reports, uncertain outcomes and missing send dates
  accurately. Neither provider acceptance nor delivery proves customer reading.
- Keep source-check failure, missing record, history-read error, loading and the
  two empty views distinct; unavailable data must not become an empty success.
- Keep the recorded-history footer explaining that prepared or unresolved requests
  may be absent, now linking to this record's separate Prepared & unresolved view.
  Each linked request opens the existing Delivery review destination. Opening or
  paging either view sends no email.
- Proposal and invoice entry links follow their recent email previews. Change-order
  history follows Workflow and Customer link. Preserve all previous controls.
- Preserve existing record back destinations. Do not expose raw provider errors,
  message bodies or portal bodies, or add prepare, send, retry or finance actions.

## Prepared & unresolved extension

- Browse 30 requests per page, newest preparation first with stable ID ties and
  exact counts from the same scoped read. Switching filters resets to page 1;
  Refresh and Previous/Next retain the record and selected view. Request totals
  remain separate from recorded-email totals: a request can also have a recorded
  outcome.
- Include prepared, dispatching and unknown attempts, pending follow-up updates,
  and unresolved delivery or record-repair work. The source scope is the exact
  invoice/change-order ID or any matching proposal in a multi-proposal request.
  Source access and effective internal-staff authorization remain enforced through
  the caller-bound metadata reader; no global client-side filtering or privileged
  fallback is introduced.
- Distinguish Prepared — not sent (zero recorded attempts), Prepared for another
  attempt, Sending — outcome pending, Delivery outcome uncertain, and No confirmed
  send. Unknown and in-flight attempts never claim that an email was definitely
  unsent. Follow-up pending, changed-source and accepted-but-repair-pending helpers
  explain why review is still needed.
- Rows show subject, primary recipient, outcome and preparation time. Native Request
  details reveals attempt count, available attempt/acceptance times and provider
  reference. Preserve the existing record previews, recorded-history behavior,
  entry-link placement and workflow ordering.
- Keep a real request-read error separate from a verified empty result. The empty
  view points back to All recorded emails; the footer explains overlapping stores
  and leaves review actions and their safety checks in Delivery review.
- The new view contains read-only links and disclosures. Do not add send, retry,
  cancellation, repair or payment forms, or expose raw payload, context, tokens,
  internal problem codes or provider response bodies. No new visual system,
  imagery, shared token or component variant is required.

## Finish evidence

Compared the finished component, routes, entry-link diffs and scoped CSS with
RecordReminderBrowser, ListPagination, shared communications rows and effective
CRM tokens. Checked the eight final captures in
`.impeccable/review/record-document-email-browsing-20261024/`: desktop, mobile,
tablet, empty, footer, change-order-entry, change-order-context and error.
The finish-review verdict scored the two listed fixes resolved and said ship at
that scope. Existing PRODUCT.md, DESIGN.md files and token sidecars are preserved.

### October 25 prepared/unresolved extension

Compared RecordDeliveryRequestsBrowser and the extended RecordEmailHistoryBrowser,
the shared email route, record-delivery-requests reader and record-history-scope
links with RecordReminderBrowser, ListPagination and the effective CRM rules in
globals.css. The extension reuses the incumbent green/neutral palette, typography,
filter links, flat status rows, spacing, focus treatment, wrapping and 44px mobile
targets. The /admin dark dashboard DESIGN.md explicitly excludes this surface.

Checked all eight synthetic local captures in
`.impeccable/review/record-delivery-visibility-20261025/`: `desktop.png` (1280px),
`mobile.png` (390px), `tablet.png` (768px), `empty.png`, `error.png`,
`change-order.png`, `mobile-details.png` and `tablet-details.png`. The details
captures intentionally show the scrolled, expanded disclosure state, including
visible keyboard focus and long provider-reference wrapping. Supplied rendered
validation covered all three record scopes, keyboard pagination/disclosure,
exact back/review links, default-history return and no horizontal overflow at
1280/768/390. Error evidence came from an actual denied local read; it shows an
alert without an empty-success or count claim.

The finish reviewer accepted every supplied capture and returned full disposition
`ship`, with `material_fixes: none`. The mechanical detector result was `[]` at
`/Users/noelsierra/Documents/Codex/2026-10-25/record-delivery-visibility/design-detect.json`.
Validation used local/staging synthetic data; no deployment or production work is
part of this extension. No shipping rasters. Existing PRODUCT.md, DESIGN.md files,
token sidecars and config remain preserved. There is no new shared-system gap;
the pre-existing absence of an applicable shared CRM DESIGN.md remains reported,
with the incumbent code supplying this surface's visual authority.
