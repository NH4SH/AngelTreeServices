# Staging migration 123 — atomic record reminder controls

October 23, 2026. Complete on ATS CRM Staging only (`gbyhdsuiqeslgjdnbqng`): **123 migrations**, latest `20261024014934`. The verified atomic reminder-toggle implementation is pushed normally to main as `53307ec`. The subsequent website-only commit `a0e2082` is preserved by fast-forward. No app deployment, production query/change, customer email, provider request or key rotation occurred.

## Installed result

The unchanged `20261024014934_atomic_record_reminder_automation.sql` is installed through the native Supabase CLI. It adds only `public.set_record_reminder_automation(text,uuid,boolean,timestamptz)`, a SECURITY INVOKER command with an empty search path and a two-second lock timeout. Execution remains authenticated-only, with fresh stored-role/effective-access checks for the existing staff roles. There is no service-role fallback, privileged routine, table/column grant, RLS rewrite, default-privilege change or sender invocation.

The flag and matching pending automatic reminder cancellations commit or roll back together. Stale versions and changed parents require reload; cancellation failure or timeout cannot leave a partially saved disable. Disabling invoice reminders preserves payment confirmations and manual reminders. Processing and all other nonpending history are retained. Enabling does not prepare a new message, resurrect a cancelled message or retry old deliveries. Existing source-column rights, send-time eligibility, claim fencing and accepted/uncertain outcome holds remain authoritative.

The hosted catalog now has **5,112 objects**, up from 5,111: only the reviewed invoker command is added, matching its fresh native local definition, owner, execution rights and settings. Every original catalog entry is unchanged, including RLS, table/column permissions, triggers, financial commands, document terms, proposal expiry and prior recovery controls. The new complete native migration entry matches the local installation; all original **122 complete ledger rows**, including statement history, are preserved.

All **49 protected business/Auth/history sets**, communication defaults, recurring defaults and the no-send Auth guard match the original staging baseline. Automatic sending, appointment notices and recurring generation remain OFF. No message is claimed, dispatched or retrospectively reopened by reconciliation.

## Verification

| Check | Result |
| --- | --- |
| Fresh seed-free owned local database | Original 122 migrations replayed without a shared reset |
| Local candidate transaction | **58 assertions**; DDL and fixtures rolled back exactly |
| Deliberately failed native upgrade | Command/catalog changes, records and native ledger rolled back together |
| Native local installation and repeat | 123 entries; original 122 complete entries and records preserved; repeat unchanged |
| Installed local SQL checks | **58 assertions**, all fixtures rolled back |
| Actual installed local Auth/SDK/action checks | **28 scenarios / 29 TAP results**, including observed lock waits and lost-response recovery |
| Fresh staging preflight | Exact pinned 122 physical identity, native history, catalog, protected state and OFF controls |
| Staging candidate transaction | **58 assertions**; only the reviewed invoker command added; complete rollback |
| Targeted staging installation | Only original migration 123; no seed, custom-role or Vault import |
| Installed staging SQL checks | **58 assertions**; fixtures rolled back and protected state unchanged |
| Repeat native dry run | Up to date; zero pending migrations, seeds or role imports |
| Read-only 123 maintenance | Fresh hosted observation plus **10 acceptance/rejection tests** passed |
| Complete CRM regression suite | **2,663 passed**, zero failures/cancellations/skips |
| Fresh native schema, offline fingerprints, route types, TypeScript, framework floor | Passed on Node 22.23.4; generated types and original migration sources unchanged |
| Security advisors | Exact local and staging before/after equality; no new findings |
| Concurrent main website compatibility | **239 JavaScript + 9 Python tests**, public build and validation of **18 pages** passed |

Native SQL uses ten synthetic identities inside caller-owned rollback transactions. It checks actual stored-role/RLS behavior for allowed staff and denied nonstaff, disabled profiles, separated employment, removed membership, missing subjects and spoofed metadata. It verifies pending reminder scope, retained receipts/manual/nonpending history, unchanged financial fields and cancellation-failure rollback. Candidate and installed runs preserve all protected state and OFF switches.

Actual local API acceptance uses real local Auth sessions, the Supabase SDK, PostgREST transactions and the existing action. For both quotes and invoices, simultaneous old-version toggles yield exactly one writer after an observed lock wait. Parent changes during a wait require reload; an already processing row retains its claim; queue-lock timeout rolls back both flag and cancellation writes. A deliberately lost committed response cannot repeat the old toggle. Pre-forward HTTP failures preserve state. Standalone quotes and organization-only invoices keep the same behavior. No real provider is called.

Hosted SQL authorization tests use synthetic identities and simulated session claims. No deployed staging app, hosted Auth-session/browser, mailbox, physical-device or spoken assistive-technology acceptance is claimed this turn. The implementation's prior optimized CRM build and rendered keyboard/stale/reload proof remain in `RECORD_REMINDER_AUTOMATION_SAFETY.md`; they were not repeated because application/UI source is unchanged. Clean local checks copied no ignored environment files or provider credentials and recorded zero external application requests.

The existing hosted security-advisor baseline remains **80 findings**: 79 authenticated-definer notices and one leaked-password-protection warning. Exact before/after equality is verified. This command-only reconciliation does not change those routines or settings. The separate managed-runtime follow-up remains separate.

The public compatibility command initially selected the Mac's old system Python 3.9, which cannot parse existing modern f-string syntax. All 239 JavaScript and nine Python tests had passed; rerunning only the build and validator with the already installed Python 3.13.16 succeeded. No website source or dependency change was needed.

## Maintenance and release boundary

`supabase/staging/record-automation-candidate-123.json` pins all 123 original source hashes, physical staging identity, complete previous ledger seal, exact native installation entry, full catalog seal, document/approval bindings and protected state. `scripts/release/verify-staging-record-automation-candidate.mjs` is read-only. It rejects production targets, write/deploy flags, altered source/history, command/body/config drift, broadened execution rights, RLS drift, changed protected records/guard and enabled automation. Its `--print-sql` path returns the pinned read-only snapshot. Use this 123 verifier for current staging maintenance; older candidates and receipts remain unchanged historical checkpoints.

This completes only targeted staging database reconciliation. It does not authorize an app release, production migration, automatic activation or historical resend. The deferred inventory's existing release hold remains intact; its historical entries are not instructions for unrestricted installation. Owner terms-policy, mailbox/device/assistive-technology and managed-runtime follow-ups remain in the existing roadmap.

Only the newly owned loopback database was stopped after verification, with its synthetic data retained. Shared databases, the scanner, existing local work and the separate runtime-security worktree at `06580f6` were untouched. Main is included through `a0e2082`, containing pushed fix `53307ec`. This reconciliation is saved locally on `codex/staging-record-automation-123`, pending a separate push request.

Private evidence: `/Users/noelsierra/Documents/Codex/2026-10-23/staging-record-automation-123/`. Sanitized receipt: `staging/RECORD_REMINDER_RECONCILIATION_VERIFICATION_20261023.json`. Raw snapshots, identities, credentials and logs remain outside Git.

## Push and communications follow-through

The verified reconciliation is pushed normally to main as `cee29fc`. `REMINDER_CANCELLATION_SAFETY.md` documents the next verified local batch: scheduled-reminder cancellation checks the displayed version, preserves worker/nonpending history and reports reviewable outcomes. It needs no migration. Local/staging synthetic checks preserve the exact 123 staging baseline, no-send Auth guard and OFF controls. No app deployment, production change, activation or historical resend occurred.
