# CRM production release — October 21, 2026

Released successfully to **https://admin.angeltreeservices.org**.

- Application/source: `51e26460c2ee8d8f97403dae6d1386eafe642a7d` on `main`.
- Netlify production site: `6fe7a9ca-878e-4b7b-bb4a-966efdc4d1a0`; published deploy: `6ad947453cf44c4032c44ba7`.
- Existing production Supabase: `ddvlnixdugcbnrewktes`, upgraded from 65 to **101 exact recorded migrations**. Only the 36 verified pending versions were applied with native CLI migration push. No history repair, reset, seed import or replay of the first 65.
- Maintenance ran from 23:12:24 to 23:15:05 UTC (about 2 minutes 40 seconds). The temporary deployment returned HTTP 503 with Retry-After, including on webhook/API routes. The final release is a normal Netlify production-context build of main, with Git publishing resumed.

## What is now live

The dark dashboard with cash reporting and attention queues; simplified employee management and offboarding; the completed authorization, atomic quote/invoice/scheduling/completion and payment-recovery changes; customer payment/proposal clarity; reminder actions and complete balance snapshots; durable notification/source-event recovery, delivery review and reversible sender blocking; private-file access/download, upload-size and conflict-response fixes. Scanner integration code is present with production switches OFF.

The public website was already on its separate current release and was not redeployed. Staging remains on its verified release. Native source changes remain in Git; this was a CRM web/backend release, not an App Store submission.

## Verification and preservation

- Previously verified regression: **2,186 checks** and **111 isolated payment integration checks**, including 110 simulated notification recipients across two recovery attempts, one payment and no duplicate accepted emails. No real payment provider/customer message was used by those tests.
- Created private database/schema, Auth, Storage metadata, managed-schema and migration-ledger recovery files plus the pinned source archive. Authenticated encryption, recovery-byte equality and wrong-key rejection passed. Production contained **zero Storage objects**, so no source-object bytes needed copying.
- Restored production application schema and all dumped data into a separate local database with no networked app, Auth/email or payment services attached. Used the reviewed local managed-service bootstrap plus production Storage policies. Rehearsed all 36 exact migration sources. Kept the managed-version differences explicit; no production defaults were normalized.
- Compared original-column row fingerprints across **53 invoices, 63 invoice lines, 36 payments, 16 checkout sessions and 2 customer communications**. All matched before/after the rehearsal, the live upgrade and final release verification. The **two open checkout records and one pending communication** were retained, not cancelled, cleared or resent.
- All three Auth users and the existing extra profile column were preserved. Compared **4,872 production catalog objects** with the rehearsal: relation grants, RLS, policies, views and new routines match. Remaining differences are the documented local managed bootstrap, unchanged production triggers, old set_updated_at whitespace and PostgreSQL CHECK-expression rendering.
- Two production-context Netlify builds passed: held verification build, then the final published build from the same main commit. Existing production settings stayed in Netlify; masked API values were not used as real build values. No application credential was rotated or copied into source.
- Live health and login return HTTP 200; ten login assets load; five private page paths reject anonymous visitors. Anonymous payment reads are denied. Stripe's route is present; no charge/webhook replay or customer sending was performed for verification.
- Live owner-authorized dashboard aggregate read completes with company scope and all five expected totals. This used a read-only database authorization context, not a new Auth session.
- Invalid quote, invoice and change-order links show recovery help with no-store responses; the inactive organization portal requires login. The read-only mobile request-status endpoint rejects an unauthenticated POST.
- Security advisories match verified staging exactly: service-only tables without API policies, intentionally authorized SECURITY DEFINER entrypoints, and existing disabled leaked-password protection. This is not a claim of zero advisories. References: [RLS policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [function permissions](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

A preliminary backup dry run printed a temporary CLI database login credential into tool output. Subsequent diagnostics stayed private. The temporary role was refreshed and two successive same-role logins were verified to issue different passwords; the earlier value was replaced. No existing application credential was exposed or changed, and no credential is in Git.

## Deliberately inactive / follow-up

- **Production scanner activation is pending.** Library and all six attachment switches remain OFF; staging's credential was not reused. Production home-host capacity headroom, monitoring/TLS renewal response and host/WAN recovery review remain required. Existing production file access boundaries are preserved.
- **Automatic customer sending remains OFF**, exactly as before. The missing production COMMUNICATION_WORKER_SECRET was not silently generated to activate queued deliveries. Existing payment and email credentials/configuration were preserved; no reminder queue was drained. Review worker provisioning and supervised automation activation separately.
- Retention/purge and legacy-file activation were not introduced. Organization portal remains its existing inactive scaffold. The previously noted finished-work queue count issue remains a separate small UX correction; cash totals are unaffected.
- Four anonymous Next redirects omit Cache-Control and include only generic framework redirect output; no private dashboard content was returned. Employee redirect and rendered customer-link pages have no-store headers. Track explicit no-store on framework redirects as a small follow-up; this release did not change that behavior.

Private backup keys, raw SQL/data and detailed operational logs stay outside Git under `/Users/noelsierra/Documents/Codex/2026-10-21/crm-production-cutover/`. Machine-readable non-secret receipt: `staging/PRODUCTION_RELEASE_VERIFICATION_20261021.json`. Existing staging and isolated-payment reports remain available for the underlying acceptance evidence.

## Applied migration chain

- `20261015040735_job_photo_category_parity.sql`
- `20261015042649_reliable_employee_offboarding.sql`
- `20261015050427_guard_service_recommendation_assignment.sql`
- `20261016002812_guarded_invoice_void.sql`
- `20261016010829_invoice_financial_write_boundary.sql`
- `20261016012251_enforce_invoice_financial_write_boundary.sql`
- `20261016020444_recoverable_stripe_webhook_receipts.sql`
- `20261016032012_ordered_payment_reconciliation.sql`
- `20261016040341_atomic_invoice_generation.sql`
- `20261016060143_atomic_quote_editing.sql`
- `20261016060503_enforce_quote_edit_boundary.sql`
- `20261016064442_atomic_quote_approval.sql`
- `20261016080420_atomic_scheduling.sql`
- `20261016130010_explicit_job_completion.sql`
- `20261016134622_checked_photo_upload_and_communication_outcomes.sql`
- `20261016144647_crew_field_job_pages.sql`
- `20261016162316_transactional_website_lead_intake.sql`
- `20261016165057_durable_outbound_delivery.sql`
- `20261016182241_owned_scheduling_handoffs.sql`
- `20261016192144_supervised_operations.sql`
- `20261016200200_trustworthy_report_reads.sql`
- `20261016210536_reversible_website_sender_blocks.sql`
- `20261016223056_measured_organization_location_lookup.sql`
- `20261016224352_private_document_scan_gate.sql`
- `20261016225410_measured_document_quote_lookup.sql`
- `20261016231215_remaining_attachment_scan_boundary.sql`
- `20261017000918_private_upload_transport.sql`
- `20261018004943_atomic_legacy_appointments.sql`
- `20261020051222_atomic_customer_quote_changes.sql`
- `20261020060328_atomic_customer_activity_notifications.sql`
- `20261020064543_durable_customer_source_events.sql`
- `20261021012859_invoice_payment_principal_snapshot.sql`
- `20261021022314_standalone_invoice_requests.sql`
- `20261021032121_quote_draft_requests.sql`
- `20261021060037_quote_request_status.sql`
- `20261021215535_business_conflict_responses.sql`
