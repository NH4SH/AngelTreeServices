# PR04 atomic work-order invoice generation

`generate_job_invoice(request_id, job_id?, quote_id?, manual?)` replaces the
separate header, approved-addition, completion and best-effort history writes in
work-order and approved-quote generation. It also handles the new-invoice form
when a work order is selected. Standalone invoice creation and explicit invoice
duplication continue using their existing commands.

## Contract and authorization

- Supply one work order **or** one approved quote, plus a stable UUID. The command
  derives the actor from the issued session and checks the existing live PR02
  office predicate: owner, admin, estimator and payroll administrator. Anonymous,
  field/customer/property-manager sessions and a service-only client cannot call
  it. Deactivation denies both new commands and previously saved-result replay.
- The private request row binds the actor and exact input to the original result.
  A transaction-scoped request lock serializes repeated UUIDs; the job lock
  serializes different UUIDs, users and job/quote entry points. A committed result
  survives a lost response. Replay neither repeats completion nor changes money.
  Reusing a UUID for different input fails. Deleting an eligible never-sent draft
  retains its request tombstone: replay cannot silently regenerate it.
- Generation preserves the first-invoice lookup, ordered by creation time with ID
  as a tie breaker. Existing invoices, including voids and historical duplicates,
  return an explicit existing result; no replacement, automatic restoration, new
  charges or completion changes occur. There is **no unique job/invoice index**.
  Explicit duplicate/supplemental invoice drafts remain possible.
- Automatic generation reads stored approved quote lines and approved, unbilled
  additions. IDs do not authorize caller-supplied totals or billing ownership.
  Custom work-order invoices retain their entered lines, due date and internal
  note; party/location/contact/recurring references are checked against the job.
  Header/line financial state and source provenance cannot be forged by input.

## Transaction boundary

One transaction locks and checks the source, creates the draft and all lines,
attaches approved additions, updates job/schedule completion, records mandatory
history and saves the request result. Any failure, including the final request
insert, rolls back all of it. There are no compensating invoice deletions and no
catch-and-continue attachment/history errors on these generation paths.

Approved additions include every original line with retained source provenance,
their tax, and a separate described fee line when needed. Quantity × price,
subtotal/tax/fee arithmetic, integer bounds, party/location/source links and
already-billed source lines are validated. Inconsistent legacy inputs require
review; the migration does not repair or rewrite historical money. Zero-price
scope remains an unsent draft, with no paid timestamp or payment.

An approved quote that lacks a work order can create/link it inside the same
transaction. Existing linked-lead restoration restrictions, material-plan copying,
recurring references and the quote path's pending-communication cancellation are
retained. No inventory is reserved or consumed and no email/automation is run.

The current product behavior—creating an invoice marks the job and active schedule
sessions complete—is preserved atomically. Existing completion time/actor survive.
PR09 remains the separate decision about decoupling billing and field completion.

## Concurrency and security

Lock order is request → existing job → quote → unbilled change orders → new invoice.
Source-line INSERT/UPDATE/DELETE locks its quote/change-order parent; a header
lock alone would not serialize existing child edits. Change-order approval now
locks its job before the addition and rechecks the parent after waiting. These
changes preserve the invoker authorization and approval/scope behavior.

Testing exposed an existing incompatibility: authenticated approval attempted a
direct audit INSERT after audit hardening had revoked that privilege. Approval
now uses a private, narrowly granted audit helper. It validates live staff or the
existing service portal context, derives the approved record/event/actor itself,
and deduplicates that approval history. General authenticated audit INSERT remains
revoked. Approval and its audit still share one transaction. No RLS policy, broad
financial grant, provider command, or invoice deletion guard is weakened.

The private request table has RLS and no application-role table privileges. New
privileged helpers/commands pin an empty search path and explicit execution grants.
The generation command bounds lock waits to five seconds. A conflict/deadlock
leaves no partial result; retry the same command after the competing edit finishes.

## Browser and recovery

Job/quote actions persist an actor/source-specific UUID in browser storage **before**
dispatch. Storage failure blocks dispatch. Reload and lost-response retries reuse
that UUID. A focused confirmation previews approved additions, completion, and
that the invoice will not be sent. Pending buttons are disabled and the existing
synchronous submit guard blocks duplicate queued actions.

The custom invoice form preserves its UUID and entered details during retries in
the same mounted form. After reload its new UUID still meets the locked first-
invoice check; it cannot create a second base invoice. The standalone form is not
claimed to have durable generation replay. Existing/void responses expose an
explicit review link instead of silently replacing or restoring invoices.

## Verification and eventual rollout

Run the ordinary unit gate and the opt-in `invoice-generation.integration.test.mjs`
against the dedicated disposable Supabase stack. The latter exercises real Auth,
RLS, independent transaction contention, rollback injection, source validation,
organization/material/recurring behavior, replay, and approved-addition approval.
It retires its synthetic accounts afterward while retaining fixture history.

Install the additive migration before these callers in a future approved rollout.
Drain older generation requests/instances during that transition: older app code
still performs a separate lookup and generic draft creation. No production
migration, deployment, backfill, provider operation or automatic sender is part
of PR04 local verification. PR05 still owns remaining quote atomic saves and
existing post-creation attachment/standalone-note concerns; PR14 owns reminder
serialization. Do not treat this command as completion of those milestones.
