# Staging migration 121 — bulk obsolete-reminder cleanup

October 23, 2026. Complete on ATS CRM Staging only (`gbyhdsuiqeslgjdnbqng`): **121 migrations**, latest `20261023232306`. The verified bulk cleanup implementation is pushed normally to main as `b29fbde`. No app deployment, production query/change, customer email, provider request or key rotation occurred.

## Installed result and preservation

The original `20261023232306_bulk_obsolete_visit_reminder_cleanup.sql` is installed through the native Supabase CLI. Exactly one reviewed routine was added: `public.cancel_obsolete_visit_reminders(text,jsonb)`. Its definition, owner, arguments, invoker security mode, search path, lock timeout and execution rights match the fresh native local installation.

The catalog now has **5,111 objects**, up from 5,110. Every original catalog entry remains byte-identical, including RLS/policies, grants/defaults, source and recipient checks, financial commands, claim fences, provider identities, proposal-expiry checks and immutable document bindings. All original 120 complete migration ledger rows, including statement history, are preserved. The new native migration entry matches the local rehearsal exactly.

All **49 protected business/Auth/history sets**, settings, recurring settings and the no-send Auth guard match the reviewed migration-120 baseline. Automatic sending, appointment notices and recurring generation remain OFF. Existing historical messages are not reset, retried or resent. The new command cancels only obsolete pending visit rows when later called by the server; this reconciliation does not run cleanup against real records or activate a sender.

## Verification

| Check | Result |
| --- | --- |
| Fresh seed-free native local project | Original 120 migrations replayed; no shared database reset |
| Candidate transaction | **43 assertions**, with all candidate DDL and synthetic fixtures rolled back |
| Deliberately failed native 121 upgrade | Schema, records and native migration history rolled back together |
| Local native upgrade and repeat | 121 entries; original 120 full ledger rows, catalog objects and records preserved; repeat changed nothing |
| Installed local command checks | **43 assertions**, synthetic fixtures rolled back |
| Native local concurrency | **8 two-session cases**, all with observed lock waits, covering reschedule, overlapping cleanup, processing transition and timeout for both source kinds |
| Staging preflight and prospective catalog | Exact reviewed 120 baseline; **43 candidate assertions**; only the reviewed command added, followed by full rollback |
| Native staging installation | Only original migration 121 applied; no seeds, custom roles or Vault secrets imported |
| Installed staging checks | **43 assertions**, all synthetic fixtures rolled back and protected state unchanged |
| Final native dry run | Up to date; zero pending migrations, seeds or roles |
| Read-only 121 maintenance | Fresh hosted observation passed; **10 acceptance/rejection tests** passed |
| Full CRM regression suite | **2,583 passed**, zero failures/skips |
| Fresh native schema, offline fingerprints, route types, TypeScript and framework floor | Passed; no migration-source or generated-type drift |
| Security advisors | Exact before/after equality; no new findings |

Native checks cover complete bounded acknowledgements, the final partial batch, zero-row repeat, malformed/oversized/duplicate requests, missing/stale source refusal, anonymous and authenticated denial (including spoofed claims), server-role requests with a user subject, transaction cancellation rollback, source preservation and byte-identical current/nonpending/unrelated history. No outbound acceptance or provider request is created. Concurrency checks verify that a stale request cannot cancel a newer reminder, processing history is retained, overlapping cleanup is idempotent and lock timeout leaves recovery safe.

All staged fixtures roll back. Existing hosted defaults and rights are compared against staging's own reviewed baseline; only the one added routine is compared with the native local result. Concurrency fixtures stay in the newly owned local database, retained when it is stopped. Raw responses, synthetic records, credentials and logs remain outside Git. Clean verification copied no ignored environment files or provider credentials and recorded zero external application requests during contract/type checks.

The existing WARN-level advisor baseline remains 80 findings: 79 authenticated-definer notices and one leaked-password-protection warning. These findings were unchanged by this reconciliation; no protection setting changed. The separate managed-runtime issue remains separate.

## Maintenance and release boundary

`supabase/staging/bulk-reminder-candidate-121.json` pins all 121 original migration sources, physical staging identity, the complete previous ledger seal, exact native installation entry, complete catalog seal, document/approval definitions and protected state. `scripts/release/verify-staging-bulk-reminder-candidate.mjs` is read-only. It rejects production targets, write/deploy flags, unknown source migrations, altered history, broadened execution rights, definition drift, changed protected records/guard and enabled automation. Its `--print-sql` mode returns only the pinned read-only snapshot. Historical 120 and earlier reports and candidates remain intact; use the new 121 verifier for current staging maintenance.

This completes the targeted staging database step. No app/UI source, original migration, generated public type or dependency changed in this reconciliation, so no new optimized-build, browser or mailbox acceptance is claimed. The implementation's existing build, actual-API and recovery verification remain preserved. Production release and automatic activation are outside this batch. Existing owner-policy, real mailbox/device/assistive-technology and separate managed-runtime follow-ups remain in the same roadmap.

Main is included through `b29fbde`; runtime-security work remains at `06580f6`. The new reconciliation checkpoint is local on `codex/staging-bulk-reminder-121`, pending a separate push request. Private evidence: `/Users/noelsierra/Documents/Codex/2026-10-23/staging-bulk-reminder-121/`. Sanitized receipt: `staging/BULK_REMINDER_RECONCILIATION_VERIFICATION_20261023.json`.
