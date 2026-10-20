# Connected CRM workflow acceptance

Verified October 20, 2026. Continues the existing staging/PR18 roadmap.
**The connected local workflow passes. No application fix was needed.**

## Published preparation and preserved work

The verified staging credential preparation `b86a14d` is now pushed to main and
`codex/staging-credentials-access` through `a88bce2`. This also preserves the
independent public-site cookie-notice update `e6c5c30`. Merge/push commits include
`[skip netlify]`. Neither application was deployed. The employee redesign,
PR01–PR18 work, production services and all existing release gates are intact.

## Connected acceptance result

The new opt-in `tests/crm-workflow.integration.test.mjs` uses the existing local
Auth/Data API and current commands. It follows **one customer and one job**, rather
than replacing each phase with an unrelated fixture:

1. A synthetic website submission creates its customer/property/lead. Retrying
   returns the same lead; its notice remains pending, with no dispatcher called.
2. The office admin creates and edits the linked quote. The mobile HTTP detail
   route returns the reviewed amount. A stale approval is rejected; current and
   repeated approvals keep the original lead as one accepted work order.
3. A real crew employee is assigned through the work-session command. Explicit
   completion closes the visit, retains its crew and completion provenance, and
   creates no invoice implicitly.
4. Invoice generation retains customer/property/quote relationships, source
   pricing and the completion timestamp. Repeating the request returns the same
   invoice. Manual delivery records the office action without sending email.
5. A synthetic $240 cash payment brings the balance to zero. Repeating its
   request retains one payment and one payment audit event. Intake, approval and
   work-completion history also each appear once.
6. Anonymous and crew money commands fail. The owner deactivates only the new
   admin; the exact original issued JWT immediately loses access, including
   prior invoice/payment requests. Reactivation restores access/previous roles;
   time-clock permission remains disabled for separate review.

The final test passed with strengthened relationship, assignment and cleanup
assertions. All three new actors were globally signed out and verified disabled/
separated afterward. Synthetic records and audit history remain. The test's
clients explicitly allow only127.0.0.1:54321 and127.0.0.1:3102; no outbound request
was attempted by that transport. No payment/email provider or hosted key was used.
The mobile route exercises the real local server, not a mocked route handler.

Before the connected test, fingerprints were captured for all pre-existing rows
in15 core tables: roles, profiles, role assignments, employees, clock permissions,
customers, properties, jobs, quotes/lines, invoices/lines, payments and visit/
assignment records. After both connected runs, every original fingerprint was
still present; the ledger and constraint fingerprints were unchanged. This
preservation check is scoped to the connected runs, not a claim to have compared
all original business rows before the earlier nine independent suites.

## Existing integration regression results

All suites ran **sequentially** against the existing named disposable stack.
Counts below include their parent/subtest results; no suite failed or skipped.

| Suite | Passing results |
| --- | ---: |
| Transactional website intake | 23 |
| Atomic quote editing | 26 |
| Quote approval/work-order concurrency | 23 |
| Atomic scheduling | 30 |
| Explicit job completion | 37 |
| Atomic invoice generation | 31 |
| Invoice authorization/voiding boundary | 26 |
| Stripe webhook recovery with controlled provider doubles | 29 |
| Ordered payments/refunds with controlled provider doubles | 24 |
| **Existing suites** | **249** |
| New connected journey | **1** |

These exercise actual local Auth, RLS, transactions and independent locks. The
existing suites' temporary fault constraints/triggers are scoped to synthetic
fixtures and removed in their existing cleanup paths. No hosted migration,
production schema/data change, reset or service restart was performed.

The preserved iterative review database has68 native migration-ledger entries;
later development definitions are already present and were tested directly. Its
ledger was not rewritten to93 or treated as a fresh replay. The earlier separate
93-migration rehearsal/hosted reconciliation evidence remains historical; no new
full replay or hosted comparison is claimed here.

The **800 ordinary CRM checks**, **155 public-site JavaScript checks**, public
build/validation, typecheck and offline migration/type contract all pass after
merging main. Only an opt-in integration test and documentation/evidence were
added; application build inputs are unchanged, so no new Next build is claimed.
The normal local app still returns health200; the user's browser session remains
untouched. No scanning or communication automation was activated.

Safe evidence: `staging/LOCAL_WORKFLOW_ACCEPTANCE_VERIFICATION.json`. Private logs
and record fingerprints are outside Git in
`/Users/noelsierra/Documents/Codex/2026-10-20/local-workflow-acceptance/`.

## Remaining protected staging acceptance

**Everything below is pending hosted proof.** This is the remaining checklist in
the existing roadmap, not deployment authorization. Local passes never promote
shared manifest flags. Credential metadata is installed; secret values received
by an actual Netlify process are still unobserved.

| Area | Required hosted proof |
| --- | --- |
| Release prerequisites | Review existing scanner isolation, paired database/source-file restore, maintainer and target evidence before authorizing the first staging app build/deploy. Do not bypass preflight to make this checklist runnable. |
| Site and runtime | Verify actual SITE_ID, canonical origin, staging database/public/server-key binding and the selected source/config artifact. Report booleans/identifiers only; never return env values or tokens from a diagnostic endpoint. |
| Private entry | Anonymous documents, static/image/data routes, APIs and direct function routes must stay gated. Normal CRM login/roles remain required after the preview gate. Missing/wrong config fails closed. |
| Sessions and caches | Wrong codes, tampered/expired cookies and cross-origin writes fail; logout ends browser gate access. Authorized and denied responses retain private/no-store CDN behavior and Secure/HttpOnly/SameSite cookie controls. |
| Aliases and old deploys | Enumerate actual canonical, deploy/preview/branch, framework/skew and function paths from the real deploy. Deny unsupported hosts; verify existing/old immutable deploys do not expose an earlier ungated version. |
| Workflow and roles | Repeat the connected path with synthetic staging records, representative office/crew roles and mobile/browser checks. Verify replay, audit history and offboarding of an already issued token. Do not use production records. |
| Payments and communications | Keep provider keys, recipients, intake/worker/webhook secrets and schedules absent in the initial profile. Manual payment/delivery records test bookkeeping only; live Stripe settlement and successful customer delivery require separate test-mode activation/review. |
| Hosted Auth | Keep the no-send hook enabled. Complete the four outstanding per-route hook-message checks when the existing quota permits, without weakening limits or falling back to SMTP. |
| Files and recovery | Connect the prepared home Mac when available; verify scanner networking/identity/capacity and paired source-file/database restore. Retain quarantine/private-access rules and the OFF switches until separately approved activation. |

No hosted test, scanner connection, production request or environment change was
part of this acceptance run. `staging/targets.json`, hosting/deployment flags and
the production configuration remain unchanged. Next useful scanner-independent
work is the local role/private-file acceptance paths; actual hosting readiness
still requires the remaining scanner, restore and hosted access/runtime evidence.
