# Coordinated CRM release — October21, 2026

The owner authorized pushing and deploying the remaining CRM work. Authorization is retained; this document records the actual prerequisites and sequence. No production deployment or schema/configuration write has been performed in this session.

## Observed current state

Read-only production Supabase CRM:65 recorded migrations (exact historical baseline), no complete principal RPC or durable outbox,110 public tables, zero pending payment rows, two creating/open/processing checkout records and one pending/processing communication. Counts do not prove that a customer is currently paying. Ledger comparison MD5 a7c947b9f70a9af2f9a7bbd14982a30e is metadata only, not an authenticity signature.

Read-only dedicated staging:100 migrations, complete principal RPC and request resolver present; zero Auth users, customers, invoices and Storage objects; communication automation and all scan switches OFF. The staging app remains unpublished. Existing main deployment remains the CSS-only production hotfix; main's new commands cannot run on production65.

The latest snapshot read and email changes preserve source/runtime history and contain no new migration. The35 already-reviewed pending repository migrations below still need a paired production upgrade. Do not repair history, replay the first65, drop the extra profile column, normalize provider grants opportunistically or run blind linked db push.

## Remaining release blockers

1. The home Mac is not yet a configured/reachable scanner. The owner requested the first-session guide and packet. Existing staging preflight requires a verified separate HTTPS scanner and explicit environment/key/Auth/access/backup/operator evidence. Do not mark these true to bypass the gate.
2. Hosted staging application/edge/CDN/key binding and synthetic workflow acceptance remain unverified. Local checks and staging database reconciliation do not substitute for a hosted runtime.
3. Production-compatible paired database/Storage/source recovery and the maintenance cutover have not been executed/verified. Preserve the two open checkout records and pending customer message; do not cancel payments, resend mail or clear queues merely to obtain an empty result.
4. Broader local PR10 verification found one private-photo cleanup discrepancy: a rejected metadata/audit transaction left one private object while the test expected zero. Payment/delivery cases passed. Resolve the actual cleanup/retention and error-message contract under current Storage policies, without weakening access or deleting evidence, before declaring a full release ready.

## Execution sequence once prerequisites are available

- Finish the owner-controlled scanner's local VM, rootless/runtime/resource, signature-update, clean/malware/failure and recovery tests, then verify authenticated publicly trusted staging HTTPS without exposing the Docker/engine endpoint. Use synthetic files only.
- Preserve the existing isolated staging variables, no-send Auth guard, OFF automation and empty target. Complete the strict current preflight, then build the exact source in the protected staging site using its own hosted environment. Do not build production public settings from locally masked Netlify secret values; the previous hotfix incident documents this failure mode.
- Verify the actual staged visitor gate, direct/framework/worker/private-file routes, current API key/project binding, caching/revocation and synthetic business workflows. Resolve the photo cleanup discrepancy and retest affected storage scenarios.
- Confirm paired production recovery, pin the exact migration/application artifact hashes and arrange a brief maintenance cutover. Quiesce old-app writes/scheduled workers while preserving webhook retry and request identities; the new financial boundaries reject old direct-write paths.
- Recheck exact production preimage/history/grants and live pending-record ownership. Apply only the35 pinned pending versions in the reviewed order using the verified upgrade procedure. Keep historical source/default differences explicit. Do not activate scanning, retention/purge, recurring generation or new communications as a side effect.
- Publish the matching verified CRM application on its existing Netlify site. Read-only health/login/private-route checks and owner acceptance follow; verify payment/webhook and customer-delivery recovery queues before resuming workers deliberately. The public website and native App Store releases are separate targets.

## Pending chain

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

Existing detail: MIGRATION_RECONCILIATION_REPORT.md, STAGING_REQUEST_STATUS_RECONCILIATION.md, STAGING_RUNTIME_ACCESS_ACCEPTANCE.md, MACBOOK_SCANNER_SETUP.md and SCANNER_HOSTING_AND_RESTORE.md. New focused result: REMINDER_PAYMENT_SNAPSHOTS.md. Private release notes/evidence: /Users/noelsierra/Documents/Codex/2026-10-21/crm-production-release/.
