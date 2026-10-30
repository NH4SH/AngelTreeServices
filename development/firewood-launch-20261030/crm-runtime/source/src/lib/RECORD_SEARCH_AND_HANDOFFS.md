# PR15 — Record search and owned office handoffs

This extends the existing command palette and `follow_up_tasks`. It does not add
a second task system, sender, worker, preference table, or environment variable.

## Record lookup

Office roles use the existing verified-session client and security-invoker
`admin_record_search` view. The route is private and non-cacheable. Anonymous,
field-only and customer sessions cannot use it; existing live effective-access
checks still apply to issued sessions after offboarding.

- Search is debounced 200 ms, accepts 2–80 characters and at most six ANDed terms.
- Phone-only punctuation is normalized to digits. Mixed names, document numbers
  and street addresses keep their letters; `%`, `_` and backslashes are escaped.
- Up to four results per type, 20 total, are ordered deterministically. Types are
  customer, organization, work order, quote and invoice; archived rows are omitted.
- Only titles, contact/context labels and status are returned. Internal search
  text, financial totals, balances, bodies and credentials are never snippets.
- The database work shares a four-second budget; the browser request/body has a
  six-second budget. A failed group fails the request with a safe error, rather
  than presenting incomplete results as exhaustive.
- Old results clear immediately, older requests are aborted and fenced, and a
  closed palette cannot publish a late response. Results are not persisted.
- Existing role-aware page/action shortcuts remain available. Arrow keys select;
  Enter uses an internal native navigation so document `beforeunload` draft guards
  still run. Mouse/touch retains the existing links. Escape closes and restores
  focus through the existing modal behavior.

This is a bounded operational lookup, not relevance-ranked full-text search. The
existing search view remains the source of matching. Index tuning belongs to
PR18 after representative production-sized query measurements.

## Scheduling handoff lifecycle

The new additive migration is
`20261016182241_owned_scheduling_handoffs.sql` (84 migrations in the full chain).
It reuses the existing unique `dedupe_key` with
`approved-work-schedule:<job UUID>` and the existing task/audit tables.

1. The existing quote approval command establishes the protected source-quote
   link on the work order. A job trigger creates the scheduling task inside that
   same transaction, before final quote approval. A mandatory audit failure rolls
   the approval back. No quote trigger reverses the established lock order.
2. Ownership prefers the quote's effectively active office estimator, then the
   effectively active approving office actor, then the oldest active owner/admin
   by creation time and UUID. If none qualifies, the shared queue owns it.
3. The initial task is due immediately (or at the original approval time when
   explicitly tracking earlier work). No new business-day deadline is invented.
4. An existing open manual scheduling task is reused instead of adding another.
   A live or completed job booking resolves open scheduling tasks. Job
   archive/cancellation cancels them. Unrelated callback task types are untouched.
5. Cancelling the final booking reopens the same automatic task, preserving its
   owner and history, clearing stale snooze/completion fields and setting a new
   return time. Cancelling one of multiple bookings does not reopen it.

Parent work-order locks precede task locks. The public ownership/repair commands
recheck live authorization after lock waits. Private helpers have no client or
service-role execute grants and use pinned search paths. Existing public/Storage
RLS policies are unchanged. Automatic task history cannot be forged, deleted,
manually completed or reopened through direct authenticated writes. Ordinary
manual task actions remain available. Automatic tasks use **Open scheduling** to
open the work order's booking section. **Update progress → Mark in progress**
retains the optional status action separately. A task-complete button cannot
substitute for actually booking the work. The same distinction is used in record,
dashboard and recurring task lists.

### Legacy appointments

PR08 visit commands update their parent work order and handoff transactionally.
Older appointment actions still have their existing separate save steps. All
three now perform a bounded, positively checked `ensure_scheduling_handoff`
afterward; failure reports that the appointment was saved but needs handoff review.
The check itself cannot create another appointment or send an email.

A process crash between a legacy source save and that check remains possible.
The security-invoker `approved_work_handoff_gaps` view exposes approved work with
no booking and no open scheduling task. The page reads at most ten oldest gaps;
it does not create tasks on page load. An office user can explicitly track one
through the idempotent parent-locking repair command. There is no historical
backfill, background replay or notification flood. This is not a rewrite of the
legacy appointment transaction boundary.

## Office follow-up controls

`office_follow_up_queue`, `office_handoff_staff` and
`approved_work_handoff_gaps` are security-invoker views. The boolean-only owner
eligibility projection checks the complete existing effective-access predicate
without disclosing employee/access internals. Both assignment and preview use
that eligibility. A removed owner remains in history and appears under **Needs
an owner**; the task is never silently reassigned.

- Filters: all office handoffs, mine, needs an owner or a selected office account;
  all/scheduling work; all/due/snoozed return times. The queue uses an exact
  filtered count and 25 rows per page, ordered by effective return time and UUID.
- `next_action_at` is generated from `coalesce(snoozed_until,due_at)`. Snoozing
  therefore changes both due eligibility and actual queue order.
- Owner/return-time controls expand on demand. Eastern local inputs use the
  existing business-time parser. Empty return time clears snooze. Changes do not
  book work or communicate with customers.
- `update_office_handoff` atomically saves owner/snooze and the required audit,
  rejects closed or stale task versions, and validates a live eligible assignee.
  The form retains the version the user began editing; only a positively
  acknowledged save advances it. An interrupted/uncertain save requires a fresh
  check, never an assumed success or blind overwrite.
- The active office selector is bounded to 100 accounts. A current or selected
  owner outside that list remains explicitly represented. Larger teams would
  need a searchable owner picker; this small-company screen does not add one.
- **Save this view** stores only allowlisted filter values, per account/browser.
  It does not store records/PII or automatically hide work when opening the page.
  **Open saved view** and ordinary bookmarks are explicit navigation.
- Bulk preview is read-only, bounded to 25 selected rows, and checks each visible
  record. Closed/unavailable rows are identified individually. There is no bulk
  apply endpoint; changes require individual review and save.
- Shared communication, waiting quote/invoice and future/recurring queues remain
  accessible in disclosures. They are bounded previews, not filtered by the
  handoff controls. Financial amounts keep the existing reporting-role gate.
  Delivery problems link to PR14's recovery queue.

The dashboard foregrounds **My due handoffs**, with the existing broader CRM
overview expandable (initially open for owner/admin). Existing modules remain.

## Verification and rollout

See `tests/README.md` for the opt-in local suite. Coverage includes real Auth/RLS,
HTTP cookies, lock-wait revocation, concurrent approval, failure rollback, stale
owners/versions, effective snooze ordering, actual preview actions, legacy repair,
multiple booking cancellation, history retention and 25-row pagination. Browser
evidence covers desktop/mobile, keyboard record opening, empty results, saved
filters, an acknowledged owner save and the zero-write preview.

No production migration, provider call, automatic sender, deployment, dependency
upgrade or configuration/credential change is part of PR15. Future rollout needs
the additive migration before the app that reads its column/views/commands. Older
app code remains compatible except that it cannot manually close a new automatic
scheduling task; booking/cancellation remains authoritative. Roll back application
code by a reviewed compatible release, not by deleting task history or resetting
branches. Preserve PR14's separate future Resend setup and rollout requirements.
