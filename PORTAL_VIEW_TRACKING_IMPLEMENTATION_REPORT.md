# Portal View Tracking Implementation Report

## Summary

Angel Tree Services can now track approximate meaningful customer portal sessions for quotes and invoices. Tracking is operational CRM telemetry, not a read receipt.

> A portal view confirms that the page became visible in a browser with JavaScript enabled. It does not prove that the customer read or understood the entire document.

Nothing in this implementation deploys or applies the production migration automatically.

## Migration

- `supabase/migrations/20260718171008_portal_view_tracking.sql`

The migration adds:

- `first_viewed_at`, `last_viewed_at`, and `view_count` to `quotes`
- `first_viewed_at`, `last_viewed_at`, and `view_count` to `invoices`
- the RLS-protected `portal_view_events` table
- `public.record_portal_view(...)`, an atomic service-role-only recorder

`portal_view_events.organization_id` is nullable because `organizations` are customer contracting parties in this single-tenant CRM. Individual-customer documents instead retain `customer_id`. The table requires exactly one of those contracting-party references.

## Definition Of A View

`view_count` means:

> Approximate meaningful portal viewing sessions, excluding repeated refreshes within the 30-minute deduplication window.

A browser attempts to record a view only after:

1. JavaScript has loaded.
2. The document is visible.
3. The document remains visible for two seconds.

The tracker uses a random first-party session identifier shared across tabs for up to 30 minutes. Returning after that window creates a new session identifier. The database also serializes updates by locking the target quote or invoice, so concurrent tabs cannot race the counters.

## API And Token Validation

- Endpoint: `POST /api/portal/views`
- Client component: `apps/platform/src/components/portal-view-tracker.tsx`

The browser sends only document type, raw portal token, and the random session ID. The endpoint:

- accepts same-origin JSON requests only
- limits payload size and request frequency
- validates token and session formats
- hashes the token before database lookup
- derives the document and contracting party from the active token
- rejects malformed, expired, revoked, or mismatched links
- returns only `ok` and whether a new event was recorded

The service-role key remains server-only. The portal still renders normally if tracking fails.

## Atomic Updates

`public.record_portal_view(...)` performs token validation, deduplication, event insertion, summary updates, and activity logging in one database transaction.

For a non-duplicate view it:

- sets `first_viewed_at` only when null
- updates `last_viewed_at`
- increments `view_count`
- inserts one `portal_view_events` row
- inserts one `activity_log` row

Immediate duplicates return successfully without modifying counters or creating activity.

## Activity Log

The first meaningful session records:

- `customer_viewed_quote`
- `customer_viewed_invoice`

Later meaningful sessions record:

- `customer_returned_to_quote`
- `customer_returned_to_invoice`

Metadata contains only document number, count, and timestamp. No email or text notifications are sent. The existing organization activity view can surface these entries for organization-owned documents.

## RLS And Permissions

- RLS is enabled on `portal_view_events`.
- `anon` has no read or write privileges.
- `authenticated` has no insert, update, or delete privilege.
- Staff reads pass through the existing `app_private.has_staff_role()` policy.
- Only `service_role` can execute `record_portal_view`.
- The endpoint never accepts a document ID, customer ID, or organization ID from the browser.

The platform currently has one internal staff tenant. Customer `organizations` are contracting parties, not staff tenants, so there is no second staff organization boundary to model in this pass.

## Privacy Decisions

Stored metadata is limited to:

- random session ID
- document type and ID
- contracting-party reference
- timestamp
- coarse browser family
- referrer hostname

The system does not store full IP addresses, raw user-agent strings, raw portal tokens, third-party analytics identifiers, or browsing history outside these portal documents. Request IPs are transformed into short-lived in-memory rate-limit bucket hashes and are not logged or persisted.

## Admin UI

Quote and invoice list rows now show a compact neutral status:

- `Not viewed`
- `Viewed just now`
- `Viewed 2 hours ago`
- `Viewed yesterday`

Quote and invoice detail pages now include Customer activity with:

- first viewed date and time
- last viewed date and time
- approximate meaningful session count
- a reminder that the view may not identify the specific person

Customer-facing quote and invoice document layouts were not changed.

## Validation Results

Completed locally:

- full `supabase db reset` migration chain
- `supabase db lint --local`: no schema errors
- first quote view: count became 1 and first-view activity was created
- immediate quote repeat: no event, counter, or activity duplication
- quote return after 31 minutes: count became 2 and return activity was created
- first invoice view: count became 1 and first-view activity was created
- RLS enabled on `portal_view_events`
- anonymous table select/insert grants absent
- authenticated insert grant absent
- authenticated RPC execute grant absent
- service-role RPC execute grant present
- built Next.js endpoint returned `recorded: true` for the first valid request
- the same HTTP request returned `recorded: false` on immediate retry
- endpoint integration left one event and a quote view count of 1
- TypeScript typecheck
- Next.js production build (44 generated routes)
- `git diff --check`

No automated unit-test script or lint script is currently defined in `apps/platform/package.json`.

## Manual Verification Checklist

1. Apply `20260718171008_portal_view_tracking.sql` to a non-production environment.
2. Generate an active quote customer link.
3. Confirm the admin quote initially shows `Not viewed`.
4. Open the link signed out and keep the tab visible for at least two seconds.
5. Refresh the admin quote and confirm first/last timestamps and count 1.
6. Refresh or open another tab within 30 minutes and confirm the count remains 1.
7. Return after 30 minutes and confirm the count increments.
8. Repeat steps 2-7 for an invoice.
9. Revoke each link and confirm subsequent tracking requests create no event.
10. Confirm quote approval, invoice payment, print, PDF, and portal actions still work.
11. Confirm another authenticated non-staff account cannot read `portal_view_events`.

## Known Limitations

- JavaScript-disabled visits are not tracked.
- A sophisticated scanner that executes JavaScript, displays the page, and waits two seconds may still count.
- In-memory HTTP rate limiting is per running server instance; database deduplication remains authoritative.
- A view cannot prove which person used a shared link or how much content they read.
- Existing legacy `invoice_portal_tokens.viewed_at` values are not backfilled because they may include server-render/scanner requests.
- Staff notifications are intentionally not enabled because no existing first-view preference cleanly covers this event.

## Rollback

Before rollback, export `portal_view_events` if its operational history must be retained. Then, in a reviewed migration:

1. Revoke and drop `public.record_portal_view(text, text, text, text, text)`.
2. Drop `public.portal_view_events`.
3. Drop `first_viewed_at`, `last_viewed_at`, and `view_count` from quotes and invoices only after confirming no dependent reporting uses them.
4. Remove the API route, client tracker, admin components, type fields, and related styles.

Do not edit production migration history after application.

## Files Changed

- `supabase/migrations/20260718171008_portal_view_tracking.sql`
- `apps/platform/src/app/api/portal/views/route.ts`
- `apps/platform/src/components/portal-view-tracker.tsx`
- `apps/platform/src/components/portal-engagement.tsx`
- `apps/platform/src/components/invoice-portal-link-panel.tsx`
- `apps/platform/src/app/portal/quote/[token]/page.tsx`
- `apps/platform/src/app/portal/invoice/[token]/page.tsx`
- `apps/platform/src/lib/data/portal-invoice.ts`
- `apps/platform/src/lib/types/database.ts`
- `apps/platform/src/app/admin/quotes/page.tsx`
- `apps/platform/src/app/admin/quotes/[quoteId]/page.tsx`
- `apps/platform/src/app/admin/invoices/page.tsx`
- `apps/platform/src/app/admin/invoices/[invoiceId]/page.tsx`
- `apps/platform/src/styles/globals.css`
- `PORTAL_VIEW_TRACKING_IMPLEMENTATION_REPORT.md`
