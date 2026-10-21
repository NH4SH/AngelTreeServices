# Staging migration 100 — saved quote request lookup

October 21, 2026. **Complete on ATS CRM Staging only**
(`gbyhdsuiqeslgjdnbqng`). The existing 99-entry target is now the exact 100-entry
candidate. No app was deployed and production was neither queried nor changed.

## Preserved source and target

Verified request reconciliation `870b563` was pushed to main and the preserved
`codex/quote-request-status` branch. Main advanced independently with website-only
`7e98432`; merge `8d9b5c7` preserves both histories and changes. This reconciliation
starts from that main commit on `codex/staging-request-status-100`.

Before applying anything, the existing read-only99 verifier confirmed the actual
ATS organization/project and physical database identity, exact native ledger,
4,868 catalog entries, reviewed effective grants/defaults, private deny policies,
active no-send Auth guard, unchanged Auth/API configuration, and empty/OFF state.
No keys were retrieved or rotated, and no configuration was patched.

The only hosted mutation was native CLI application of the original
`20261021060037_quote_request_status.sql`:

`b6f2491ce96ba44a8902bea1587978be5e2c1415594624a37a4ec31dbc0d1420`

An isolated migration folder contained only the exact reviewed 100 files. The dry
run listed **only migration 100** with no seeds or role imports. Application used
`--skip-vault`; there was no reset, history repair, SQL rewrite, broad permission
repair, seed import, Auth change, provider action or app deployment. The original
99 ledger entries are unchanged. A repeat dry run reports up-to-date with no
migrations; the migration was not reapplied.

## Exact result

- **4,869 catalog entries**, identical to the full managed-default local rehearsal.
- One added routine: `public.resolve_quote_draft_request(uuid,jsonb,jsonb)`.
  **Zero existing catalog objects changed or removed.**
- Resolver owner `postgres`, definer, volatile for fresh post-wait reads,
  `search_path=""`, two-second lock timeout. Only `authenticated` has API-role
  execution; the function independently checks live employment/office access,
  original actor and original payload hash. Anonymous, service and Auth-hook roles
  cannot substitute. No direct private-ledger grants were added.
- Previous quote creation, standalone invoice and invoice principal metadata,
  grants and private policies remain exact. Owned/managed defaults are unchanged.
- Auth guard body/effective permissions and full Auth/API configuration
  fingerprints remain unchanged. A synthetic direct guard call still returns 503
  without sending email.
- Auth users, stored files, business rows, payment/Stripe receipts, notification
  preparation/delivery/provider history, source events and private request tables
  remain empty. Sending, recurring operations and scanning remain **OFF**.

The new read-only maintenance verifier pins the previous99 candidate and original
migration 100 bytes, exact100 ledger/catalog/ACL/default seals, one-routine delta,
physical identity, existing guard/configuration, inherited private-table checks
and empty/OFF state. It rejects production refs and write flags before reading
configuration files or invoking tools. All earlier candidates/active profiles
remain historical and unchanged; the deferred fingerprints stay intact for those
older verifiers. No hosting readiness is granted by this review.

## Verification

- New empty local replay with the same previously reviewed provider defaults and
  object grants: original 93 → 99 baseline exactly matches observed staging99.
  Upgrade 99 → 100 succeeds. Deliberately failing migration 100 rolls back the
  schema **and native ledger**; a second normal upgrade run changes nothing.
- **2,108 regular platform results pass**, including ten new candidate-verifier
  cases covering source/ledger drift, wrong project/physical identity, stale
  evidence, inherited policies/private queues, changed guard/configuration,
  widened grants, altered resolver metadata and write-flag rejection.
- **295 pgTAP assertions across 15 existing suites pass** under normal local
  `postgres` in a separate synthetic clone; every suite rolls back its fixtures.
- **47 actual SQL scenarios /50 TAP results pass** against the locally rehearsed
  commands: 23 read-only lookup scenarios, 19 durable creation scenarios and five
  concurrent creation races. They cover real READ ONLY transactions, commit/
  rollback, same-request lock waits, timeout uncertainty, stale snapshot refusal,
  original actor/body checks, contact inactivity, later edits/approval/deletion,
  revocation/offboarding while waiting and original creation/audit atomicity.
- **18 actual hosted read-only permission denials** pass, including anonymous,
  no-subject and nonexistent-subject calls, service-role substitution and private
  ledger reads. No hosted synthetic users, customers, quotes or receipts were
  inserted. Existing service-only absent-invoice behavior and the 503 guard pass.
- Independent final read-only 100 verifier passes with fresh managed configuration.
  Complete catalog matches the local rehearsal, exact ledger prefix is retained,
  all empty/OFF and guard/default checks pass, and the repeat dry run is empty.
- Isolated Node22 typecheck and optimized build pass with the new verifier/test
  source overlays, synthetic settings, no copied credentials and no linked site.
  Offline schema 100 fingerprints and whitespace checks pass. Application/native
  runtime source is unchanged by this reconciliation.
- Shared local review environment is preserved: all **110 public row sets**,
  function definitions, native ledger, policies, constraints, buckets and scan
  switches exactly match the pre-test baseline. Migration100 was installed only
  in disposable local databases and the authorized staging target.

## Advisor disposition and remaining gates

Staging security advisors: **61 → 62 WARN; 31 INFO unchanged**. Every old finding is
preserved; the sole added finding is
`authenticated_security_definer_function_executable` for the new resolver.
This narrow execution grant is intentional: the mobile user's verified session
must call a routine that reads a private receipt ledger. Empty search path,
current staff checks before/after waiting, original actor/full-body binding,
explicit denial of other API roles and actual denial tests protect that boundary.
The warning is documented, not hidden or resolved by broadening table access.
There are **no unexpected new findings**.

This completes schema/permission reconciliation, not hosted app or native-device
acceptance. No positive mobile workflow was run against hosted staging because it
remains empty and the app is not deployed there. Native XCTest/Xcode/device and
real Keychain/lock-unlock acceptance remain outstanding from the earlier mobile
package. Scanner connection/activation, hosted runtime/access acceptance and
other release gates remain. Production receives none of these migrations or
settings through this task.

Files added: this report; `supabase/staging/request-status-candidate-100.json`;
`apps/platform/scripts/release/verify-staging-request-status-candidate.mjs`;
`apps/platform/tests/staging-request-status-candidate.test.mjs`. The staging/test
READMEs point to the new maintenance verifier. No application feature code or
historical migrations/candidates were edited.

Private evidence:
`/Users/noelsierra/Documents/Codex/2026-10-21/staging-100/`.
