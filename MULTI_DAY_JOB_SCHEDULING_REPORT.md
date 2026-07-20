# Multi-Day Job Scheduling Report

## Previous limitations

Job scheduling was split between legacy `appointments`, job-level
`scheduled_start_at` / `scheduled_end_at` fields, and the newer
`schedule_events` calendar. The database could store more than one event for a
job, but job detail and crew detail treated the job-level timestamps or one
appointment as the schedule. There was no atomic job-level editor for building,
reviewing, or replacing several workdays.

## Final data model

Job workdays now use one `schedule_events` row per daily work session with
`event_type = 'job'`. Each row retains its own start, end, status, note, and
many-to-many crew assignments while linking back to the same `jobs.id`.

`work_session_group_id` connects sessions saved together.
`source_appointment_id` records the preserved legacy appointment that produced
a migrated session. The existing job timestamps remain a compatibility summary
of the first start and last end; they are not used as one continuous multi-day
calendar block.

Indexes cover job/start lookup, active date ranges, and unique legacy source
mapping. Existing crew date lookup continues through the indexed
`schedule_event_assignments` table.

## Migration behavior

Migration: `20260720005626_multi_day_job_work_sessions.sql`

- Backfills each legacy job appointment into one work session without deleting
  or changing the appointment.
- Backfills a job-level scheduled range only when the job has no job event.
- Copies legacy assigned users into normalized event assignments.
- Suppresses a migrated legacy appointment from calendar output when its
  normalized event is present.
- Adds an atomic `save_job_work_sessions` RPC with owner/admin authorization,
  validation, fixed `search_path`, local business-timezone conversion, crew
  replacement, and cancel-in-place history for removed sessions.
- Extends crew RLS to normalized work-session assignees while synchronizing the
  first assignee to the legacy primary-crew field.
- Rebuilds the operational jobs view and server-side start transition around
  active job work sessions.

Rollback consideration: old appointment rows and job summary timestamps remain
available. Do not drop the new columns or function until production backfill,
calendar output, crew access, and reminder delivery have been verified.

## Scheduling workflows

Single day is the default for unscheduled jobs. Staff choose Today, Tomorrow,
Next Monday, or a native accessible date field; select a preset or exact start;
then choose 2, 4, 6, or 8 hours or an exact end time. New sessions default to
8:00 AM-4:00 PM.

Multiple days uses a direct month calendar. Staff click individual dates to
toggle them, Shift-click to add the dates between two choices, and can move
between months without losing the current draft. An optional range shortcut
remains available for sequential work, with weekends excluded by default.

Each chosen date immediately creates a chronological workday row with its own
hours and crew. Default hours apply only to newly selected dates unless staff
explicitly apply them to all rows. Full day, morning, afternoon, custom, and
copy-previous-day controls support different daily schedules. Row selection
enables bulk hours, crew assignment, and removal without changing unselected
days. Status and the internal scheduling note continue to apply to the whole
schedule.

The editor is collapsed behind Edit schedule on job detail. Clear schedule has
an explicit confirmation and cancels active session rows instead of deleting
business history.

## Calendar and crew behavior

Every workday renders as an individual admin calendar card linked to the same
job. Multi-day cards include `Day X of Y`, time, customer, location, and crew.
The dashboard and calendar suppress migrated legacy duplicates.

Crew job detail shows today's session, the next session when today is not
scheduled, and every remaining workday. Copy explicitly states that completing
one day does not complete the job. All assigned work-session crew can read the
job and its narrowly related customer, organization, location, visible notes,
and photos through RLS.

## Status and communications

Saving at least one session advances an accepted job to Scheduled. Clearing all
sessions returns a Scheduled job to Accepted. The service-role worker advances
a due job to In progress once; repeated runs are idempotent. Session end times
never mark the job complete.

Automated schedule communication queues only the first active work event per
job. Existing explicit communication actions produce one customer message with
the complete daily schedule instead of one email per workday. No message is
sent merely because sessions were saved.

## Validation and conflicts

Client controls use local `YYYY-MM-DD` values without serializing dates through
UTC. The RPC converts the selected local date and time with the configured
reporting timezone (falling back to `America/New_York`). Client and server
validation reject duplicate dates, malformed values, and end times at or before
the start time.

Before save, assigned-crew overlaps are collected with employee, date, time,
and conflicting event. Conflicts warn without silently blocking; an authorized
admin can explicitly override and save.

## Files changed for scheduling

- `apps/platform/src/app/admin/jobs/[jobId]/page.tsx`
- `apps/platform/src/app/admin/jobs/actions.ts`
- `apps/platform/src/app/admin/schedule/page.tsx`
- `apps/platform/src/app/crew/jobs/[jobId]/page.tsx`
- `apps/platform/src/components/job-schedule-manager.tsx`
- `apps/platform/src/lib/communications/processor.ts`
- `apps/platform/src/lib/communications/queue.ts`
- `apps/platform/src/lib/communications/templates.ts`
- `apps/platform/src/lib/data/crew-jobs.ts`
- `apps/platform/src/lib/data/jobs.ts`
- `apps/platform/src/lib/data/schedule.ts`
- `apps/platform/src/lib/jobs/operational-status.ts`
- `apps/platform/src/lib/types/database.ts`
- `apps/platform/src/styles/globals.css`
- `supabase/migrations/20260720005626_multi_day_job_work_sessions.sql`
- `supabase/verification/multi_day_job_scheduling.sql`

The worktree also contains a separate, earlier reliable form-action change
across platform forms. It was preserved and not reverted by this scheduling
pass.

## Verification performed

- `npx supabase db reset` - passed; every migration applied.
- `npx supabase db lint --local` - passed with no schema errors.
- Local transactional fixture - passed creation, custom hours, removal with
  cancelled history, crew RLS, DST/date preservation, primary crew sync,
  idempotent In progress transition, and no automatic completion.
- `npm run typecheck` in `apps/platform` - passed.
- `npm run build` in `apps/platform` - passed.
- `git diff --check` - passed.
- Authenticated Playwright inspection - passed for admin job detail, week
  calendar, crew job detail, and responsive editor layouts.
- Multi-select interaction inspection - passed for nonconsecutive dates,
  Shift-click ranges, cross-month persistence, per-day hours, bulk row
  selection, and restoring the saved schedule when an unsaved edit is closed.
- Responsive overflow checks - passed at 430x932, 390x844, and 375x812; the
  390px viewport reports matching viewport/document widths with no horizontal
  overflow.

## Screenshots

- `output/playwright/multi-day-scheduling/single-day-1440x900.png`
- `output/playwright/multi-day-scheduling/multi-day-range-1366x768.png`
- `output/playwright/multi-day-scheduling/custom-hours-1366x768.png`
- `output/playwright/multi-day-scheduling/job-detail-summary-1440x900.png`
- `output/playwright/multi-day-scheduling/admin-calendar-1366x768.png`
- `output/playwright/multi-day-scheduling/crew-schedule-430x932.png`
- `output/playwright/multi-day-scheduling/mobile-scheduling-390x844.png`
- `output/playwright/multi-day-scheduling/mobile-scheduling-375x812.png`
- `output/playwright/multi-select-scheduling/nonconsecutive-calendar-1440x900.png`
- `output/playwright/multi-select-scheduling/bulk-and-different-hours-1366x768.png`
- `output/playwright/multi-select-scheduling/cross-month-selection-1366x768.png`
- `output/playwright/multi-select-scheduling/mobile-calendar-430x932.png`
- `output/playwright/multi-select-scheduling/mobile-bulk-390x844.png`
- `output/playwright/multi-select-scheduling/mobile-workday-row-375x812.png`

## Unresolved assumptions

- The reporting setting `business_timezone` is the authoritative organization
  timezone; current operations default to `America/New_York` when absent.
- Existing native browser date/time controls are retained for keyboard access,
  locale formatting, month/year navigation, and mobile usability rather than
  adding a heavy date-picker dependency.
- The first assigned work-session employee remains the legacy primary crew
  member for older start/closeout RPC compatibility. Every session assignee can
  read the job schedule, but the primary employee remains responsible for the
  existing closeout workflow.
- Production migration application and deployment are intentionally not part of
  this pass.
