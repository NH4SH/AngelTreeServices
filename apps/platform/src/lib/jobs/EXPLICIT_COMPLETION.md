# Explicit work completion (PR09)

Invoice preparation and field completion are separate commands. Preparing a draft
from a job, approved quote, or custom work-order form does not set completed_at,
change the job's field state, close visits, submit/approve a closeout, stop timers,
or send a customer message. Approved-quote conversion still creates/links an
accepted work order and copies existing scope/material/recurring billing data.
Historical PR04 receipts and completion records remain unchanged.

## Office workflow

The work order offers Prepare invoice draft separately from Complete work. The
completion disclosure shows all remaining work visits, requires confirmation for
future dates, and accepts an optional 1,000-character office note. Complete work
creates no invoice. Complete & prepare invoice executes the existing PR04 invoice
transaction inside the completion transaction, leaving a draft for office review.
Existing voided invoices block the combined action; office staff can complete work
separately without altering the void. Existing nonvoid invoices are retained.

`get_job_completion_context` supplies one read snapshot. The submitted context is
what the person reviewed: job completion_revision; active normalized work events'
edit_revision; unmigrated work appointments' updated_at; closeout status/header,
checklist and scope versions. It is never replaced by a fresh version on submit.
A stale review rejects the whole transaction. Review latest visits explicitly
reloads that context while retaining notes/draft and clears future confirmation.

`complete_job_work` permits the existing effective office roles (owner, admin,
estimator, payroll_admin). It serializes request identity, job, job events, work
appointments, closeout, checklist and scope, then uses the existing invoice lock
order when requested. Request advisory seed 43664 matches PR04. Required audit,
visit/legacy work completion, pending work-reminder cancellation, Calendar outbox
and private receipt share the transaction. Any failure rolls back everything.

Retries are bound to actor, mode, job, exact reviewed context, confirmation and
note. Exact replay returns the saved result; changed details or another actor fail.
Browser storage saves identity and a SHA-256 input fingerprint before dispatch, without persisting an additional copy of private note/payload text. Replays recheck live permission
after waits. Already completed work keeps the original time/actor and produces no
second work completion audit. Sent/paid invoice state never hides accepted,
scheduled or in-progress field work in the existing operations views/helpers.

## Crew workflow and security

Feature flags remain unchanged. With both existing crew closeout/checklist flags
enabled, draft saving uses save_job_closeout_draft and acknowledges its own new
context. Submission uses one submit_job_closeout_atomic call: save payload,
validate existing requirements, save immutable submission, complete field work,
close its work visits, queue Calendar changes, audit and persist retry receipt.
A rejected submission saves no partial draft. The controlled browser/session draft
is retained. Timers remain separate, including the existing active-timer warning.

Existing required checklist, scope exceptions, completion/issue photos, incident,
additional-work and customer acknowledgment rules remain in the original private-to-
callers implementations. Primary assigned crew and effective office access are
unchanged; unrelated crew gain no access. Crew completion context includes no
amounts and masks invoice existence. Office work completion does not approve or
alter crew closeout evidence/status. Existing approve/ready/return/reopen commands
keep their transitions/reasons; they now acquire the same job-before-closeout lock.
Correction/resubmission preserves the first work completion time and actor.

Direct authenticated completion metadata/status writes and the old unchecked
save/submit/completed-schedule entry points are rejected. Trusted migration/service
writes remain possible; no global RLS bypass, expanded role, configuration flag,
new service credential, or customer/financial access is introduced. Private
helpers/request records have no public, anon, authenticated or service API grants.

Only active event_type=job visits close. Estimate, follow-up, PTO, cancelled and
completed history is retained. Legacy job/maintenance appointments close only when
no normalized source event exists. New active job scheduling against completed
work requires the existing office review/reopen workflow first. No historical
rows are reopened, backfilled, or rewritten.

## Verification and rollout limits

See tests/explicit-job-completion.integration.test.mjs for real local Auth/JWT/RLS,
independent-session lock waits, concurrency and late-failure injection. The test
suite opts in only to the named disposable local stack and retires only its own
synthetic accounts. Existing financial, quote, scheduling and offboarding suites
remain mandatory. Unit tests cover durable identity and operations state; browser
verification covers normal flags-off and a separate local flags-on preview.

Migration 20261016130010_explicit_job_completion.sql and matching application code
are a coordinated release: old closeout/save callers lose execute permission.
No migration has been applied to a hosted project. Review the full migration chain
and coordinate web/native clients before a separately authorized release. Existing
native mobile API shapes are unchanged; any external direct caller of the retired
RPCs must adopt the versioned wrappers before release. No deployment in this phase.

Processing/sent reminders are retained; send-time cancellation/deduplication still
belongs to communications PR14. This phase does not run a sender or provider worker.
