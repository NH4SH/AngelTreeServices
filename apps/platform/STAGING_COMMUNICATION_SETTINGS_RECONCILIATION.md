# Staging migration 122 — reliable communication-default editing

October 23, 2026. Complete on ATS CRM Staging only (`gbyhdsuiqeslgjdnbqng`): **122 migrations**, latest `20261024010036`. The verified settings-save implementation is pushed normally to main as `d5a3940`, preserving the website-only update `8158e7c`. No app deployment, production query/change, customer email, provider request or key rotation occurred.

## Installed result

The unchanged `20261024010036_communication_settings_edit_permissions.sql` is installed through the native Supabase CLI. It grants authenticated users UPDATE on the 17 existing editable settings columns, under the unchanged owner/admin and fresh effective-access RLS rules. There is no table-wide write grant, INSERT/DELETE privilege, identity/timestamp write, new privileged routine, default-privilege change or RLS rewrite.

The full hosted catalog still has **5,111 objects**. Only the 17 intended column ACL entries differ from staging's own reviewed baseline; their installed values match the fresh native local rehearsal. Existing table grants, RLS policies, triggers, command definitions, claim fences, payment behavior, document/approval terms and all other catalog entries remain byte-identical. The new complete native migration entry matches the local installation, and all original 121 ledger rows, including statement history, are preserved.

All **49 protected business/Auth/history sets**, communication defaults, recurring defaults and the no-send Auth guard match the original baseline. Automatic sending, appointment notices and recurring generation remain OFF. No historical message is retried or reset, and installing the grants does not invoke a sender or prepare new communications.

## Verification

| Check | Result |
| --- | --- |
| Fresh seed-free owned local database | Original 121 migrations replayed without a shared reset |
| Local candidate transaction | **47 assertions**; candidate grants and synthetic fixtures rolled back exactly |
| Deliberately failed native upgrade | Permission/catalog changes, records and native ledger rolled back together |
| Native local installation and repeat | 122 entries; original 121 complete entries and records preserved; repeat unchanged |
| Installed local checks | **47 assertions**, fixtures rolled back exactly |
| Fresh staging preflight | Exact pinned 121 physical identity, native history, catalog, protected state and OFF controls |
| Staging candidate transaction | **47 assertions**; only 17 editable column grants differ, followed by complete rollback |
| Targeted staging installation | Only original migration 122; no seeds, custom roles or Vault import |
| Installed staging checks | **47 assertions**; all fixtures rolled back, protected state unchanged |
| Repeat native dry run | Up to date; zero pending migrations, seeds or role imports |
| Read-only 122 maintenance | Fresh hosted observation and **10 acceptance/rejection tests** passed |
| Complete CRM regression suite | **2,645 passed**, zero failures/cancellations/skips |
| Fresh native schema, offline fingerprints, route types, TypeScript, framework floor | Passed on Node 22.23.4; generated types and original migration sources unchanged |
| Security advisors | Exact before/after equality on local and staging; no new findings |

Native SQL uses ten synthetic identities and a benign numeric offset inside caller-owned rollback transactions. It checks owner/admin access against stored roles, denial for other roles, disabled profiles, separated employment, removed membership, missing subjects and spoofed user metadata. Protected columns and database constraints remain enforced. Stale versions update zero rows; the current version returns one acknowledgement. The sending switches stay OFF throughout. These are native database authorization checks using simulated session claims; no deployed staging browser or hosted Auth-session acceptance is claimed.

The settings implementation's existing real local Auth/API concurrency, lost-acknowledgement and rendered form verification remains in `COMMUNICATION_SETTINGS_SAVE_SAFETY.md`. No app/UI source changed during this reconciliation, so its optimized build/browser tests were not repeated. This batch adds only staging maintenance evidence, a read-only verifier and its tests. Clean checks copied no ignored environment files or provider credentials and recorded zero external application requests.

The first post-installation native dry run received a temporary CLI database-login authentication failure. Its evidence is retained privately. A subsequent initialization succeeded and reported up to date; no password, role, key or setting was manually changed. An initial read-only verifier invocation omitted the explicit CLI path and could not launch it; rerunning with the reviewed binary passed. Neither diagnostic altered database state.

The existing hosted security-advisor baseline remains **80 findings**: 79 authenticated-definer notices and one leaked-password-protection warning. Exact before/after equality is verified. This grants-only reconciliation did not change those routines or settings. The separate managed-runtime follow-up remains separate.

## Maintenance and release boundary

`supabase/staging/communication-settings-candidate-122.json` pins all 122 original source hashes, physical staging identity, complete previous ledger seal, exact native installation entry, full catalog seal, document/approval bindings and protected state. `scripts/release/verify-staging-communication-settings-candidate.mjs` is read-only and rejects production targets, write/deploy flags, altered source/history, broadened grants, protected-column writes, RLS drift, changed protected records/guard and enabled automation. Its `--print-sql` mode returns only the pinned read-only snapshot. Older candidates/reports remain unchanged historical checkpoints; use the new 122 verifier for current staging maintenance.

This completes only targeted staging database reconciliation. It does not authorize an app release or production migration. The existing deferred inventory remains marked not ready for hosting/production; its historical entries are not installation instructions. Existing owner-policy, real mailbox/device/assistive-technology and managed-runtime follow-ups remain in the same roadmap.

Only the newly owned loopback database was stopped after verification, retaining its data. Shared databases, the scanner and the separate runtime-security worktree at `06580f6` were untouched. Main is included through `d5a3940`; this reconciliation is saved locally on `codex/staging-settings-save-122`, pending a separate push request.

Private evidence: `/Users/noelsierra/Documents/Codex/2026-10-23/staging-settings-save-122/`. Sanitized receipt: `staging/COMMUNICATION_SETTINGS_RECONCILIATION_VERIFICATION_20261023.json`. Raw snapshots, identities, credentials and logs remain outside Git.
