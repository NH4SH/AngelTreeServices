# Legacy appointment save integrity

Verified locally October 17, 2026 (migration timestamp October 18 UTC).

## Decision and publication state

The verified sign-in protection (`099315f`) and its release-observation note
(`55d0ba5`) are pushed to `main` and `codex/crm-sign-in-abuse-protection`.
The next work closes the known legacy-appointment crash gap documented in PR15,
continuing PR08 scheduling integrity rather than introducing another roadmap.
This appointment package is local on `codex/atomic-legacy-appointments`, based on
main `55d0ba5`. It has not been pushed or deployed.

Legacy calendar saves previously committed the visit separately from the job
transition, audit history, reminder invalidation and owned scheduling handoff.
A failed later write could leave an apparently successful visit with a stale
next action. Normalized PR08 scheduling was already transactional; its behavior
is retained.

## Changes

`save_legacy_appointment` now saves a legacy creation, details edit or status
change in one database transaction. It locks the job before the appointment and
selected employee, validates current authorization, and commits the appointment,
existing create-time job transition, audit records, pending-reminder cancellation
and existing scheduling handoff together. An audit/handoff failure rolls them all
back. It performs no provider call or customer send.

- Creation uses a form-lifetime request UUID bound to the authenticated actor,
  parent job and canonical payload. An identical retry acknowledges the existing
  appointment without another history entry. Reusing the ID for a different
  request is rejected.
- Edits/status changes must supply the revision displayed in that form. A stale
  editor cannot overwrite a newer save. The browser retains its draft on failure;
  a confirmed save adopts the returned revision and refreshes the calendar.
- Direct authenticated/anonymous appointment DML is blocked by a trigger. The
  definer command requires a real current staff actor, checks again after locks,
  and has no anonymous or service-role execute grant. Existing maintenance and
  reviewed definer commands retain their write path; permitted updates also
  advance the revision. Existing RLS policies and table grants are unchanged.
- Existing owner/admin/estimator/payroll legacy permissions are retained. This
  does not impose normalized event-type permissions on old appointments.
- Durable employee assignments support employees without CRM logins. New/active
  assignments reject archived, inactive, separated or leave-state employees;
  applicant/onboarding states remain advisory. Missing blocking qualifications
  require an owner/admin reason, with current unexpired credentials checked in
  SQL. An override cannot make a separated employee assignable. Historical closed
  assignments may be retained. Employment state is separate from onboarding
  checklist progress.
- Active visits on archived/cancelled/lost jobs, and active work/maintenance on
  completed jobs, require job review/reopening. Follow-ups on completed jobs are
  still supported. Cancellation does not invent a new job-status transition.
- Date changes and closing a visit cancel only still-pending reminders inside
  the transaction. Processing/sent communications remain intact. Existing new
  reminder preparation runs after acknowledgment; an exception reports that the
  appointment was saved and Communications needs review.

The database checks above are the necessary functional hardening around the
existing action flow. The calendar presentation, employee redesign, financial
commands, PR08 normalized conflict handling, provider integrations and scanner
configuration are preserved.

## Verification

| Check | Result |
| --- | --- |
| Ordinary regression suite | 762 passed; no skips/failures |
| New native legacy appointment integration | 13 passed, including parent result |
| Existing PR08 scheduling integration | 30 passed, including parent result |
| Existing PR15 record search/handoffs integration | 20 passed, including parent result |
| Typecheck and separate credential-free optimized build | Passed |
| Fresh empty database replay and generated schema contract | All 93 migrations passed |
| Offline schema contract check | Passed |
| Original migration preservation | All 92 SHA-256 hashes match the frozen candidate |
| Fresh/shared local security comparison | Policies and new function definitions/grants/settings match |

The 825 enabled test results include concurrent duplicate requests, competing
editors, concurrent booking/cancellation, wrong parents, direct-write/role denial,
qualified and no-login assignments, override restrictions, completion guards,
injected audit/handoff rollback, pending-vs-processing reminder preservation,
and an issued token losing access while waiting on the job lock.

Real browser verification used only a newly created synthetic local fixture.
A concurrent edit caused the expected stale-save message and retained the typed
draft. Reloading and saving then produced “Appointment updated.” and the new
notes/revision were independently confirmed in the local database.

- [Stale edit retains the draft](/Users/noelsierra/Documents/Codex/2026-10-14/pu/work/legacy-appointments/stale-draft.png)
- [Successful save](/Users/noelsierra/Documents/Codex/2026-10-14/pu/work/legacy-appointments/saved-appointment.png)
- [Local review fixture](http://127.0.0.1:3102/admin/schedule?date=2035-03-01&view=week&appointment=7a7066fc-1ab1-452c-88cf-5fb260988503)

Evidence and logs are outside Git under
`/Users/noelsierra/Documents/Codex/2026-10-14/pu/work/legacy-appointments/`.
Fresh local security advisors retain the existing `pgcrypto` extension-in-public
warning; no new advisor issue was introduced or unrelated relocation attempted.
The active review app and original user session were preserved; the unrelated
four-hour staging visitor gate had naturally expired and was not bypassed.

## Files and compatibility

The additive migration is
`supabase/migrations/20261018004943_atomic_legacy_appointments.sql`.
The runtime changes are the typed `legacy-appointment.ts` adapter, the three
legacy schedule actions, request/revision plumbing in calendar/job forms and
callers, generated database/RPC types, and their schema manifest. Tests cover the
new command and update the previous legacy handoff scenario. The frozen staging
candidate test now checks its immutable 92-file prefix while permitting additive
local migrations; the pinned candidate, permission profile and original hashes
are not rewritten.

The hosted staging candidate remains 92 migrations. This local source is at 93.
Before any release, separately reconcile the new migration, permissions and
staging candidate; ship the updated application and command together. Old raw
appointment clients are incompatible with the new direct-write guard and open
forms need refreshing. No hosted migration, history repair, backfill or deployment
was performed. Read-only Netlify checks before/after publication and at completion
show CRM deploy `6ad23c757dfc53f702ae00b9` and website deploy
`6ad4161bdbf2175dcdccac7e` unchanged during this task.

## Remaining boundaries

This does not add a new overlap policy to legacy visits or convert them to
normalized events. Service-maintenance/historical gaps can still use the existing
explicit handoff repair command. Fresh reminder creation remains a post-commit
operation with existing Communications supervision; no claim of atomic external
delivery is made. Real Google/calendar providers, customer sends, hosted adapter
behavior and production clients were not activated or exercised.

The home-Mac scanner remains parked until its hardware is available. A suitable
next scanner-independent step is to review remaining legacy scheduling clients
and release compatibility against this command before separately preparing the
93-migration staging candidate. No new feature or production activation is implied.
