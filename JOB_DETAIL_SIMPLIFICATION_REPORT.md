# Job Detail Simplification Report

## Previous UX problems

The prior page gave scheduling, status controls, communication, billing, change orders, six photo categories, crew details, equipment, materials, costs, printable documents, message drafts, marketing, and duplication nearly equal visual weight. It displayed three appointment forms at once, buried invoice creation behind completion/closeout states, and could leave staff at `in_progress` without a useful next action.

## Corrected workflow

The intended business workflow is now prominent:

**Approved quote -> Job -> Invoice**

Scheduling controls the visible operational state. Invoice records control the billing state. Creating a private draft invoice does not mark physical work complete, mark the job invoiced, send an email, collect payment, or alter the job's operational status. Sending and payment remain separate authoritative invoice actions.

## New information hierarchy

The admin job-detail page is now an operational command center instead of a long collection of equally weighted panels. The default view keeps the job status, contracting party, location, schedule, crew, approved quote, invoice, scope, additions, appointments, and photos visible. Communication, operations, private financials, printing, drafts, marketing, and duplication remain available in collapsed sections.

The quote-first workflow remains intact. Quote approval continues to create or reuse one linked work order. Staff can now create a draft invoice from accepted, scheduled, in-progress, and completion states without completing a checklist or changing the job's physical status. Existing invoices are reused and approved unbilled change orders are attached through the existing idempotent database function.

## Status behavior

The UI derives an operational display status defensively:

- **To be scheduled**: accepted work without an active future job appointment.
- **Scheduled**: the latest active job/maintenance appointment is in the future.
- **In progress**: the job is in progress or the active appointment start has been reached.
- **Work complete**: completed, completed-pending-review, or ready-to-invoice work.
- **Needs attention**: returned for correction.
- **Invoiced**: a non-void invoice is sent, partially paid, or overdue.
- **Paid**: the invoice or legacy job status is paid.

`supabase/migrations/20260718210235_simplify_job_workflow.sql` adds a service-role-only, security-invoker function that advances due accepted/scheduled jobs to in progress. It uses the most recently updated active job/maintenance appointment as authoritative, ignores billed work, records one activity event, and is idempotent.

## Optional closeout

The crew closeout/checklist system remains in the codebase for future use but is disabled by default. It appears only when both `CREW_JOB_CLOSEOUT_ENABLED=true` and `CREW_JOB_PROGRESS_CHECKLIST_ENABLED=true`. No closeout control appears in the simplified admin job page.

Closeout, progress items, photos, equipment return, material usage, direct costs, and crew notes are optional operational records. With the default flags they do not appear as warnings, gates, or invoice prerequisites.

## Files changed

- `apps/platform/src/app/admin/jobs/[jobId]/page.tsx`: simplified command-center layout and defensive status/actions.
- `apps/platform/src/app/admin/invoices/actions.ts`: aligned manual invoice creation with pre-completion draft behavior.
- `apps/platform/src/app/crew/jobs/[jobId]/page.tsx`: default-off closeout/checklist gate.
- `apps/platform/src/components/job-photo-gallery.tsx`: one compact empty photo state.
- `apps/platform/src/components/workflow-actions.tsx`: useful completion and draft-invoice actions; no disabled no-action control.
- `apps/platform/src/lib/actions/workflow.ts`: direct draft creation, status preservation, invoice reuse, and approved additions.
- `apps/platform/src/lib/data/jobs.ts`, `apps/platform/src/lib/types/database.ts`: assigned crew/appointment relation data.
- `apps/platform/src/lib/jobs/operational-status.ts`: simplified status-display model.
- `apps/platform/src/app/api/internal/jobs/advance-scheduled/route.ts`: authenticated worker endpoint.
- `apps/platform/netlify/functions/advance-scheduled-jobs.ts`: five-minute scheduled invocation.
- `apps/platform/src/styles/globals.css`: responsive command-center presentation.
- `.env.example`, `apps/platform/DEPLOYMENT_CHECKLIST.md`, and `apps/platform/PRODUCTION_TESTING.md`: flags, rollout, and regression checks.
- `supabase/migrations/20260718210235_simplify_job_workflow.sql`: idempotent scheduled transition function.

## Verification completed

- Full local Supabase migration reset: passed.
- Local database lint: passed with no errors.
- Worker permissions: `anon` and `authenticated` denied; `service_role` allowed.
- Worker edge cases: due work advanced once; repeat run was a no-op; future, cancelled, rescheduled, and billed work did not advance.
- Worker activity: exactly one automatic-start event for the advanced job.
- Draft invoice from To be scheduled: one draft created; accepted job status preserved.
- Draft invoice from Scheduled: one draft created; scheduled job status preserved.
- Draft invoice from In progress: one draft created; in-progress job status preserved.
- Existing invoice: job detail displayed **Open invoice** and the database retained one invoice.
- Approved quote line-item copy: quantity, multiline description, and $2,500 integer-cent total preserved in the draft.
- Responsive authenticated browser pass: desktop and 390px mobile rendered without console errors or horizontal page overflow.
- Platform typecheck and optimized production build: passed.

The final platform build and diff checks are recorded in the task completion report. Production migration application and deployment were intentionally not performed.

## Manual deployment checks

Follow the **Simplified job workflow regression** section in `apps/platform/PRODUCTION_TESTING.md`. In particular, verify quote approval reuse, draft invoice reuse, approved additions, schedule transitions, role visibility, and responsive layouts using controlled production records.

## Screenshots

No trustworthy before screenshot was captured before implementation, so this report does not fabricate one. Authenticated after screenshots were captured against a local production-mode build with a controlled scheduled job, approved quote, service location, and assigned crew:

- `output/playwright/job-detail-desktop.png`
- `output/playwright/job-detail-mobile.png`

## Remaining limitations

- The scheduled status transition depends on the reviewed migration, `COMMUNICATION_WORKER_SECRET`, and the Netlify scheduled function being deployed together.
- Existing historical jobs that already contain conflicting statuses are displayed defensively but are not rewritten by this change.
- Draft invoice reuse is enforced by the existing application workflow. The database currently has no unique one-invoice-per-job constraint, so direct database writes outside the application remain an administrative data-quality risk.

## Rollback

Roll back the platform application before removing `advance_scheduled_jobs_to_in_progress()`. The migration is additive and can remain while an application rollback is investigated. Keep production data and legacy job statuses intact; do not reverse status history or delete invoices created during normal operation. Restore the prior closeout flags only if that workflow was intentionally enabled before this release.
