# Atomic quote approval and work-order conversion

Local follow-up to PR05. No production migration or deployment has been performed.

`approve_quote(quote_id, expected_revision)` is restricted to live active office
staff. `approve_quote_by_portal(token_hash, expected_revision)` is restricted to the
existing trusted service-role customer-link endpoint. Its private implementation
rechecks the actual token under a row lock, including revocation and expiry at the
time it can proceed. Anonymous/authenticated callers cannot execute the portal
command; the private implementation is not granted to application roles.

Both paths use `app_private.approve_quote_locked`. One transaction validates the
displayed quote version, party/property/contacts/source relationships and stored
line arithmetic, creates or links the work order, copies material planning,
updates a recurring visit, approves the quote, records portal-token use where
applicable, cancels pending quote communications and writes mandatory history.
Any failure rolls back every one of those writes, including closeout rows seeded
by the existing work-order trigger. It neither invoices nor completes work.

Staff and customer forms send the revision from the rendered proposal. A server
lookup does not replace this with a fresh version. Missing or stale versions fail
with refresh/review guidance before work is created. The approval timestamp comes
from the database. The previous approved revision is stored in
`quotes.approved_from_revision`; existing rows remain null without a backfill.

## Concurrency and replay

Existing linked/source work orders lock before the quote, matching PR04 generation
and PR05 editing. PR04's quote-line parent lock remains in place. If an existing
job is discovered only after the quote lock, a mutating repair fails with a
retryable conflict instead of acquiring parents in reverse order. A completed
approval can return its recorded job as a read-only replay in that case.

Once a new approval has committed, the original displayed revision or the current
approved revision can recover the same result. Replay checks authorization/token
again and preserves the first approval time, history, work progress and later
material-plan adjustments. It never recreates work or re-copies operational plans.
Two quotes competing for a linked job cannot both claim its source relationship.
The existing unique source-quote index continues to prevent duplicate work orders.

The staff predicate is checked both before work begins and after acquiring the
quote lock, so a staff member deactivated while waiting cannot proceed. Token
checks similarly occur after waiting for its locked row. Ordinary in-flight
transaction boundaries remain; these checks do not promise to cancel a transaction
whose authorized decision has already completed.

## Preserved workflows

- Open draft, sent and change-requested proposals can be approved. Closed rejected
  statuses remain closed. Approval never edits the proposal's prices or scope.
- A newly created work order gets scope from the locked, approved version. Existing
  linked work retains its operational scope and later status. Its quote-based
  closeout items still seed through the incumbent source-link trigger.
- Automatically archived website leads restore first, then become accepted in the
  same transaction. The historical inactive-lead trigger is preserved. Manually
  archived, cancelled, lost, mismatched or differently sourced work is rejected.
- Material-plan identities are retained. Copying remains planning only: no stock
  is used/reserved automatically. Duplicate source plans fail for review instead
  of choosing an arbitrary record. Later planning changes survive approval replay.
- Legacy approved records can be repaired through the staff command, preserving
  their approval time and recording `quote_approval_repaired`. Customer links
  cannot use this path to repair historical operational records. Completed new
  approvals can be replayed through a still-valid customer link.
- Pending communication cancellation is transactional. Existing keyed customer
  activity notifications remain outside the transaction; no customer email,
  Stripe operation, scheduling change or automation activation is introduced.

## Direct-write boundary

Invoker triggers reject direct authenticated approval/timestamp forgery and
work-order source binding/unbinding. They check the actual database execution role,
not a client-settable session flag. Reviewed definer commands, PR04 generation and
existing trusted service/maintenance access remain available. RLS and financial
permissions are unchanged; no broad audit-write grant was added. Other ordinary
work-order creation, status, assignment, archive, decline/change-request and manual
delivery actions keep their existing paths.

## Release and verification

In any future approved release, reconcile the remote schema, then coordinate
`20261016064442_atomic_quote_approval.sql` and both new callers during a controlled
quote-write window. Older pages/callers must refresh/update; missing revisions and
old direct writes fail closed. Do not restore direct approval/source writes to
work around compatibility. Preserve the column, timestamps and history in a
reviewed forward fix. No migration history repair or production operation was
performed during local development.

The normal unit gate executes the actual migration plus PR05 commands and the
actual historical inactive-lead trigger in embedded PostgreSQL. The fixture's
identity/table definitions are explicit stand-ins. Separate disposable integration
tests use real Auth/RLS, PostgREST and independent transactions for contested
approval/editing, duplicate approval, role revocation, token revocation, rollback,
legacy repair, material/recurrence preservation and PR04 generation compatibility.
Actual staff/customer server-action browser flows verify stale-page rejection and
approval after refresh. See `tests/README.md` and the local verification report.

Communications already processing, external delivery exactly-once semantics,
change-request/decline workflow atomicity and reminder serialization remain their
existing separate roadmap boundaries (especially PR14). This change does not
claim to serialize external communications with database acceptance.
