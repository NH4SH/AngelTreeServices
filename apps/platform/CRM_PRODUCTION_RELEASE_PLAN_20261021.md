# Coordinated CRM release — October 21, 2026

The owner authorized pushing and deploying the remaining CRM work. Authorization is retained; this document records the actual prerequisites and sequence. No production deployment or schema/configuration write has been performed in this session.

## Observed current state

Read-only production Supabase CRM: 65 recorded migrations (exact historical baseline), no complete principal RPC or durable outbox, 110 public tables, zero pending payment rows, two creating/open/processing checkout records and one pending/processing communication. Counts do not prove that a customer is currently paying. Ledger comparison MD5 a7c947b9f70a9af2f9a7bbd14982a30e is metadata only, not an authenticity signature.

Dedicated staging now runs deploy `6ad93840ccebc7a5679b1b28`, from main commit `616ad8209b43956c55a31667818d1672d01c88ee` plus hashed conflict/download source overlays and the verified staging-only gate-order build fix. It retains 101 migrations and synthetic workflow/file fixtures only. All six synthetic users are disabled with zero Auth sessions; communication/recurring automation remains OFF. Only the document-library scan switch is ON; the other six remain OFF. The two original conflict/download blockers are resolved; see CONFLICT_AND_PRIVATE_DOWNLOAD_VERIFICATION.md for current evidence and the broader financial regression limitation. Production remains the CSS-only hotfix; the current app cannot run against production 65. The latest instruction explicitly keeps production unchanged.

The latest snapshot read and email changes preserve source/runtime history and contain no new migration. The 36 reviewed pending repository migrations below still need a paired production upgrade. Do not repair history, replay the first 65, drop the extra profile column, normalize provider grants opportunistically or run blind linked db push.

## Remaining release blockers

1. The home Mac passes local smoke, maintenance, VM/login-agent startup and native security/capacity tests. Its approved staging-only address reservation, TCP 443 route and Netlify DNS record are now active; 13 local checks, 11 real external scanner checks and 10 hosted perimeter scenarios pass (STAGING_SCANNER_INGRESS_VERIFICATION.md). Trusted TLS and public denial checks are verified. One external maximum-size concurrent scan took 10.357 seconds against the unchanged 12-second deadline; production capacity headroom, monitoring/renewal response and physical host availability remain open. Existing preflight still requires the complete environment/key/Auth/access/backup/operator evidence; do not promote full-CRM readiness flags from probe success.
2. Conflict and private-file staging acceptance now passes: migration 101 returns prompt PT409/HTTP 409 for stale quotes/invoices and preserves one-winner scheduling; current-version private bytes, full 25 MiB downloads, actual object replacement, browser download, revocation and cache isolation pass. Full regression is 2,184 checks, with 295 database assertions. The older ordered-payments live suite still needs a fresh isolated fixture run: accumulated test recipients exceed its existing 100-notification batch, so the completion guard correctly refuses unfinished work. Do not claim full financial integration acceptance or weaken that guard. The smaller dashboard invoice-queue count issue is unchanged.
3. Production-compatible paired database/Storage/source recovery and the maintenance cutover have not been executed/verified. Preserve the two open checkout records and pending customer message; do not cancel payments, resend mail or clear queues merely to obtain an empty result.
4. The private-photo cleanup discrepancy is resolved locally (PRIVATE_PHOTO_CLEANUP_VERIFICATION.md). A held file remains private when authenticated deletion returns no receipt; the application now reports cleanup as unconfirmed. Confirmed clean-file deletion preserves existing attachments. Real local Storage/Auth/audit tests and the full CRM suite pass without RLS or privileged-cleanup changes. Review held-orphan retention/recovery deliberately; no purge service or policy was introduced. Hosted private-file chunk and browser-download acceptance now passes; the separate retention/recovery decision remains unchanged.

## Execution sequence once prerequisites are available

- Preserve the verified staging scanner endpoint and its separate credential (STAGING_SCANNER_INGRESS_VERIFICATION.md). Complete production capacity headroom, monitoring/renewal response and physical home-host/WAN recovery evidence before any production scanner activation. Continue with the actual protected CRM staging workflows below using synthetic files only.
- Preserve the existing isolated staging variables, no-send Auth guard, OFF automation, disabled test accounts and retained synthetic fixture/history state. Retain the verified gate-order plugin and explicit `.netlify/static` directory for a separate CLI upload. Do not build production public settings from locally masked Netlify secret values; the previous hotfix incident documents this failure mode.
- Preserve the verified PT409 migration/client mappings and X-ATS-File-Version chunk protocol. The exact staging101 maintenance verifier is `scripts/release/verify-staging-business-conflicts.mjs`; historical 93–100 profiles are not current schema acceptance. Re-run the broader financial suite in fresh isolated fixtures and cover recovery across notification batches. Preserve the passing hosted functionality/perimeter/browser evidence.
- Confirm paired production recovery, pin the exact migration/application artifact hashes and arrange a brief maintenance cutover. Quiesce old-app writes/scheduled workers while preserving webhook retry and request identities; the new financial boundaries reject old direct-write paths.
- Recheck exact production preimage/history/grants and live pending-record ownership. Apply only the 36 pinned pending versions in the reviewed order using the verified upgrade procedure. Keep historical source/default differences explicit. Do not activate scanning, retention/purge, recurring generation or new communications as a side effect.
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
- `20261021215535_business_conflict_responses.sql`

Existing detail: MIGRATION_RECONCILIATION_REPORT.md, STAGING_REQUEST_STATUS_RECONCILIATION.md, STAGING_RUNTIME_ACCESS_ACCEPTANCE.md, MACBOOK_SCANNER_SETUP.md and SCANNER_HOSTING_AND_RESTORE.md. New focused results: REMINDER_PAYMENT_SNAPSHOTS.md, PRIVATE_PHOTO_CLEANUP_VERIFICATION.md and HOME_SCANNER_ACCEPTANCE_20261021.md. Hosted follow-through: STAGING_HOSTED_PERIMETER_ACCEPTANCE.md. Private release notes/evidence: /Users/noelsierra/Documents/Codex/2026-10-21/crm-production-release/.

Current focused evidence: CONFLICT_AND_PRIVATE_DOWNLOAD_VERIFICATION.md and staging/CONFLICT_PRIVATE_DOWNLOAD_VERIFICATION_20261021.json. Neither this report nor a passing staging check authorizes production changes.
