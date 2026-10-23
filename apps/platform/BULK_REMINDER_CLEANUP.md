# Bulk obsolete-reminder cleanup

October 23, 2026. The verified visit-reminder changes are pushed normally to main as `5fe849d`. This batch continues the existing communications recovery/scalable-read roadmap and remains local and unreleased on `codex/bulk-reminder-cleanup`. Production is unchanged.

## Change and safety contract

Visit planning previously made one HTTP update per eligible visit to cancel pending reminders with a missing or older visit-time version. The actual local API needed **2,002 cleanup requests** for 1,001 eligible schedule events and 1,001 legacy appointments. The new planner uses **12 requests**, with at most 200 sources per request, retaining the same 4,004 stable confirmation/reminder stages and existing history.

Candidate migration **121**, `20261023232306_bulk_obsolete_visit_reminder_cleanup.sql`, adds one service-role-only `SECURITY INVOKER` command. It validates source kind, batch size, unique IDs and finite versions; checks the actual database role and absence of an end-user subject; locks visits in ID order; and verifies every source still exists at the expected start time. It then locks affected queue rows in ID order and cancels only pending rows whose source version is null or different. Cancellation wording and fields are unchanged. Current-version rows and sent, processing, failed, cancelled and unrelated history are preserved. A complete zero-row cleanup is a valid success.

The command adds no definer privilege, table grant, RLS policy, sender, retry authority, financial behavior or settings change. It does not modify visits. Visit locks precede queue locks, matching existing source-lock ordering. A concurrent reschedule cannot invalidate the source check while cancellation runs. A batch containing a missing or stale source fails atomically instead of cancelling against an old visit snapshot. This is a deliberate safety improvement over the previous per-visit update.

Each planner buffers exactly the source set that previously reached cleanup, after the existing first-work-visit, party and contact checks. All source reads precede cleanup, and all cleanup batches must be acknowledged before that family's queue insertion. An error, missing/malformed acknowledgement, wrong processed count, invalid cancellation count, timeout or lost response leaves recovery pending and blocks this worker's new delivery claim. There is no fallback to the old per-visit update and no automatic resend. Earlier committed cleanup batches can remain; retries reconcile the same inputs and use the original duplicate-ignore queue keys.

## Scope and limits

Application logic changes only in `src/lib/communications/queue.ts`. Proposal/invoice/payment planners, complete visit reads, canonical notice coverage, settings, recipients, timing, source versions, final native eligibility/claims/snapshots, provider keys, employee UI and dashboard are unchanged. The original 120 migration sources remain byte-identical. Only the new public RPC appears in freshly generated types; the schema manifest and deferred-migration source pin include 121.

The schema generator required a small compatibility repair: accept both supported CLI metadata response shapes (an array or `{rows: [...]}`), and reject unusable metadata. This changes local verification tooling only. Existing fixture tests now count cleanup batches, distinguish the coverage RPC from the new cleanup RPC, and expect missing/deleted sources to fail closed before a fresh pass. Historical staging-ledger tests retain their original 93-entry ledger and now explicitly account for 28 deferred source files. No review/authorization assertion was removed.

Cleanup has a five-second client budget across its requests, including acknowledgement of the final response, and a two-second database lock-wait limit. The bound is 200 **sources**, not a promise that every source has a fixed number of obsolete queue rows. A client timeout may leave a successfully committed cancellation with an unobserved response; it therefore reports incomplete preparation and relies on idempotent recovery. Batches are separate transactions, and family preparation is independent. New eligibility or another reschedule after cleanup is still governed by the existing final send-time checks. This does not make all preparation one transaction or create a durable cross-run cursor.

## Verification

| Check | Result |
| --- | --- |
| Full CRM regression suite | **2,573 passed**, zero failed/skipped; 13 new focused cases |
| Type generation, TypeScript and optimized build | Passed on Node 22.23.4 / Next 16.4.2 / React and DOM 19.2.9, from a credential-free source copy with zero external build requests |
| Native local/staging candidate | **43 assertions each**, 201 sources per family, all candidate DDL and staged synthetic fixtures rolled back |
| Actual planner/worker/accepted-follow-up code with native inputs | **32 scenarios**; healthy payload/timing parity, 201-to-2 request reduction per family, checked partial/lost acknowledgements, pending accepted recovery, stale-source refusal and concurrent stable keys |
| Real local Supabase/PostgREST | 1,001 eligible sources per family, **2,002-to-12 cleanup requests**, unchanged 4,004 stable stages; real commit followed by a deliberately lost response recovered safely; anonymous RPC denied |
| Independent native concurrency | **8 two-session cases**, all with observed lock waits: reschedule, overlapping cleanup, processing transition and lock timeout for both visit kinds |
| Local native installation and schema | Only owned disposable database upgraded to 121; repeat changed nothing; all original 120 ledger rows/statements and catalog entries preserved; exactly one routine added; fresh schema generation/check and offline fingerprints passed |
| Local security advisors | No issues found; no definer function or RLS/grant expansion introduced |
| Staging preservation | Exact original 120 ledger entries, 5,110 catalog objects, 49 protected business/Auth/history sets, document/approval behavior and OFF controls preserved; candidate command metadata/body matches the local native installation |

Native assertions cover malformed/oversized/duplicate batches, missing sources, stale versions, ordinary and spoofed-role denial, server-role requests carrying a user subject, transaction cancellation rollback, first/final batches, exact acknowledgement counts, zero-row repeats, preserved source facts and nonpending history, and no outbound acceptance. Focused JavaScript tests also cover complete acknowledgement validation, budgets, empty/ineligible sets, first-work selection, worker claim blocking and accepted-message follow-up without resend.

Native SQL/error scenarios are synthetic verification; they do not certify a deployed outage or provider delivery. Staging DDL and fixtures are tested only inside rolled-back transactions. No hosted migration is installed. Staging automatic sending, appointment notices and recurring generation remain OFF. Actual API and two-session checks use only the newly owned local project; it is stopped after verification with synthetic data retained. No production query/change, app deployment, customer email, provider request, key rotation or support message occurred.

## Next step and evidence

The next step is **targeted staging reconciliation for migration 121**, preserving the exact reviewed 120 baseline and installing only this original migration. The new application expects the RPC; missing migration returns a preparation error, so database reconciliation must precede any later application release. This batch grants no deployment or automatic-activation authority. Existing owner terms-policy decisions, mailbox/device/assistive-technology acceptance and the separate managed-runtime issue stay in the same roadmap.

Sanitized receipt: `staging/BULK_REMINDER_CLEANUP_VERIFICATION_20261023.json`. Private evidence: `/Users/noelsierra/Documents/Codex/2026-10-23/bulk-reminder-cleanup/`. Runtime-security work remains separate at `06580f6`. The new implementation is saved locally, pending a separate push request.
