# Complete visit reminder planning and notice coverage

October 23, 2026. Follow-through on the existing communications recovery and scalable-read roadmap. The verified proposal/invoice reminder fix `9c57df6` is pushed to main through merge `5005e92`, preserving the concurrent website update `0921c20`. This new batch is local and unreleased.

## Defect and implementation

Both visit planners previously read eligible sources once. With 1,001 eligible estimate visits per family and the API's 1,000-row cap, they reported success after preparing 4,000 stages instead of 4,004. This was reproduced with native local/staging synthetic inputs and the actual local Supabase API. No real customer incident or delivery is inferred.

Schedule events and legacy appointments now read ascending UUID pages of at most 200 until an empty page. Short server-capped pages continue. The complete family read must succeed before any obsolete-version cleanup or buffered insertion. The earliest work event per job is selected across the complete schedule set, preserving the existing one-visit rule. Existing source type/status/date/party/contact rules, 45-day horizon, confirmation timing, reminder offsets, source versions and stable keys are retained. Queue writes use batches of at most 200 with duplicate-ignore behavior. Interrupted or lost acknowledgements return an error and existing recovery resumes with the same keys, preserving prior history.

Appointment-notice coverage had a separate capped-read issue and does not have a unique `(source_kind, source_id)` row: a legacy appointment's own notice and its canonical schedule notice can both cover it. Taking the first row can overlook positive reminder suppression. Coverage now reads each source kind in two passes: existence, then positively suppressed sources. Both use ordered source-ID pages. Equal IDs inside a page are valid set members; after a page, moving past that ID is safe because each pass only asks about existence. A true suppression entry is never overwritten by a false entry. This matches the existing native send-time `EXISTS` rule without changing that rule or the RPC.

All coverage passes must finish before any family begins preparation. Missing, malformed, nonadvancing, unordered, timed-out or failed pages return a safe error. Existing worker behavior withholds new delivery claims; accepted-email follow-up stays pending and never resends the accepted message. No historical retry, new sender or activation behavior is introduced.

## Boundaries and preservation

Application edits are confined to `src/lib/communications/queue.ts`. Tests now use canonical UUIDs and a shared query-capable coverage fixture. Existing cleanup failure and later-visit partial-progress expectations remain covered. The old proposal/invoice planner deletion/timing tests were scoped to their own source table after the shared adapter gained visit paging; their expectations are unchanged.

The proposal, invoice and payment planners, checked obsolete-version cleanup, settings, recipients, financial calculations, security/RLS, native functions/claims/snapshots, provider identities, templates, dashboard and employee redesign are preserved. All 120 migration sources, generated types, schema manifest and dependencies are unchanged. No migration is needed.

Source reads and subsequent insertion each have a separate five-second request budget. Coverage has one five-second budget across all passes. **Existing per-visit cleanup remains sequential and is not covered by those budgets.** These are complete bounded read passes, not a durable backlog cursor or one global transaction. Reads can observe changes between pages; new eligibility behind a cursor waits for another pass. Existing final source/recipient/time/suppression checks remain authoritative before provider I/O. Other families prepare independently; a failed family can leave earlier cleanup or successful insertion batches applied. The `created` count retains its existing meaning of acknowledged preparation inputs, including ignored duplicates.

## Verification

| Check | Result |
| --- | --- |
| Full CRM regression suite | **2,560 passed**, zero failed/skipped; 25 new focused cases |
| Type generation, TypeScript, optimized build | Passed on Node 22.23.4, Next 16.4.2, React/DOM 19.2.9; clean source copy, no provider credentials, zero external build requests |
| Native local/staging SQL | **8 assertions per environment**, 1,003 visits per family and 1,003 native coverage rows; canonical false/true case, anonymous/authenticated denial, no outbound acceptance; rollback-only |
| Real planner, worker and accepted-follow-up code with native inputs | **38 scenarios**, including reproduction, healthy payload/timing parity, smaller caps, failed reads, pending recovery, lost/partial acknowledgements and concurrent same-key preparation |
| Actual local Supabase client/PostgREST | Previous 4,000 versus complete 4,004 stages, 7 source requests per family, 22 insertion batches of at most 200; 18 real filtered coverage-RPC requests; existing history and settings preserved |
| Existing website compatibility | Public tests, responsive/style checks and 18-page artifact validation passed with the concurrent website update preserved |
| Schema and staging preservation | Offline contract check passed; exact 120-entry ledger, 5,110 catalog objects, 49 protected record sets, Auth guard and all stored OFF controls preserved |

Focused cases also cover the tail visit, duplicate groups larger than a page, true suppression hidden behind 1,001 false entries, nullable historical suppression, failure during the positive-suppression pass, coverage/read budgets, first-work selection across pages, legacy type rules, organization site contacts and OFF controls. Existing obsolete/current/nonpending/unrelated history tests still pass.

Staging fixtures and its temporary notice-switch change are isolated inside a rolled-back transaction. Master sending stays OFF even in that transaction, and other sessions cannot see the uncommitted switch. Native error scenarios use controlled responses and synthetic database inputs; they do not simulate a deployed outage. Real API tests run only on a newly owned local project, with synthetic records retained after it is stopped. No production query/change, hosted migration, app deployment, provider request, customer email, credential rotation or support message occurred.

## Next step

Continue the same communications recovery work with bounded bulk reconciliation of obsolete visit reminders. The unchanged per-source cleanup calls are now the remaining scaling bottleneck; improve that step without weakening checked acknowledgements or changing delivery eligibility. Real mailbox/device/assistive-technology acceptance, owner terms-policy decisions and the separate managed-runtime issue stay on the existing roadmap.

Sanitized receipt: `staging/VISIT_REMINDER_PLANNING_VERIFICATION_20261023.json`. Private evidence: `/Users/noelsierra/Documents/Codex/2026-10-23/visit-reminder-planning/`. The new candidate remains local on `codex/visit-reminder-planning`; the separate runtime-security worktree remains at `06580f6`. Production readiness and deployment approval are outside this batch.
