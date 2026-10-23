# Appointment reminder preparation and recovery safety

October 23, 2026. Follow-through to the existing PR10 checked queue updates and PR14 delivery-recovery work. Source-read safety is pushed to main as `1f1cfb79e386eb74a575217d612f5cda1d294078`. This candidate also preserves the concurrent website-only main update `0a85e15`. It is local and pending a separate push/release request; production is unchanged.

## Reproduced defect and change

Both scheduled visits and legacy appointments ignored the result of cancelling obsolete pending reminders during synchronization. The actual pre-change queue code, connected to the actual worker and accepted-delivery follow-up code with controlled responses, reported two prepared messages despite an errored cleanup, allowed a delivery-claim attempt, and acknowledged the accepted email's follow-up as complete. No provider was called. The existing send-time source/claim checks still guarded obsolete messages; this reproduction does not demonstrate a duplicate or wrongly timed production email.

The cleanup now returns success only for an acknowledged error-free update; returned errors and thrown/lost responses produce a safe failure. Both planners check it before inserting their buffered reminders. The existing worker consequently stops before claiming a delivery, and accepted-email follow-up remains pending for existing supervised recovery. After cleanup succeeds, preparation completes under the same queue identities, and recovery can acknowledge it without sending the accepted email again. Backend diagnostics are not copied into the returned message.

A successful update affecting zero obsolete rows remains valid, including after a lost acknowledgement. The exact existing source ID, pending-only and old/null source-version filters are unchanged. Current reminders, nonpending records, provider acceptance and unrelated visits retain their history. No new retry command, replacement request key, delivery action or automatic resend was added.

## Preservation and transaction limits

Only `src/lib/communications/queue.ts` application code changed: two callers check the cleanup result, and the shared cleanup handles it. Recipient selection, type/timing rules, multi-day grouping, coverage suppression, automatic-sending switches, queue keys, source snapshots, sender, claim fences, frozen requests, provider recovery and history are unchanged. No financial calculation, business term, template, UI, scheduling transaction, RLS/grant, schema, dependency, hosting or runtime setting changed. The employee/dashboard work and separate runtime branch at `06580f6` are preserved.

Synchronization remains separate operations, not one transaction across all families. An earlier successful cleanup can remain applied when a later visit fails; other parallel families can prepare rows independently. A failure withholds the affected family's buffered inserts and stops this worker's delivery batch; it does not roll back other families or fence a different worker already in progress. Existing send-time validation remains the final safeguard. Same-key recovery completes missing preparation without resetting existing delivery state. A focused two-visit test verifies this partial-progress boundary and repeated recovery.

## Verification

| Check | Result |
| --- | --- |
| Complete CRM regression suite on patched locked dependencies | **2,459 passed**, no failures/skips |
| New focused tests included above | **14 passed**; both source systems, returned/thrown errors, lost acknowledgements, batch-claim prevention, pending recovery, partial progress, zero-row success, preserved history, OFF/coverage behavior and concurrent same-key preparation |
| Route types, TypeScript, optimized build | Passed on Node 22.23.4 / Next 16.4.2 / React and DOM 19.2.9 |
| Build isolation | No ignored environment files/provider credentials copied; zero external application requests |
| Native local and staging SQL | **51 assertions in each**, seven synthetic visit fixtures per environment, fully rolled back |
| Actual queue/worker/follow-up code with native inputs | **98 scenarios passed**; healthy pre-change/new keys, recipients and reminder timing match; failed writes stop claims and retain recovery until safe completion |
| Concurrent main website compatibility | 239 interaction checks and nine style checks passed; build and validation of 18 approved pages passed |
| Preservation | Exact before/after ledger/catalog/protected-state comparisons passed; app/test/SQL source-copy parity and whitespace checks passed |

Native SQL covers estimate/job/maintenance visits in both systems plus emergency schedule events. It checks cancelled-statement rollback, anonymous write denial, service cleanup of exactly the two obsolete/legacy pending rows, preserved current/nonpending/unrelated records, valid zero-row repeat, native unique-key enforcement and absence of outbound delivery/acceptance history. It uses temporary verification objects and synthetic records only. Enabled planner flags exist only in the exported adapter inputs; hosted settings are never enabled.

Local checks reused the existing loopback disposable schema at migration 105 without reset/upgrade, verifying its full catalog, ledger and all public/private/Auth row fingerprints afterward. Exact current staging 118 was verified separately: all 5,110 catalog objects/permissions, 49 protected business/Auth/history sets, ledger, no-send Auth guard and settings match before/after. Staging automatic sending, appointment notices and recurring generation remain OFF. `supabase/verification/appointment_queue_sync.sql` is rollback-only verification, not migration 119.

Worker write failures/lost responses use controlled response adapters with database-produced synthetic inputs. Recovery acknowledgement uses a controlled saved-delivery response; no real accepted delivery or provider is touched. These checks do not certify a hosted outage, deployed staging worker or real inbox delivery. The website compatibility run initially selected macOS Python 3.9, which cannot parse the existing generator's newer f-string syntax; rerunning with the installed Python 3.13.16 passed without a source/dependency change.

## Evidence and remaining scope

Sanitized receipt: `staging/APPOINTMENT_QUEUE_SYNC_VERIFICATION_20261023.json`. Private evidence: `/Users/noelsierra/Documents/Codex/2026-10-23/appointment-queue-sync-safety/`, including the original queue, before reproduction, focused/full test logs, database fingerprints and native-input acceptance results. Raw snapshots, generated records and diagnostics remain outside Git.

The existing roadmap still includes actual mailbox/device/assistive-technology acceptance, unresolved owner terms-policy decisions and the separate Netlify managed-runtime follow-up. This backend-only batch changes no presentation and adds no recovery UI. No production query/change, application deployment, key rotation, support message or customer communication occurred. The newly verified fix remains local; main already contains the requested source-read fix and the separate website update.
