# Staging permission reconciliation — October 17, 2026

**October 18 UTC:** this original 92-file permission repair is preserved. Staging
has since advanced to the separately reviewed 93-file appointment candidate,
with no changes to old objects, policies or defaults. Use the new read-only
candidate verifier; the old repair runner intentionally rejects the new inventory.
See [appointment reconciliation](STAGING_APPOINTMENT_RECONCILIATION.md).

## Outcome and decision

The verified staging setup (`58231ef`, `87b6251`) is pushed to **main** and
`codex/pr18-staging-targets`, with deployment skipped. This follow-through
removes the unintended current application grants from **CRM Staging only**,
`gbyhdsuiqeslgjdnbqng`. Current application object ACLs now match the explicit
92-migration fresh-replay contract exactly. Normal migration-owner defaults no
longer automatically grant named API roles access to new public objects.

Keep the site undeployed. The protected-default review is now completed in
SUPABASE_MANAGED_DEFAULTS_REVIEW.md: retain those defaults for this pinned staging
candidate with the verified creator/catalog controls. Isolated mail/runtime keys,
visitor protection and scanner hosting/recovery remain gates. This is part of the existing PR18 staging sequence, not a new
roadmap or authorization to change production.

## Applied changes and scope

- **279 explicit REVOKE statements across 108 objects** remove only extra
  provider-inherited grants on 101 public relations and seven routines. All
  intended SELECT/INSERT/UPDATE/DELETE, column permissions and command EXECUTE
  grants remain. The map comes from the original migration declarations and
  fresh replay, then is exercised by real role/workflow tests.
- Three statements remove the **36 named API-role default privileges** of
  `postgres` in `public` (tables, sequences, routines). Owner rights remain.
- Redundant managed public-schema USAGE for anon/postgres is preserved; browser
  CREATE remains forbidden. Explicit service privileges remain as declared,
  including any administrative privileges intentionally granted by migrations.
- No GRANT, CASCADE, business-data update, routine/trigger/policy rewrite,
  global role change or production migration was used. Original migration files,
  the pinned 92-file manifest and the hosted 92-entry staging ledger are intact.

The package lives in `supabase/staging/`, outside normal migrations. The guarded
runner is `scripts/release/staging-permissions.mjs`. It validates the exact
project/organization, source hashes and inventory, normal migration owner,
reviewed catalog/ACL/ledger, empty data and OFF settings. It uses a fresh private
work directory and explicit project ref, with no existing linkage or credentials
copied. The transaction verifies its complete preimage again, applies the
reviewed revocations and checks the full postcondition before commit. A stale
snapshot, unknown permission or failed invariant aborts the whole transaction.

## Independent results

- Current public application object ACL seal:
  `edff606fc762a401d61b9c9e31989a9c`, exactly matching fresh local replay.
- Shape seal `b112c8212ae2f4bb9373f8dc626c591d` and ledger seal
  `c63edca3d116b1d41f958b0d64b6a072` are unchanged. Fingerprints are comparison
  aids, not authenticity signatures; source files also have SHA-256 bindings.
- The security advisor's **anonymous SECURITY DEFINER warning is removed**.
  An independent catalog query finds zero application public definers executable
  by anon. The invoice/change-order helper retains authenticated access.
- Real HTTPS anonymous customer reads, the invoice helper and invoice void now
  return **401 / 42501**. Auth remains restricted to staging URLs with public
  signup disabled and the email/password provider enabled.
- Re-running `--apply` reports **changed:false** and verifies the same contract
  without applying another repair.
- All eight buckets remain private; 0 Auth users, files, customers, jobs, quotes,
  invoices, payments, communications, calendar connections and Stripe receipts
  remain on staging. Communication/recurring automation and seven scan switches
  remain OFF. No customer/provider operation or email was sent.

## Protected defaults and PostgreSQL semantics

The normal hosted account is `postgres`, not superuser, and is not a member of
`supabase_admin`. Its protected managed-role defaults cannot be changed through
that account. All three managed-role default ACLs are preserved byte-for-byte;
no role membership, ownership transfer or privilege escalation was attempted.
They still grant future API rights for objects created by that managed role.
Only `postgres` is allowed to create application objects in the reviewed staging
process. Provider-created public objects require a fresh review; the frozen
runner rejects unknown schema/ledger/privilege changes.

Also, PostgreSQL adds schema-specific defaults to global defaults. Revoking
schema-specific named grants does **not** remove implicit global PUBLIC EXECUTE.
New functions therefore still require explicit PUBLIC revocation and reviewed
caller grants in their creation transaction. The seven local defaults assertions
prove this with disposable objects, including positive evidence of the implicit
grant and its removal by explicit per-function REVOKE. Global managed defaults
were deliberately left alone. This package does not claim to solve all future
function exposure by changing three default ACLs.

The inventory records current-object reconciliation, migration-owner default
success and the completed managed-default policy review separately. Full
provider/default normalization remains false: the three protected entries are
retained, not restricted. No provider change is required for the current pinned
candidate under the reviewed creator/catalog controls. Recheck before release;
do not seek broader database privileges to make a status flag pass. The runner
now also rejects protected-role membership explicitly. See
SUPABASE_MANAGED_DEFAULTS_REVIEW.md for the measured risks and review limits.

## Local tests and preserved workflows

- A new disposable database was built with the actual CLI: original 65-entry
  baseline followed by all 27 pending migrations, ending at **92/92**. No review
  database reset, data import or global role modification occurred.
- The exact observed staging grants/defaults were reproduced only in that new
  database. A forced postcondition failure verified **complete rollback**;
  valid reconciliation and a second idempotent application passed under normal
  non-superuser `postgres`.
- **714/714 regression tests pass**, including ten new guard/source/target tests.
- **160/160 pgTAP assertions pass**: all eight existing database files (124),
  plus 29 new role/workflow assertions and seven default-grant probes. Owner,
  admin, estimator and payroll draft creation, crew/customer denials, HR
  visibility, offboarding with stale identity claims, role retention,
  reactivation, separate clock review, audit history, financial protections,
  scheduling/source integrity, storage grants, rate limits and health/search
  contracts are covered.
- Three old database fixtures failed identically on the untouched canonical
  baseline before reconciliation. Tests now call the existing request-identity
  payment command, current scheduling signatures/revisions and guarded manual
  schedule command. Duplicate creation must preserve the existing visit rather
  than overwrite it. The selected estimator fixture now has its required active
  employee row. No application function or behavior changed to satisfy tests;
  no assertion was skipped. The legacy payment helper's denial is also asserted.
- Typecheck passes. No app runtime source changed, so a new app build was not
  necessary for this operations/test package. The active local app still returns
  health200, its original owner is active, and recurring automation is OFF.

Tests use synthetic data and SQL role/claim switching in rolled-back local
transactions. They do not claim hosted UI/session, provider adapter or live-file
transport verification. Those need a separately approved protected staging run.

## Preservation and remaining work

Production remains at **65 migrations**, published CRM deploy
`6ad23c757dfc53f702ae00b9`. No production SQL write, configuration, key, customer
data, financial record, file, communication or deployment changed. Employee UI,
iOS, all earlier implementation work, original Netlify configuration, shared
unassigned target manifest and the existing local review environment are intact.

Current object grants and normal migration-owner named defaults are verified;
the protected-default decision is documented and locally tested. Full readiness
remains false for Netlify visitor
protection on the current plan, isolated Auth templates/mail and server/runtime
key binding, scanner host/TLS/operator and paired source-object/database recovery.
No paid upgrade or scanner provision was made. Continue these existing PR18
gates before requesting any staging deployment; production has its own separate
reconciliation/cutover approval.

Private evidence: existing Codex `work/staging-permissions/` plus the runner's
private temporary result directories. No key values are in these documents,
SQL/profile files or Git. Inventory: `staging/PROVISIONED_TARGETS.json`.

References: [Supabase API grants](https://supabase.com/docs/guides/api/securing-your-api),
[PostgreSQL 17 default privileges](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html),
[anonymous definer advisory](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).
The remaining 26 INFO deny-by-default RLS notices and 56 authenticated-definer
entry-point warnings are unchanged; they are not a reason to grant public access
or remove the CRM's guarded transactional commands.
