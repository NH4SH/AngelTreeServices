# Staging migration 119 — proposal follow-up expiry

October 23, 2026. Complete on ATS CRM Staging only (`gbyhdsuiqeslgjdnbqng`): **119 migrations**, latest `20261023205744`. The verified expiry implementation is pushed to main as `bf0d794`. No application deployment, production query/change, key rotation, customer email or provider request occurred.

## Installed result and preservation

The original `20261023205744_guard_expired_proposal_followups.sql` is installed through the native Supabase CLI. Only the two intended routine bodies changed: the proposal-follow-up deadline predicate in `app_private.email_source_eligible` and the final post-lock eligibility check in `public.claim_outbound_delivery`. Both body hashes match the fresh native local rehearsal. Their owners, arguments, security modes, search paths, execution rights and other metadata are unchanged.

The catalog still contains **5,110 objects**. All unrelated definitions, RLS/policies, grants/defaults, financial commands, source locks, document-term bindings, proposal approval checks and the no-send Auth guard are preserved. All 118 complete prior native migration rows, including statement history, are byte-identical; the new row matches the native local installation exactly. Before/after fingerprints match for all 49 protected business/Auth/history sets and communication/recurring settings. Automatic sending, appointment notices and recurring generation remain OFF.

The existing accepted/uncertain delivery history is unchanged. Expiry stops new follow-up admission, including deadline crossing while waiting for the proposal or recipient/family lock. It does not recall a request already admitted/in flight. Future and undated proposals, ordinary deliberate document sends and existing token/recipient/claim rules retain their established behavior. No business wording, money, default validity period or grace period changed.

## Verification

| Check | Result |
| --- | --- |
| New seed-free local project replaying the original 118 migrations | Passed; no shared development database reset |
| Candidate upgrade/command verification | **27 assertions**; candidate DDL and synthetic fixtures rolled back |
| Deliberately failing native 119 upgrade | Schema, original data and native migration ledger rolled back together |
| Original native local upgrade and repeat | 119 entries; all 118 original rows/statements and application/Auth records preserved; repeat changed nothing |
| Permanently installed local and staging command checks | **27 assertions in each**; synthetic fixtures rolled back |
| Independent native local transactions | Three concurrency scenarios / four TAP results: observed proposal-lock expiry wait, observed family-lock expiry wait, two claims yielding one attempt |
| Staging preflight and candidate rehearsal | Exact reviewed 118 baseline; **27 assertions**, full prospective catalog limited to the two approved local body hashes, then complete rollback |
| Native staging installation/dry run | Only original 119 installed; final dry run up to date with no pending migrations, seed or role import; Vault import explicitly skipped |
| Read-only 119 maintenance verifier | Fresh hosted observation passed; ten acceptance/rejection tests passed |
| CRM regression suite on patched locked dependencies | **2,476 passed**, no failures/skips |
| Fresh independent schema contract, offline fingerprint, route types and TypeScript | Passed; no generated public-type drift |
| Concurrent main website compatibility | 239 interaction and nine style checks; build and validation of 18 approved pages passed |

Installed native checks exercise proposal expiry independently of link lifetime; past/exact/future/null deadlines; time passing after preparation in the same transaction; no proposal/financial mutation; accepted replay and immutable history; uncertain-result quarantine; revoked links; sending OFF; deliberate document compatibility; and service-only denial for anonymous/authenticated callers. SQL acceptance/uncertainty results are synthetic evidence, not provider calls. The independent concurrency test uses the approved integration test logic with only the new disposable target's guard/path adapted privately.

Staging fixture transactions are fully rolled back. The locally owned concurrency fixtures are isolated in the new disposable project, whose data is retained when it is stopped. Raw snapshots, native credentials, generated records and logs remain outside Git. The clean test workspace copied no ignored environment files/provider credentials and recorded zero external application requests during type checking.

Security-advisor observations are identical before/after at WARN level: 79 existing `authenticated_security_definer_function_executable` notices and one existing `auth_leaked_password_protection` warning. No new finding was introduced or existing protection setting changed. This reconciliation does not resolve that pre-existing baseline or the separate Netlify managed-runtime issue.

## Maintenance and release boundaries

`supabase/staging/proposal-followup-candidate-119.json` pins all 119 original source hashes, the physical staging identity, native migration receipt, previous ledger seal, full catalog seal, approval definition, document-term metadata and protected records/settings/guard. `scripts/release/verify-staging-proposal-followup-candidate.mjs` accepts fresh read-only evidence only and refuses production refs, apply/repair/deploy flags, unknown source changes, ledger/body/privilege drift, changed protected state and enabled automation. `--print-sql` emits its pinned read-only snapshot. Historical 118 and earlier candidates remain intact; use the new 119 verifier for this current maintenance target.

Main is included through `8fed532`, preserving the independent public-site tree-removal cost/scope update and all earlier CRM work. The separate runtime-security branch remains at `06580f6`. Reconciliation is saved locally on `codex/staging-proposal-followup-expiry`, pending a separate push request. No UI or application runtime code changed here, so no new browser/PDF/mailbox or optimized-build acceptance is claimed; the expiry feature's earlier build verification remains preserved.

Private evidence: `/Users/noelsierra/Documents/Codex/2026-10-23/staging-proposal-followup-119/`. Sanitized receipt: `staging/PROPOSAL_FOLLOWUP_RECONCILIATION_VERIFICATION_20261023.json`. Only the task-owned local project is stopped after acceptance, with its data retained; unrelated development services and Impeccable files are preserved. Staging migration reconciliation grants no app-hosting, production-release or automatic-sending readiness. Owner terms-policy decisions and actual mailbox/device/assistive-technology acceptance remain in the existing roadmap.
