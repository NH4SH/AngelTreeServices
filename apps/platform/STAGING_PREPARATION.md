# Isolated staging preparation — October 17, 2026

**Local access-gate follow-through (October 17):** the owner selected a free, custom approach. A staging-only gate is implemented and tested locally; see [local access protection](STAGING_ACCESS_PROTECTION.md). Native Netlify protection is still locked, no plan/team change or scanner purchase is approved, and hosted visitor protection remains unverified. The earlier paid host recommendation is retained as historical review, not the selected budget.

Status: **local preparation verified; separate targets created; staging schema initialized but hosting not ready**.
See STAGING_TARGET_SETUP.md for actual assignments, verification and blockers.
This continues PR18/F17 and the existing scanner activation runbook. No deploy,
preview deploy, project/branch purchase, DNS change, production schema/history change,
production credential change or production data operation is included.

## Concrete package

- `scripts/release/staging-preflight.mjs`: offline, fail-closed target/environment
  check; no API call, secret output, linking or change. Shared with the application
  build/startup and canonical-origin guards; see STAGING_HOSTNAME_AND_ISOLATION.md.
- `staging/targets.json`: deliberately unassigned targets and unverified evidence
  flags. No fabricated hostname, key or credential. It must fail the preflight.
- `scripts/release/prepare-staging-copy.mjs`: exports the **committed** app into
  a new private temporary directory. It never initializes a repository, links a
  site, reads local env files, builds or deploys. The real checkout is unchanged.
  Its source commit/tree/archive SHA and staging-config SHA are recorded.
- Only the exported copy's `netlify.toml` changes: the preflight runs before a
  build, Node22 is selected, and custom functions point at an empty no-schedules
  directory. Original worker sources remain available in the export for review.
  The existing production Netlify configuration is untouched. The copied
  `.gitignore` excludes `.netlify`, env files, dependencies and build output.
- `supabase/verification/release_catalog.sql`, `migration-review.mjs` and
  `rehearse-local-upgrade.mjs`: read-only comparison and guarded local ledger
  rehearsal. See MIGRATION_RECONCILIATION_REPORT.md and the pinned 92-file manifest.

The export is a source review packet, not a new Git project or a ready deploy.
Dependencies are not copied; use the existing lockfile in an approved isolated
build environment. A public sample value passing offline checks does not prove
credentials or hosting protection. Every true verification flag requires actual
target evidence. No manifest flag grants deployment approval.

## Target and environment decision

Use a separate Supabase staging project (or separately approved branch), a
separate Netlify site and a separate company-controlled scanner credential and
endpoint. Do not use a preview of the live CRM site with its inherited secrets.
The separately created targets are CRM Staging in ATS and the dedicated
angel-tree-admin-staging Netlify project. Their inventory is in
staging/PROVISIONED_TARGETS.json. The original 92 migrations are now applied and
their ledger verified on staging; automation and all scan switches are OFF.
The exact staging Auth Site URL/reset redirect and disabled public signup are
verified. Current application grants now match fresh replay and the normal
migration-owner named defaults are restricted; protected administrator/global
defaults are reviewed and retained for this pinned candidate, with creator/catalog
checks; this does not claim full normalization. See
SUPABASE_MANAGED_DEFAULTS_REVIEW.md and STAGING_PERMISSION_RECONCILIATION.md.
Auth/mail, visitor protection, scanner hosting
and remaining runtime evidence are incomplete. No application has been deployed.

Initial profile is **core-no-providers**. Copy schema/code, not customer data,
Auth users, sessions, Storage bytes, saved integrations, production queues or
source-file secrets. Use only synthetic customers, employees, invoices, payments,
messages and files. Seed default communication/recurring settings OFF and all
seven scan switches OFF before the app is tested; enable one disposable test
area explicitly only after scanner verification. The repository's config mentions
seed.sql but no such file exists. Do not substitute a production data dump.
Use reviewed synthetic fixture creation through existing workflows.

Runtime settings for the future isolated site, supplied privately:

| Setting | Required binding |
| --- | --- |
| APP_ENV / STAGING_MODE | staging / core-no-providers |
| SITE_ID | The actual separate Netlify site ID; never the production site ID |
| APP_BASE_URL | The exact separate HTTPS staging origin recorded in the exported target manifest |
| NEXT_PUBLIC_SUPABASE_URL | The separate project URL matching the approved project ref |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | That project's public key; verify project binding |
| SUPABASE_SERVICE_ROLE_KEY | That project's server-only key; verify project binding, never public |
| DOCUMENT_SCANNER_URL / DOCUMENT_SCANNER_TOKEN | Separate staging HTTPS /scan endpoint and private staging credential |

Do not transfer production values for Stripe, Resend, Google OAuth/calendar,
maps, SMTP, Twilio, webhook/intake/worker/monitor credentials or production email
recipients. These remain absent in the initial environment. Check site **and
shared/team** variables in build and runtime scopes; a build-only override does
not neutralize an inherited function/runtime value. Use a separately generated
staging PORTAL_TOKEN_ENCRYPTION_KEY (32 bytes, base64) for synthetic customer-link recovery; never reuse the production key.
No secret is generated by the preparation scripts. Opaque modern Supabase keys
need actual API/project verification; decoding an old JWT ref is only a mismatch
check, not signature validation. Secret values never belong in this manifest.

The preflight rejects known production targets, mismatched project-bound JWTs,
public privileged variables, provider/worker keys, decorated/plaintext endpoints
and missing independent checks. Its lack of network calls is intentional. It
does not establish actual access protection, API key validity or hosted behavior.
No staging app can be considered ready based on editing booleans alone.

## Canonical-origin and scheduler isolation

Narrow staging hostname support is now implemented and tested locally. Production
still permits only its canonical HTTPS origin. A staging artifact accepts only
the exact named HTTPS origin in its embedded staging/targets.json, with a separate
site/project binding and the complete core-no-providers profile. The same check
runs before builds and at server startup; assigned staging artifacts cannot be
reclassified by deleting APP_ENV. There is no request-Host, preview-URL, wildcard
or production fallback. See STAGING_HOSTNAME_AND_ISOLATION.md for code changes,
verification and remaining actual-host gates.

Populate targets **only in a new isolated export after target review**, not in the
shared production checkout. Record the reviewed target-file SHA alongside the
export's immutable source/archive SHA and the actual target evidence. The CLI's
--manifest argument does not change the application's embedded target. Check the
same embedded file at build and runtime. Never set verification flags based only
on synthetic tests; the real manifest remains unassigned/false.

The production site currently publishes five scheduled functions. A dedicated
staging site's published deploy can also schedule functions; its own production
context is not proof that it is the business production environment. The export
therefore selects an empty custom-functions directory and omits worker secrets.
The shared wrapper independently refuses staging and non-production site IDs;
production wrappers retain their five original schedules and exact destination.
The generated Next server/API routes still exist: no credentials/providers and
OFF database automation gates remain essential. Verify the actual built function
inventory contains no scheduled workers before any approved staging deploy.
Do not point the original worker wrappers at the production host for a test.

## Local commands and tested boundaries

From apps/platform, with Node22:

```sh
node --test tests/migration-review.test.mjs tests/staging-preflight.test.mjs
node scripts/release/staging-preflight.mjs --manifest staging/targets.json
node scripts/release/prepare-staging-copy.mjs
```

The second command must fail with the unassigned manifest. The third exports
the committed tree only, so commit reviewed preparation files locally first.
It prints the new temporary directory and non-secret source/config hashes.
Inspect the exported `netlify.toml` and `STAGING_EXPORT.json`. No production
configuration or existing directory is overwritten. Use the export as the
eventual isolated site's base directory with its own default netlify.toml;
there is no reliance on an unverified custom configuration-file override.
Do not run a build against a linked production site to obtain staging variables.

The local CLI rehearsal takes explicit private paths: RECONCILE_LOCAL_STATUS_FILE,
RECONCILE_HISTORY_FILE (version/name JSON), RECONCILE_AUTH_STORAGE_BOOTSTRAP
(trusted existing local Auth/Storage schema only), RECONCILE_DOCKER_BIN and
RECONCILE_SUPABASE_BIN, plus RECONCILE_DISPOSABLE_STACK=1 and the existing
pr02-disposable DOCKER_HOST. Optional RECONCILE_LOCAL_OVERLAY is reviewed
**local-only** schema simulation; never execute it on hosted Supabase. Source
credentials must name API 127.0.0.1:54321 / DB 127.0.0.1:54322. It creates a new
database, applies a genuine CLI ledger and saves private logs outside Git. It
does not reset the review database or change cluster roles.

## Acceptance sequence for a future approved staging run

1. Assign/verify separate targets, company ownership/billing, hostname and maintainer.
   Configure visitor protection and private logs; no customer data is needed.
2. Verify the full migration manifest, provider defaults and the recorded baseline
   decisions. Build the isolated schema with the supported CLI, check all 92
   ledger entries, routines/owners/grants/RLS and OFF switches. Preserve the
   extra production column/helper instead of dropping them during reconciliation.
3. Verify the implemented canonical-origin policy on the actual target and all
   runtime-key scopes/bindings. Verify staging Auth Site URL, exact reset redirect
   allowlist, email-template redirects and isolated mail handling; never copy the
   production Auth settings. Verify
   the staged scanner image/config, real TLS, signatures, limits and resource
   peaks. Prove paired synthetic source-file/database recovery on that target.
4. Run the preflight and inspect the actual resolved build configuration,
   function inventory, header behavior and output for secrets. The provider
   adapter/headers/cache/25 MiB transport must be verified on hosted staging;
   the previous local tests do not establish these results.
5. Only after explicit staging-deployment approval, release the exact reviewed
   export and verify owner/admin/estimator/crew denial, offboarding/reactivation,
   transactional quote/invoice/schedule/closeout behavior, audit history and all
   attachment areas. Test failure/recovery with synthetic data and no sends.
6. A later separately reviewed provider-testing phase may use Stripe test mode,
   an approved email sink and a dedicated test calendar. Do not enable live
   payments, send to customers, or reuse production webhooks/OAuth credentials.
   Existing provider tests remain available; no business feature is removed.

Production remains a separate release decision, including reviewed pending
payment/checkouts/communications and the compatible app/schema cutover. See
SCANNER_ACTIVATION_RUNBOOK.md and MIGRATION_RECONCILIATION_REPORT.md.

Sources: [Netlify configuration](https://docs.netlify.com/build/configure-builds/file-based-configuration/),
[monorepo/base resolution](https://docs.netlify.com/build/configure-builds/monorepos/),
[Supabase branch migration history](https://supabase.com/docs/guides/troubleshooting/branch-in-migrations-failed-status).
These product docs do not override the project's preservation/no-deployment rules.
