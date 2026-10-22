# Appointment changes and cancellation notices

This extends the existing appointment/reminder safeguards and durable email sender. It does not create another mailer or change scheduling permissions. The feature is prepared locally, with its database changes and synthetic verification in staging. It is **off by default**. No application deployment or production change was performed for this batch.

## Customer and office behavior

- Communication defaults has one additional **Send appointment changes and cancellations** checkbox, controlled by the existing administrator authorization. The existing automated-sending master switch also applies.
- A future estimate or work visit gets an update when its time, end time, property or visit type changes. Cancelling that visit produces a cancellation notice; restoring a cancelled future visit produces a reinstatement update. Maintenance/emergency schedule visits use the work-visit wording.
- Changes settle for two minutes before the existing worker can send them. Rapid unsent edits retain the original customer-visible baseline and replace older pending notices. Reverting entirely to that baseline sends no unnecessary update.
- Changed notices show the previous and updated date/window, current property and office contact information. Cancellations identify the affected visit and explicitly preserve other visits. They do not say the entire job has been cancelled.
- Notes, crew assignments and ordinary scheduled/confirmed status changes do not produce customer notices. Calendar notes are never copied into the new templates. Initial bookings retain the existing confirmation workflow.
- Missing/invalid email creates a skipped notice with a plain-language explanation in the existing communications history. It does not invent a recipient or automatically send later when someone edits the contact. The office should contact the customer and review the visit.
- Enabling the setting does not backfill earlier changes. This batch covers edits to visits, rather than introducing notices for whole-work-order cancellation, deleted calendar records or internal follow-up/personal calendar items.

## Delivery and concurrency

The source update, private event and queue row commit in the same transaction. A failure cannot save the changed visit while silently losing its pending email intent. Existing schedule/legacy commands continue to own authorization, revision checks, qualifications, conflicts, job summaries and audit entries.

Each immutable notice event has one queue ID and one durable delivery identity. A timestamp alone is insufficient: end-only changes, a second edit at the same start time, and cancel/restore can all share that timestamp. The new types use the event ID for the business identity; older reminders and financial emails retain their existing identities and cooldown rules.

At preparation and dispatch, the sender verifies the latest event, actual visit, contracting party, current recipient, address, automation switches and source snapshot. An earlier uncertain/in-flight notice holds a later one for review; it is never blindly replayed or overtaken. The existing one-hour held-queue recheck does not consume a provider retry. Superseded notices remain in history, while accepted or uncertain delivery evidence is retained.

Canonical schedule visits suppress corresponding legacy appointment notices and duplicate polling confirmations. Nearby reminders wait while an update is pending/unresolved and during the existing interval after acceptance. A distinct genuine new revision can send within that interval; it is not a repeat reminder.

Existing reminder-invalidation predicates exclude only the two new notice types so they cannot cancel the intent just created by the same save. The private event ledger has RLS, no client policies and no table/function grants to application roles. The two public lookup RPCs require `service_role` and reject an authenticated user identity. Manual reminder forms retain their previous type allowlist and cannot forge a source-event notice.

Migration 104 preserves the pre-existing automation snapshot shape. Adding/toggling the new appointment setting therefore does not invalidate frozen invoice/payment/reminder requests or prevent their history recovery. New notices bind this setting through their own source check instead. Migration 105 also orders corrections behind original booking confirmations/reminders that were already in flight, including canonical legacy aliases and job-level work reminders.

## Implementation

| Files | Purpose |
| --- | --- |
| `supabase/migrations/20261022021634_appointment_change_notices.sql` | Private intents, atomic triggers, service lookups, duplicate coverage, admission and event identity |
| `supabase/migrations/20261022024624_appointment_notice_snapshot_compatibility.sql` | Preserve older frozen email snapshots |
| `supabase/migrations/20261022025337_appointment_notice_delivery_ordering.sql` | Prevent corrections overtaking original confirmations/reminders |
| `src/lib/communications/{queue,processor,templates}.ts` | Polling suppression, held/obsolete checks and customer wording through the existing sender |
| `src/components/communication-settings-form.tsx`, `src/lib/actions/communications.ts` | Existing-style administrator setting |
| `src/lib/types/database*.ts`, `scripts/schema/manifest.json` | Types regenerated from the fresh native replay; no hand-edited generated definitions |
| `tests/appointment-notices*.mjs`, `supabase/verification/appointment_notices.sql` | Processor/template, concurrency, native transaction and compatibility checks |
| `supabase/staging/deferred-migrations.json`, historic candidate test | Updated source inventory; historic release candidates retain their original ledger boundaries |

## Verification and release boundary

See `staging/APPOINTMENT_NOTICE_VERIFICATION_20261021.json` for the results. The dedicated loopback-only local project was replayed from all 105 migrations, without resetting the running CRM database. Local pipeline tests use actual SQL admission/reconciliation and an injected synthetic transport; no real provider credential or customer address is used.

Staging native dry runs admitted only the intended next migration at each step. All synthetic transaction fixtures were rolled back. Before/after fingerprints verify that existing payments, invoices, proposals, jobs, appointments, schedule events, queue rows, email history, Auth users, settings and unrelated routines were preserved. Staging automated sending and the new notice switch remain off. No staging application deployment was made, so the new hosted UI has not been exercised there; hosted verification in this batch is the database/transaction layer.

Security advisors added no warnings. The additional informational RLS-without-policy entry is the deliberately private, denied event ledger; see [Supabase's RLS advisory](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy). The existing authenticated-command and [Auth password-protection advisories](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) remain unchanged.

The latest independent website changes on `main` were incorporated without changing this CRM implementation. The new CRM batch remains local until requested to push. Production still needs migrations 103–105 and the application release, followed by a separate decision to enable the notice switch. This work does not authorize that release or activation.

## Operational limits

A provider call already in flight cannot be recalled. Its outcome is retained and a newer notice waits for certainty. Multiple genuinely changed visits in a multi-day job currently have separate notices, each clearly scoped to that visit; combining them into a single schedule-summary email would be separate work. Existing incomplete/uncertain deliveries still require the established Delivery review process rather than an automatic resend.
