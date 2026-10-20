# Staging quote change-request migration reconciliation

October 20, 2026. Verified quote change-request commit `c5a3a98` is pushed to main
and `codex/quote-change-safety`, with deployment skipped. **CRM Staging in ATS now
has exactly94 migrations**, including the unchanged
`20261020051222_atomic_customer_quote_changes.sql`.

Only the staging database was upgraded. No app was deployed, and production
received no database, configuration, credential or customer-data changes. The
new reconciliation profile, read-only verifier, tests and evidence notes are local
on `codex/staging-quote-change-reconciliation`, based on the pushed main commit.

## Exact reconciliation

Fresh reads verified the assigned healthy staging project, ATS organization,
physical database identity, normal non-superuser `postgres` owner, absence of
protected-role membership, exact93-entry ledger, complete prior catalog/ACL/default
seals, empty application state, OFF automation/scanning and active no-send Auth
hook. Auth/API configuration fingerprints matched the existing active profile.

A new empty local database replayed the original93 files through CLI2.121.0. Only
that database received the existing provider-default/object-grant fixture and
reviewed reconciliation. Its complete catalog matched hosted staging before the
upgrade. The unchanged guard's local installer then ran in that dedicated guarded
rehearsal database; no cluster role or existing review database was changed.

Applying the exact94th migration produced the reviewed target:

| Evidence | Result |
| --- | --- |
| Complete application catalog | 4,756 entries, exact local/hosted match |
| Additions | One private receipt table, eight columns, six constraints, three indexes, two routines |
| Existing objects changed / removed | 0 / 0 |
| Exact ledger | 94 original version/name pairs; no repair or synthetic baseline |
| Public relation/routine ACL seal | `8b0316b65635e29109f13825efc30531` |
| Shape seal | `30d5ccf71e80f0c5d8b752f52b9b66e0` |
| Ledger seal | `b9ff1828a742480f9d343015ff0c89e7` |
| Migration-owner named default API grants | 0, unchanged |
| Protected managed/default/global privileges | Unchanged |
| Business/Auth/file/queue counts; private retry receipts | 0 |
| Automation and scan switches | OFF |
| Buckets | All eight remain private |
| Auth guard body, owner, ACL/effective access | Exact existing definition preserved |
| Effective Auth/API configuration | Unchanged |

`supabase/staging/quote-change-candidate-94.json` binds the immutable93 candidate,
old manifest/catalog query and new migration bytes. Historical92/93 profiles and
all94 application migration files remain unchanged. Their historical verifiers
continue to reject a94-entry target rather than silently accepting a new release.
The existing active-guard checker can now verify an explicitly selected reviewed
candidate; its default93 installation/review behavior remains frozen.

## Upgrade and recovery evidence

A fresh private CLI work directory contained exactly94 checked migration files,
a minimal seed-disabled configuration, and no app env, copied provider credentials,
role import or checkout linkage. Every hosted command explicitly named the assigned
staging ref. The dry run selected only the94th file, no seeds or roles. Application
used `--skip-vault`; no reset, Auth push, history repair or deployment ran.

The same CLI upgrade was first tested locally with a deliberate final-statement
failure. The entire schema/ledger change rolled back to93. Replacing that temporary
local probe with the original bytes succeeded; repeating locally was a no-op.

Before the hosted push, project/physical identity, complete93 preimage and ledger,
active guard and fresh effective config were checked again. The hosted file ran
once. Post-apply catalog and delta matched local rehearsal exactly. The independent
new read-only verifier passed, and a second hosted dry run reported up to date
with no migrations, seeds or roles pending. No automatic rollback or reapplication
was used to obtain these results.

## Tests and security

- **824 regular CRM unit/PostgreSQL regression results passed**, no failures/skips.
  Seven new candidate cases cover immutable sources and unknown inventory,
  exact ledger/catalog/ACL/defaults, current guard/physical identity/config/freshness,
  nonempty state/active switches, and production/write flags refused before I/O.
- **201 local pgTAP assertions passed**, under the normal migration owner. These
  retain all existing financial, employee/access, scheduling, storage and defaults
  checks. The25 new assertions exercise the portal command, real role grants,
  replay without duplicate note/revision/audit/receipt, pending-only cancellation,
  stale/payload rejection, refusal of a service JWT with an end-user subject,
  private receipt protection and unchanged Auth-hook denial. Fixtures roll back.
- Typecheck passed in an isolated current-source copy with synthetic configuration
  and no copied env, credentials or Netlify link. Offline schema contract and
  operational JavaScript syntax checks passed. App runtime source did not change,
  so the prior quote package's successful optimized build remains applicable.
- Real hosted effective grants permit only the service portal wrapper, deny anon/
  authenticated invocation, deny API access to the private helper/receipt table,
  and retain the same no-send Auth hook. A synthetic read-only SQL call to that
  unchanged pure hook returned503 without contacting a provider. No hosted user,
  business fixture, notification, payment or dispatcher was created/invoked.
- Hosted security advisors retain57 existing authenticated-definer warnings.
  No warnings/errors were added. The only added INFO is
  [RLS enabled without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
  for the deliberately private receipt table. Its API grants are revoked; no
  permissive policy was added to silence the notice.

An initial local test attempted to impersonate protected `supabase_auth_admin`;
normal `postgres` correctly refused. The final test checks the Auth service's
actual execute grant and invokes the pure function as its normal owner. No role
membership or permission was expanded to make a test pass.

Positive/concurrent customer workflows remain the real local verification from
`QUOTE_CHANGE_REQUEST_SAFETY.md`; hosted positive user-session/provider delivery is
not claimed here. The active email guard's earlier HTTP synthetic proof was not
replayed or replaced with an assumption of full delivery isolation testing.

## Current verification and remaining gates

From `apps/platform`, use the existing authenticated CLI and a fresh private
Management API config GET:

```sh
STAGING_SUPABASE_BIN=/path/to/supabase \
node scripts/release/verify-staging-quote-change-candidate.mjs \
  --project-ref gbyhdsuiqeslgjdnbqng \
  --auth-config-file /private/fresh-managed-config.json
```

The verifier is read-only and has no apply/deploy/config-patch capability. Unknown
source/schema/ledger/default/role/config changes, data or active switches stop it.
The original93 `--verify-active` and appointment verifier remain historical; use
this94-aware entry point for current maintenance. Earlier dated target/evidence
JSON files and the93 deferred-source inventory retain their original meaning.

Production Netlify metadata still shows the ready CSS-only deploy
`6ad6ecfc6c03786554247e4a`. The staging app remains undeployed; shared target/readiness
flags stay unassigned/false. The original review app/session, employee redesign,
financial/workflow/portal changes and parked scanner preparation remain intact.
No project API keys were retrieved, created, rotated or exposed by this reconciliation
(the CLI used its existing login, and effective config was captured only privately).

Continue the existing protected-staging runtime/access/CDN acceptance and home
scanner/restore/operator gates. This database success does not authorize an app
deploy, customer send, scanner activation or production reconciliation.

Safe results: `staging/QUOTE_CHANGE_RECONCILIATION_VERIFICATION.json`.
Private local/hosted metadata and test logs:
`/Users/noelsierra/Documents/Codex/2026-10-20/staging-94/`.

References: [Supabase migrations](https://supabase.com/docs/guides/deployment/database-migrations),
[current changelog](https://supabase.com/changelog). No provider/extension/CLI upgrade
or managed-default normalization was part of this additive reconciliation.

Publication update, October20: verified reconciliation commit `a7a8543` was pushed
to main and `codex/staging-quote-change-reconciliation`, deployment skipped. The
next local scanner-independent package is `ADMIN_ALERT_RECIPIENT_READS.md`; it
changes no staging schema, configuration or readiness state.
