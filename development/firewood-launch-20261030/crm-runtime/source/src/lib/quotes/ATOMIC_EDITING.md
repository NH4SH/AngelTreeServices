# Atomic quote drafts and editing (PR05)

Implemented and verified only in the disposable local environment. No production
migration, deployment, merge or mobile distribution is authorized by this file.

## Save contract

`create_quote_draft(header, lines)` inserts the draft, complete ordered line set,
computed totals and required creation history in one transaction.
`save_quote_details(id, expected_revision, header, lines, confirm_party_change)`
saves editable header fields, retained/new/removed lines, computed totals,
recurring pricing review and mandatory history together. Neither command accepts
caller authority over approval, delivery, revision stamps or source identity.

The save command locks old/new linked jobs in UUID order, then the quote, and
checks the revision after waiting. PR04's child-to-parent lock remains installed.
Every child mutation also advances the parent revision. Revision numbers are
opaque concurrency tokens, not counts of user saves. Meaningful header/status/
delivery changes advance them; view telemetry, archive and follow-up preference
metadata do not. Staff cannot write revision stamps directly.

Missing/stale revisions return a conflict object containing current revision,
status, total and last editor/time, with no mutation. A successful response
contains the committed revision and ordered line IDs. Callers validate the whole
acknowledgment and retain these IDs for subsequent saves. Never substitute a
freshly queried version for the editor's loaded version. A lost response followed
by the same old revision cannot silently overwrite the committed edit. Create
does not provide durable request identity: after an uncertain create, inspect
the directory before starting another draft.

Only live, active office staff can call either command. Anonymous, crew, customer,
property-manager and service-only requests fail closed. Existing staff role
membership and PR02 offboarding checks are reused. RLS is unchanged; authenticated
direct quote financial/header-content writes and all direct line mutations are
withdrawn. Existing workflow/assignment/archive columns retain their grants.
Service-role maintenance privileges are unchanged; these commands do not grant
general service callers new access.

## Preserved behavior

- Editing is limited to draft, sent and change-requested quotes, and rejects
  quotes already used for invoices, applied work or approved additions.
- Closed statuses cannot be reopened by direct writes. An approved quote can
  still receive its first matching job link for the existing approval workflow.
- Each retained line ID must belong to this quote and occur once. Missing or
  foreign IDs never become new lines. Material/category references omitted by
  native callers survive; referenced material/scope lines cannot silently detach.
- Customer/organization, property, job, contacts, recurring visit and source
  relationships are checked inside the command. Party transfers require explicit
  confirmation, retain the existing portal-access policy and record both parties.
- Existing customer tokens, sent state and delivery stamps survive a normal
  save. Quote editing continues the existing zero-tax edit policy; draft copying
  preserves its supplied tax and derives the complete total.
- Incomplete organization copies/recommendation drafts can still be created for
  repair. Saving requires the existing recipient/approval contacts. A genuine
  recommendation can start without a property; ordinary drafts require one.
- Duplicate, recommendation, renewal, web-create and native-create paths all use
  the command, so withdrawing direct line writes does not break those callers.
- Owner draft deletion remains available. Closed or referenced document history
  cannot be removed by deleting the parent. Archive remains the normal option.

The web editor retains controlled and uncontrolled fields after validation,
conflict and uncertain responses. React's automatic form reset is canceled.
Comparison opens the saved quote separately; reload explicitly confirms discard
and bypasses only the redundant before-unload prompt for that confirmed reload.
All payload controls are disabled while saving. Existing CRM styling is retained.

## Native compatibility

GET detail advertises `quoteEditVersion: 1` and `editRevision`. New native edits
require both and send `expectedRevision` to the distinct
`PATCH /api/mobile/quotes/:id/edit` endpoint. Old servers return 404 for that path
rather than silently applying an unversioned edit. Updated servers reject legacy
PATCH requests without a revision with 409. Cached old DTOs remain readable but
cannot authorize editing. Conflicts leave native inputs in the editor; there is
no silent automatic retry with a newer revision.

## Future approved rollout

1. Reconcile the actual remote schema/history and all external quote writers;
   the local replay is not evidence about current production objects.
2. Install phase 1 (`20261016060143`) and publish all coordinated web/mobile API
   create/edit callers before phase 2 (`20261016060503`) withdraws old grants.
   Use a controlled quote-write maintenance window to avoid old web sessions
   running the old multi-request save during the transition.
3. Publish a verified native build; older installed editors fail safely and need
   an update. Complete the Xcode simulator suite before native distribution.
4. Verify active/offboarded roles, full save/rollback, repeat saves, duplication,
   renewals, conflicts and retained invoice/payment behavior before reopening.

Do not roll back to old callers while phase 2 grants remain enforced, and do not
restore broad financial writes as a convenience workaround. Preserve revision
columns and historical data in a reviewed forward fix.

The subsequent local approval follow-up serializes acceptance/work-order
conversion against editing; see `ATOMIC_APPROVAL.md`. PR05 itself did not include
that command. Source follow-up linking, lead archival and external message
delivery retain their existing separate transaction boundaries. No automatic
customer email or reminder is introduced here.

## Verification

The normal unit gate executes both actual migrations in embedded PostgreSQL;
its minimal identity/table fixture is not a substitute for live authorization.
`quote-editing.integration.test.mjs` separately exercises real disposable Auth,
RLS, PostgREST, concurrent transactions and local mobile HTTP routes. See
`tests/README.md` for the opt-in commands. No provider keys are required.
