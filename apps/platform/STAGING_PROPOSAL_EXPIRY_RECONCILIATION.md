# Staging migration 117 — proposal expiry

October 22, 2026. **Complete on ATS CRM Staging only** (`gbyhdsuiqeslgjdnbqng`). The target is now at 117 migrations, latest `20261023015338`. No application deployment or production query/change occurred.

## Pushed work and preserved history

The verified proposal-expiry batch is pushed to `origin/main` as `d60b455`, using deployment-skip markers. It includes current main's public-site work and preserves prior customer branding, dashboard, employee and financial/communications work. The completed reconciliation records and maintenance tools are local on `codex/staging-proposal-expiry-117`, pending a separate push request.

The unchanged candidate is `20261023015338_enforce_proposal_expiry.sql`, SHA-256 `4613dead83cc6e13bb08282043f3945f417880d661e7821410570e99eb7eb230`. No existing migration was edited, renamed or repaired. The historical 93-candidate deferred-source inventory remains a source pin, not the current hosted installation status.

## Local verification

A new, seed-free disposable CLI stack replayed the original 116 migrations. A deliberately failing private copy of migration 117 rolled back both its function change and its native history entry. The original migration then upgraded the stack to 117, preserving every complete original ledger row, including statement history. A repeat native upgrade changed nothing, and explicit SQL reapplication retained the same routine and ledger.

All 30 installed-schema synthetic assertions passed: past-date staff/customer denials, future/null dates, committed-result recovery, late tentative-work rollback, token/role/revision gates and historical approved-record repair. Every synthetic test transaction rolled back. The expected complete approval-definition SHA-256 is `7a958f1e24fc415cf05adde8594369b15d130d3a6cdf80dcf9e84751ff4ae52f`.

Schema generation and an independent fresh schema check passed against that native 117 database; the offline contract check also passed. Public TypeScript types are unchanged. The generated manifest now includes the original migration 117 bytes. All **2,388 CRM checks passed**, zero failed/skipped, including nine source/target/freshness/history/permission/automation verifier cases. A focused expiry/approval/verifier run passed 29 results. No application runtime code changed during reconciliation; the previously verified expiry build and typecheck remain applicable.

## Hosted installation and acceptance

The connected Supabase tool and fresh native CLI checks confirmed the healthy ATS CRM Staging project on PostgreSQL 17.11. Before installation, its exact 116-entry ledger and approval SHA-256 `36084c2a32e363ccc5d2fec8e6d2b2e0f25c0debcf7db18de619c155e827d2ef` matched the reviewed preimage. The owner's renewed CLI sign-in resolved the earlier 403. No credentials were copied into source or reports.

The native dry run selected **only migration 117**, with no seeds or custom roles. The exact original file was installed using the pinned CLI and explicit staging ref in an isolated migration folder, with `--skip-vault`. No reset, history repair, SQL rewrite, broad permission repair, seed/role import, Auth configuration change or app deployment was performed. All 116 complete prior native ledger rows, including statement text, are unchanged. The new entry exactly matches the native local rehearsal.

After installation, the catalog still has **5,103 objects**. Only the body of `app_private.approve_quote_locked(uuid,integer,text)` changed; no object was added or removed. Its complete definition matches the local rehearsal. Owner `postgres`, definer/volatile properties, empty search path, five-second lock timeout, arguments/result and owner-only EXECUTE ACL are unchanged. All other catalog objects, RLS policies, constraints, triggers, grants and managed/owned defaults match the preflight.

All **30 installed-schema synthetic assertions passed against the permanently installed staging command**. They cover past-date staff/customer rejection, future/undated acceptance, saved-approval recovery, deadline crossing during tentative work creation, role/revision/token boundaries and historical repair. The complete test transaction rolled back. Before/after fingerprints for 49 protected business/Auth/history sets, communication/recurring settings and the no-send Auth guard match. Automatic sending, appointment-change notices and recurring generation remain OFF; no email or provider request was made.

The independent read-only maintenance verifier passed with fresh evidence after installation. The final native dry run reports **up to date**, with zero migrations, seeds or roles. An earlier overlapping CLI check reported a temporary login authentication failure; the sequential repeat succeeded. It did not reapply the migration. An independent connected-tool read also confirms both wall-clock guards and the expected definition SHA-256.

Security advisor details are unchanged: 33 [RLS/no-policy notices](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), 79 [authenticated definer execution notices](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) and one [leaked-password protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). This migration does not resolve that existing baseline or add a new finding.

## Reviewed maintenance candidate

`supabase/staging/proposal-expiry-candidate-117.json` pins all 117 original source digests, exact previous native statement history, final native migration row, physical staging identity, 5,103-object catalog metadata/seal excluding only the changed approval body, its unchanged owner/settings/ACL, and protected hashes for 49 business/Auth/history sets, communication/recurring settings and the Auth email guard. The actual installed target passed this candidate. It does not confer production or application-hosting readiness.

`scripts/release/verify-staging-proposal-expiry-candidate.mjs` is read-only and rejects production refs, write/repair/deploy flags, stale evidence, changed source bytes, unknown migrations, history drift, widened rights, unexpected schema/body changes, altered protected state and enabled automation. `--print-sql` emits the pinned read-only snapshot for use through the authorized connected Supabase tool. Earlier candidate files and their seals are unchanged. This review does not grant hosting readiness.

Private evidence: `/Users/noelsierra/Documents/Codex/2026-10-22/staging-proposal-expiry-117/`. Local credentials, full native ledgers, raw snapshots and logs remain outside Git. The machine-readable status is `staging/PROPOSAL_EXPIRY_RECONCILIATION_VERIFICATION_20261022.json`. Task-owned local services were stopped with their volumes preserved; existing review apps/databases and Impeccable artifacts were preserved.

The hosted staging app was not redeployed or browser-tested with the new UI. The earlier local customer-page acceptance remains in `PROPOSAL_EXPIRY_ENFORCEMENT.md`. Future application release and any production migration remain separate authorizations. The existing terms-consistency follow-up still requires owner decisions about payment/debris overrides, deadlines, penalty/warranty clauses and undated proposals; none were changed here.
