# Atomic scheduling (PR08)

The normalized calendar continues to use `schedule_events`,
`schedule_event_assignments` and durable employee IDs. Legacy appointments,
operational history, employment/onboarding state and financial commands are
retained. No production rollout is authorized by this implementation.

## Commands and concurrency

- `save_schedule_event` creates or edits one visit, changes its status, or moves
  only its time. Edits require the `edit_revision` displayed by that editor.
  Time/status changes retain assignment rows and notes. Details changes replace
  the crew inside the same transaction as the event, job summary and audit.
- The versioned `save_job_employee_work_sessions` requires the complete displayed
  active-workday snapshot (`id`, `edit_revision`). Added, changed or cancelled
  workdays invalidate it. Replacement cancels omitted active visits; it does not
  delete them or reactivate cancelled history. The acknowledgement returns the
  actual saved IDs, sessions and snapshot for subsequent edits.
- Generic event creation keeps a browser-generated request UUID through errors.
  Repeating that UUID acknowledges the original visit without repeating writes,
  crew replacement or history. A different actor cannot acknowledge that ID.
  A missing/uncertain acknowledgement asks the user to review the calendar.
- Jobs lock before events; parent jobs and workday events lock in UUID order.
  A relink discovered after waiting fails rather than reversing that order.
  Selected employee rows lock in UUID order. Shared-crew overlap checks run after
  those locks, including when different jobs are being saved concurrently.

## Authorization and eligibility

All public commands require an actual authenticated actor with current effective
platform access and the existing per-event-type schedule permission. Owner,
admin, payroll administrator and estimator boundaries are retained. Direct
authenticated normalized-event/assignment writes and the old unchecked
three-argument work-session RPCs cannot bypass the commands. Service maintenance
and reviewed definer commands remain available. Private helpers have no API
execute grants; every new definer function has an empty search path.

Employee IDs and linked profile IDs normalize to the durable employee record.
Employees without CRM login access can be scheduled. Missing, archived,
separated, inactive or leave employees cannot receive new active assignments,
including forged requests. Existing inactive historical assignments can remain
on closed visits. Employment status is independent of onboarding checklist
progress. Applicant/onboarding and warning-only qualification notices remain
advisory. Missing required qualifications need an owner/admin reason; a payroll
administrator or estimator cannot override them. Expired/archived credentials
do not satisfy requirements.

Overlaps include active normalized visits and unmigrated legacy appointments;
cancelled/completed visits do not block a new booking. An open-ended visit uses
the existing one-hour estimate window for conflict checks. Overlap confirmation
requires both explicit confirmation and an owner/admin reason. Error messages
identify the employee and local date. The ordinary forms retain drafts on errors
and keep versions fixed to those displayed, rather than fetching newer versions
before saving. Browser forms submit explicitly to avoid React resetting a failed
uncontrolled draft. Existing CRM styles and keyboard controls are reused.

## Related workflows

Website-lead and customer/organization estimate commands keep their existing
contact/property workflow and save the selected durable employee in the same
transaction. The extra delete/reinsert HTTP calls are removed. Website-lead
edits require the displayed version. A repeated customer-estimate request key
directs the user to the already-created calendar visit instead of overwriting it.
Equipment maintenance creates its calendar entry through `save_schedule_event`.

The existing office completion flow calls `complete_completed_job_schedule` only
after its job is already completed. This command preserves the old per-type
permission boundary, marks linked active visits complete, and leaves job state,
money and completion intent unchanged. PR04's existing invoice-generation
transaction continues to complete visits under its reviewed definer boundary.
PR09 still owns the explicit-completion product decision and transaction.

## Reminders, Calendar and time

Moving, relinking or closing a visit cancels its old **pending** reminders inside
the same transaction. Processing/sent messages remain intact; delivery leasing,
deduplication and customer notification timing remain PR14 work. The existing
post-save reminder synchronization is retained.

The existing Calendar outbox triggers remain. Commands additionally require a
durable final enqueue when a connection is enabled: an enqueue failure rolls
back the schedule. No provider call occurs in the save transaction. The existing
claim/ack/failure revision fence preserves newer edits while an older Calendar
task is processing. Actual Google delivery was not exercised without a disposable
provider account.

Workday dates use the configured business timezone (currently America/New_York).
Nonexistent spring-forward local times fail rather than shifting the visit.
Existing all-day normalization is retained. No timezone setting is changed.

## Verification and rollout

`tests/atomic-scheduling.integration.test.mjs` runs against the explicitly named
loopback disposable Supabase stack with real Auth, RLS, independent transactions,
failure injection and Calendar claim/ack behavior. See `tests/README.md`.

The additive migration is `20261016080420_atomic_scheduling.sql`. Replay and lint
the complete chain before a future coordinated rollout; do not edit old
migrations or push the database merely to reconcile history. The new clients
and migration must ship together. Existing legacy appointment edit handlers and
the equipment-maintenance record transaction are retained; this change does not
rewrite either surrounding workflow. No environment or provider configuration
changes are required.
