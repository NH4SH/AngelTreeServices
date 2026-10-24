---
version: 1
slug: "record-email-history"
primary_target: "apps/platform/src/components/record-email-history-browser.tsx"
related_targets: ["apps/platform/src/app/admin/communications/email/[recordType]/[recordId]/page.tsx", "apps/platform/src/app/admin/communications/email/[recordType]/[recordId]/loading.tsx", "apps/platform/src/app/admin/quotes/[quoteId]/page.tsx", "apps/platform/src/app/admin/invoices/[invoiceId]/page.tsx", "apps/platform/src/app/admin/change-orders/[changeOrderId]/page.tsx", "apps/platform/src/styles/globals.css"]
---

# Recorded document-email history

Mode: Operate/Read. Internal staff review recorded email outcomes for one proposal,
invoice, or change order. Ordinary code-led extension of the existing communications
and record views. The user confirmed All recorded outcomes as the default on
October 24, 2026; Needs attention is secondary.

## Direction contract

THESIS: Make the complete recorded history available from its record while keeping
the existing recent previews and workflow controls in place.
OWN-WORLD: Inherit the green/neutral CRM shell, system sans-serif typography,
existing filter links, secondary actions, pagination, flat communication rows,
status indicators, focus treatment, and native disclosures. RecordReminderBrowser
is the composition precedent. The dark dashboard contract excludes this surface.
STORY: Identify the record, scan subjects and outcomes, page through recorded
entries, expand Delivery details, and open existing Delivery review when needed.
FIRST VIEWPORT: Back to record, Email history and record identity, the short
acceptance-versus-delivery explanation, All recorded emails / Needs attention,
then a results panel with Refresh, exact count, paging, subjects and outcomes.
FORM: Precisely scoped ordinary extension; no concept seed or approved comp.
Subjects, recipients, dates and references wrap. Native Delivery details retains
its disclosure marker; narrow-screen interactive links and summaries use the
existing touch-target size. No added imagery, metrics, forms or mutation controls.
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
- Keep the footer explaining that prepared or unresolved requests may be absent,
  with the existing Delivery review destination. Opening or paging sends no email.
- Proposal and invoice entry links follow their recent email previews. Change-order
  history follows Workflow and Customer link. Preserve all previous controls.
- Preserve existing record back destinations. Do not expose raw provider errors,
  message bodies or portal bodies, or add prepare, send, retry or finance actions.

## Finish evidence

Compared the finished component, routes, entry-link diffs and scoped CSS with
RecordReminderBrowser, ListPagination, shared communications rows and effective
CRM tokens. Checked the eight final captures in
`.impeccable/review/record-document-email-browsing-20261024/`: desktop, mobile,
tablet, empty, footer, change-order-entry, change-order-context and error.
The finish-review verdict scored the two listed fixes resolved and said ship at
that scope. Existing PRODUCT.md, DESIGN.md files and token sidecars are preserved.
