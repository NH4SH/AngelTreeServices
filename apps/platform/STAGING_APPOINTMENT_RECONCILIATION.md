# Staging appointment migration reconciliation

Verified October 18, 2026 UTC / October 17 Eastern.

## Outcome

Verified appointment safety `fcd5b73` is pushed to `main` and
`codex/atomic-legacy-appointments`, with deployment skipped. **CRM Staging only**
(`gbyhdsuiqeslgjdnbqng`, ATS) now has exactly **93 migrations**, including the
unchanged `20261018004943_atomic_legacy_appointments.sql`.

No application was deployed. Production received no database, configuration,
credential, customer-data or provider changes. The current reconciliation tools,
tests and evidence notes are saved locally on `codex/staging-93-reconciliation`,
continuing the existing PR08/PR15/PR18 release sequence.

Alignment/published-state check: a separate website-only main commit `3a1a0f1`
arrived during verification and was fast-forwarded without touching the CRM work.
Netlify independently published that commit as website deploy
`6ad41cc12fd086f697f224e8` at October 17, 21:11 Eastern (October 18, 01:11 UTC).
This task issued no deployment request. CRM deploy
`6ad23c757dfc53f702ae00b9` is unchanged; the dedicated staging site still has no
published app. Do not mistake that separate website release for a CRM deployment.

## Reconciliation evidence

Before application, the target was independently verified as healthy CRM Staging
in ATS. Its 92-entry version/name ledger, current permissions, non-superuser
`postgres` owner, lack of protected-role membership, defaults and complete
empty/OFF snapshot matched the previously reviewed candidate. All original 92
source SHA-256 hashes and the original manifest/profile remain unchanged.

A new empty local database replayed the original 92 migrations through CLI
2.121.0. The previously observed staging grants/defaults were reproduced and
reconciled only in that disposable database, without global role changes. Its
complete metadata matched actual staging before the upgrade. Applying the exact
93rd file then produced the reviewed candidate:

| Evidence | Result |
| --- | --- |
| Metadata comparison | 4,736 entries including six retained default ACL entries; exact match between local upgraded and hosted staging |
| Added catalog objects | Three columns, one revision check, two routines, one trigger |
| Existing objects changed / removed | 0 / 0 |
| Current public relation/routine ACL seal | `82b08f022523d7f5d50102ee90f0bb29` |
| Shape seal | `67eff18b8ed46fffcf3275571f4b6023` |
| Exact 93-entry ledger seal | `c30ed3945961266287b3d1d7da9f36b0` |
| Migration-owner named default API grants | 0, unchanged |
| Protected managed/global defaults | Unchanged; no normalization or privilege escalation |
| Auth users, files and reviewed business/queue counts | 0 |
| Communications, recurring and seven scanning switches | OFF |
| Storage buckets | All eight remain private |

Fingerprints aid comparison; source files are also bound by SHA-256. The new
read-only profile is `supabase/staging/appointment-candidate-93.json`. It binds
the old immutable manifest/profile and the one additive migration, rather than
rewriting the 92-migration release record. Future inventory/schema/permission
drift must receive another review.

## Application process and transaction checks

A fresh private CLI work directory contained exactly the 93 verified original
migration files, a minimal seed-disabled configuration, and no application env,
provider configuration, roles or linkage copied from the checkout. Every remote
operation named the exact staging ref. A dry run selected only the new file,
with no seeds or roles. The actual push used `--skip-vault`; no reset, history
repair, synthetic baseline, seed, Vault update, Auth push or deploy was used.

An intentional failure appended only to a temporary local copy proved that the
CLI rolls back the complete migration and its ledger entry. Replacing that
temporary copy with the verified original then passed; repeating locally was a
no-op. Hosted application ran once, and its subsequent dry run reports no pending
migrations.

The first post-apply verifier had a filename-parser bug: it assumed 14-digit
timestamps and misread historical `0001`–`0011` names. That check failed after
the migration succeeded; it did not indicate a database-history error. The
parser now reads the numeric prefix before the first underscore, with explicit
tests for both old and timestamp formats. No ledger was edited and the migration
was not reapplied to fix the verifier. A later full-catalog read needed a larger
output buffer; that was a read-only evidence retrieval issue, now resolved.

## Tests and security review

- **771 regression results passed**, without skips/failures, including nine new
  candidate verification tests: wrong target/write flags before network access,
  immutable sources, extra/missing migrations, exact historical ledger identity,
  schema/ACL/default drift, privilege escalation, and nonempty/active state.
- **176 pgTAP assertions passed** under normal local `postgres`: all eight
  existing database suites, existing staging defaults/role workflows and 16 new
  legacy appointment assertions. Fixtures roll back. These exercise financial
  authorization, employee offboarding/reactivation and separate clock review,
  original scheduling/source contracts, storage, real appointment creation,
  replay without duplicate history, direct-write denial and stale cancellation.
- Local CLI 92→93 upgrade, forced rollback, repeat/no-op and exact hosted/local
  catalog/ledger comparisons passed. Typecheck and offline generated-schema
  fingerprint check passed. No app runtime source changed, so another optimized
  application build was unnecessary; the prior appointment build remains valid.
- Real HTTPS anonymous access to the new appointment command and customer reads
  returns **401 / 42501**. No hosted Auth actor, business fixture or communication
  was created. Positive and concurrent workflows were tested locally, not claimed
  as hosted user-session proof.
- Hosted security advisors retain 26 deny-by-default RLS INFO notices. The
  authenticated-definer warning count changes from 56 to 57, exactly for the new
  intentional command; there is no anonymous-definer warning. This entry point
  is deliberately authenticated and enforces current staff checks after locks;
  its private trigger helper is not an API grant. Keep that boundary rather than
  granting anon access or converting the command to an unreviewed implementation.
  See the [authenticated-definer advisory](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

Private logs and local metadata evidence are outside Git under
`/Users/noelsierra/Documents/Codex/2026-10-14/pu/work/staging-93/`.

## Repeatable read-only verification

From `apps/platform`, with Node22 and the authenticated CLI:

```sh
node scripts/release/verify-staging-appointment-candidate.mjs --project-ref gbyhdsuiqeslgjdnbqng
```

`STAGING_SUPABASE_BIN` may select the already installed CLI. The verifier never
applies anything, links a checkout, retrieves API keys, repairs history or
deploys. It rejects `--apply` and non-staging refs before any tool/network call.
Private evidence goes into a fresh temporary directory. Both metadata fingerprints
and exact version/name pairs must match, and empty/OFF state is mandatory.

The previous `staging-permissions.mjs` remains a frozen 92-file repair tool. Its
full-inventory guard intentionally rejects the current 93-file checkout; do not
weaken it or paste its old SQL into a new candidate. The shared snapshot validator
now reads the selected profile's explicit expected migration count; the old
profile still requires 92 and the new profile requires 93.

## Preserved work and remaining gates

All previous migrations, RLS, financial logic, employee redesign, current review
app/session, scanner preparation and production Netlify configuration remain.
The shared embedded `staging/targets.json` remains deliberately unassigned/false;
inventory evidence does not grant hosting readiness or deployment approval.

The application and new database command must ship together; older raw-write
appointment clients need compatibility review before release. Hosted visitor
gate/header/cache proof, server-key binding and isolated Auth mail remain open.
The scanner stays parked until the home Mac is available. No secret, server,
customer send, payment or external calendar operation was introduced.

The next scanner-independent preparation is the remaining hosted runtime/key/mail
isolation review. Any actual deployment, production reconciliation or activation
requires its own explicit authorization.

References reviewed: [Supabase migration workflow](https://supabase.com/docs/guides/deployment/database-migrations),
[PostgreSQL 17.11 release considerations](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes).
No extension upgrade or reindex was performed for this additive appointment command.
