# Staging migration 118 — preserved customer document terms

October 23, 2026. Complete on ATS CRM Staging only (`gbyhdsuiqeslgjdnbqng`): **118 migrations**, latest `20261023030829`. No application deployment, production query/change, key rotation, customer email or provider request occurred.

## Result and preserved work

The unchanged `20261023030829_preserve_customer_document_terms.sql` is now installed through the native Supabase CLI. It adds the legacy rendering binding to proposals and invoices, two known-version constraints, and an invoker trigger shared by two update triggers. All seven catalog additions match the native local rehearsal. The original 5,103 catalog objects are unchanged; the final catalog contains 5,110 objects. Existing RLS, grants, defaults, financial commands, proposal-expiry enforcement and the Auth no-send guard are preserved.

Every original field of the existing proposal/invoice records, including timestamps, revisions, scope, custom instructions, amounts and status, is unchanged. All current records have the `legacy-2026-10-22` binding. This identifies the current rendering baseline; it does not reconstruct the wording historically accepted by a customer or replace historical PDFs/emails. No wording, business rule, due date, charge or payment behavior changed.

Development includes `origin/main` through `763fd40`, retaining the independent public-site case-study improvements and the previously completed CRM work. The terms implementation at `3f12f24` is preserved. Reconciliation is on `codex/staging-document-terms-reconciliation`, pending a separate push request. The runtime-security branch and its managed Node blocker remain separate and unchanged.

## Local and staging verification

| Check | Result |
| --- | --- |
| New seed-free local stack replaying the original 117 migrations | Passed |
| Candidate upgrade with pre-existing synthetic documents | 30 assertions; DDL/data rolled back |
| Deliberately failing native 118 upgrade | Schema and native ledger rolled back together |
| Original native upgrade and repeat | 118 entries; all 117 prior complete rows/statements unchanged; repeat changed nothing |
| Permanently installed local terms / expiry commands | 30 + 30 assertions; fixtures rolled back |
| Fresh staging preflight | Exact reviewed 117 identity, ledger, catalog, protected records/settings/guard |
| Staging candidate before installation | 30 terms + 30 expiry assertions; DDL/data rolled back; full baseline unchanged |
| Native staging dry run | Only original migration 118; no seed, custom-role or Vault import |
| Permanently installed staging terms / expiry commands | 30 + 30 assertions; fixtures rolled back |
| Actual local/staging records through document renderer adapters | Four cases retain the baseline output, input records and $100 totals |
| CRM regression suite, patched local Node 22.23.4 | **2,404 passed; zero failures/skips** |
| Read-only 118 maintenance verifier and its 10 rejection/acceptance tests | Passed |
| Independent fresh schema contract, offline contract and TypeScript | Passed; no generated-type drift |
| Final native staging dry run | Up to date; zero pending migrations, seeds or roles |

The installed tests cover existing draft/sent/approved/cancelled proposals and draft/sent/paid/void invoices, immutable bindings, invalid/forged versions, ordinary edits, duplicate-request recovery and least privilege. The regression also checks expired proposal denial, committed approval recovery, revision/token/role boundaries and deadline crossing. No real customer action, email, payment or upload was exercised. Renderer acceptance uses actual SQL-produced synthetic records and the existing component adapters, not a newly hosted app or browser session. No UI/runtime code changed during reconciliation, so no new browser/PDF or optimized-build acceptance is claimed.

All 117 complete prior native ledger rows, including statement history, are unchanged. The new row exactly matches the native local rehearsal. Before/after fingerprints for 49 protected business/Auth/history sets, communication/recurring settings and the Auth guard match; quote/invoice hashes omit only the newly added version field. Its presence, default, constraints, immutability, permissions and valid values are verified separately. Automatic sending, appointment notices and recurring generation remain OFF.

Security-advisor details are unchanged after excluding observation timestamps: 33 [RLS/no-policy notices](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), 79 [authenticated definer execution notices](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), and one [leaked-password protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). This migration does not resolve that existing baseline or introduce a new finding.

## Maintenance and boundaries

`supabase/staging/document-terms-candidate-118.json` pins all 118 source hashes, the exact previous ledger seal, native final migration row, physical staging identity, full catalog seal, approval definition, document bindings/comments and protected records/settings/guard. `scripts/release/verify-staging-document-terms-candidate.mjs` checks fresh read-only evidence and refuses production refs, write/repair/deploy flags, unknown or changed migration sources, native history drift, wider rights, schema changes, invalid bindings and enabled automation. `--print-sql` emits the pinned read-only snapshot. Historical candidates and their installation observations are unchanged; use the new 118 verifier for current staging maintenance.

Private evidence: `/Users/noelsierra/Documents/Codex/2026-10-23/staging-document-terms-118/`. Full snapshots, synthetic records, local credentials and native logs remain outside Git. The task-owned local stack is stopped with its volumes preserved; unrelated development services and Impeccable files remain intact. The sanitized receipt is `staging/DOCUMENT_TERMS_RECONCILIATION_VERIFICATION_20261023.json`.

Next: obtain the owner policy decisions identified in `CUSTOMER_TERMS_REVIEW.md` before changing payment/debris override precedence, invoice deadlines, penalties, surcharge disclosures, warranty or the undated proposal default. Netlify's managed-runtime patch remains an independent release blocker. This staging reconciliation grants no app-hosting or production readiness.

Push follow-through: the verified reconciliation and preserved-terms prerequisite are now on `origin/main` through `eb916ca`, using deployment-skip markers. The next independent framework security preparation is documented in `FRAMEWORK_SECURITY_UPDATE.md`; no app deployment or production change is implied.
