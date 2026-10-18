# Targeted staging Auth installation and activation review — October 18, 2026

**Decision: accept the targeted installation design and staged activation plan.**
The verified local guard is pushed to main and `codex/staging-auth-email-guard` at
`56d3c13`, with deployment skipped. This follow-through prepares a concrete
review-only SQL packet and the minimal Auth settings change, verifies the actual
staging target read-only, and rehearses installation/activation locally. Nothing
was installed or enabled on hosted staging. No production operation or app
publication occurred. Continue the existing PR18/staging sequence; scanner work
remains parked.

## Actual target and compatibility

| Check | Read-only result |
| --- | --- |
| Supabase target | CRM Staging, `gbyhdsuiqeslgjdnbqng`, ATS organization `crisckykyefqdpatbfgb`, healthy |
| Database identity | System identifier `7692130048193495360`, database `postgres`, OID5, server version170011 |
| Application candidate | Exact93 migration identities and source hashes; reviewed catalog, current grants and managed/migration-owner defaults match |
| Data and switches | Reviewed user/business/storage counters zero; communications, recurring and scanning switches OFF |
| Effective Auth | Public signup OFF, email/password ON, staging-only Site URL/reset allowlist, no Send Email hook or custom SMTP |
| Data API exposure | `public,graphql_public`; dedicated hook schema excluded |
| Hosted Auth version | Health200, GoTrue `v2.197.0`, matching the already installed image used in both local suites |
| Existing deploys | CRM `6ad23c757dfc53f702ae00b9`; website `6ad41cc12fd086f697f224e8`; staging has no published app |

The physical identity is metadata, not a credential. It is **one check**, combined
with independently read project/name/organization/health, explicit Management API
routing, exact application state, private configuration provenance and freshness.
A physical restore can preserve an identifier; do not treat it as cryptographic
proof of a project. A changed identity/version requires renewed review, never a
blind update to the profile. No extra function permissions were granted to obtain
this metadata. Only a staging publishable key was used for the health GET; no
privileged project key was retrieved or installed and no mail request was made.

The Supabase changelog was checked. The upcoming legacy TLS cipher retirement
does not change the Management API or direct database path; current HTTPS checks
succeed. The17.11 minor-release notices were reviewed; this packet introduces no
ltree/GiST indexes, encryption/decryption or custom operators. No database version
upgrade is proposed. [TLS notice](https://supabase.com/changelog/cbc-tls-ciphers-deprecated),
[17.11 notice](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes).

## Prepared package

- `supabase/staging/auth-email-guard/target-review.json` records the exact target,
  physical database/version and observed Auth version, with activation false.
- `scripts/release/staging-auth-activation.mjs` reuses the existing93-source,
  catalog, permission and empty/OFF verifiers. It validates fresh target/config
  evidence, builds the transaction, checks installed function/schema metadata and
  reconciles the proposed Auth patch. It has **no network or apply capability**.
- `scripts/release/review-staging-auth-activation.mjs` reads project inventory and
  database metadata using the existing authenticated CLI, plus a fresh private
  effective-config GET file. It writes a private expiring review packet. It has
  **no install, activation, rollback, deployment or key-retrieval command**.
- The original local installer/rollback and two SQL file hashes are unchanged.
  Reviewed create/grant/revoke statements are reused from that pinned source;
  there is no second independently maintained hook body.

The generated SQL starts one serializable transaction, takes a cooperative
advisory lock and refuses expired evidence, the wrong physical database/version,
elevated migration roles, changed application preimages or an existing/unknown
hook schema. It creates only the dedicated private schema/function and exact
Auth grants, then checks complete hook definition/ACLs and unchanged application
catalog/defaults before committing. Unknown grants cause rollback, not automatic
normalization. No CREATE OR REPLACE, default privilege changes, data migration,
RLS change or history repair occurs. All93 ordinary migration files and historical
profiles stay untouched.

The review packet expires after15 minutes. It contains a SQL file, a read-only
snapshot query and an **unsent** JSON patch. Regenerate it just before any
subsequently approved operation; this report is not a reusable authorization or
freshness certificate. Errors and private config parsing failures produce
value-free terminal output and mode0600 diagnostics. Config/secret values never
enter committed reports or the patch.

## Activation sequence for a separately authorized staging operation

1. **Establish a single operator and keep staging unused.** Freeze other Auth
   settings/admin-user/invite operations. Verify no hosted app/preview, integration
   workers or new staging credentials have been enabled. Re-read the empty/OFF
   target and current Auth version. A private app gate does not close direct Auth
   requests; do not claim a global maintenance barrier from the Netlify screen.
2. **Refresh the packet and apply only its targeted SQL**, after explicit staging
   installation authorization. It routes only to the assigned project under the
   normal migration owner. No migration ledger entry or production file changes.
   Read back the exact function owner, invoker flag, argument/return type, SQL
   body hash, search path, volatility, schema/function ACLs and effective Auth/API
   role privileges (including inherited grants), no extra schema
   objects/defaults, and unchanged93 application state. The dedicated schema must
   remain unexposed to Data API clients.
3. **Refresh config and DB metadata immediately before activation.** The tested
   `activationDecision` rejects changed identity, catalog/state, installed hook
   metadata, Auth configuration or API exposure, as well as expired evidence.
   This is a review decision and never sends a request. Its local fixture uses
   its own database identity; the actual target wrapper uses the pinned hosted
   identity. Reuse the packet's read-only snapshot query for these readbacks.
4. **Enable only these two settings** on the assigned project's Auth config:
   `hook_send_email_enabled=true` and
   `hook_send_email_uri=pg-functions://postgres/ats_staging_auth/reject_email`.
   The documented endpoint is PATCH `/v1/projects/{ref}/config/auth`. No SMTP,
   provider, signup, password, redirect, template, key or hook-secret change is
   required. The prepared patch is intentionally unsent.
5. **Read effective settings and SQL metadata again.** The configuration
   reconciler permits exactly that two-field change. Check any provider-applied
   grants against the exact expected metadata rather than assuming they are safe.
   Stop on unexpected drift; do not turn the hook off. Config readback alone
   never sets mail-isolation or runtime-readiness flags true.
6. **Verify real hosted behavior using synthetic fixtures only**, after the
   staging activation/testing scope is authorized. Use an existing staging-only
   admin credential through the supported Auth Admin API, never direct inserts
   into managed Auth tables. Do not retrieve/use production credentials or invent
   a user/password reset route. Test confirmed-account creation without email,
   known-user recovery503 with the staging message, invite/magic-link/resend/email
   change refusal, password sign-in/refresh and safe log inspection. Keep the
   currently configured rate limits; space fixtures rather than reducing hosted
   limits. Remove only these known synthetic fixtures and verify the target is
   empty again. Do not perform a hosted SMTP positive control by disabling the
   guard: the default provider is not a controlled test sink.
7. Record actual proof separately. Visitor protection, app runtime/private keys,
   adapter/CDN/aliases, scanner and deployment readiness remain their existing
   independent gates. Successful email delivery remains unclaimed.

Database DDL/ACLs are transactional. Database installation and managed Auth
configuration are **separate operations**; there is no distributed transaction or
proved conditional config PATCH in this package. The advisory lock coordinates
these installers only, not other administrators or Auth requests. A serializable
snapshot does not freeze all concurrent managed-service writes. Require the
operator freeze and fresh before/after checks, and stop on intervening activity.
If staging has gained users/data or other active integrations, do not reuse this
empty-target procedure; review that changed state first.

[Management Auth configuration](https://supabase.com/docs/reference/api/v1-update-auth-service-config),
[Send Email behavior](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook),
[Postgres hook security](https://supabase.com/docs/guides/auth/auth-hooks).

## Failure and rollback decision

**Keep the hook enabled.** The real local tests prove a missing function or lost
execute permission produces500 without SMTP fallback, and restoring only the
reviewed grant restores the explicit503. A failed SQL transaction leaves no
partial install. Unknown pre-existing schema contents are refused, never replaced.

Do not automatically restore the previous disabled-hook config after an Auth
error. That reopens the built-in mail path. Disabling the email provider alone
is not tested as a barrier for every administrative mail entry point and is not
an approved substitute. No hosted uninstall/disable runner is included.

After a failed readback/probe, keep staging use closed, preserve the hook and
investigate the exact discrepancy. A separately reviewed repair may restore only
the expected function/permissions. Prefer retaining the small rejection hook to
uninstalling it. A future retirement needs its own proof that direct Auth mail
entry points are closed; hiding the CRM behind a web password is insufficient.
The existing removal SQL remains exclusively a local rehearsal tool.

## Verification and preserved work

- **792 regression results pass**, no failures/skips, including nine new offline
  review tests. They cover target/database recreation, ledger/catalog/grant/data
  drift, provider/API exposure, stale evidence, minimal patch reconciliation,
  write-flag rejection and value-free failure output.
- **Nine native results** (one parent/eight scenarios) pass on a new empty local
  database with a genuine93 migration replay, unpublished internal Auth/Mailpit
  services and synthetic credentials. Wrong target/role/expiry, competing lock,
  changed automation and injected post-install grant failure all leave no guard.
  A valid transaction installs exactly the expected invoker/grants and cannot be
  repeated over an existing schema. Configuration/permission drift is refused.
- Real owned local Auth activation returns503 without captured mail; password
  sign-in works. Revoking the Auth execute grant returns500 without delivery;
  restoring it returns503. Original DB/Auth/Mailpit start times and DB network
  membership are preserved; owned services/network and synthetic users are
  removed. No shared reset or service restart occurs.
- The prior eleven-result guard suite remains separate and unchanged, covering
  every currently enabled Auth email entry point and positive SMTP/rollback
  controls in its owned environment. Typecheck and offline schema checks pass.
  No fresh app build is needed for SQL-review/test/docs-only changes.
- Local security advisors retain only the existing `pgcrypto`-in-public warning;
  no new guard security error is accepted. Hosted read-only reconciliation and
  configuration/deploy preservation checks are recorded separately.

Safe evidence: `staging/AUTH_ACTIVATION_REVIEW_VERIFICATION.json`. Detailed local
proof and private packets live outside Git under
`/Users/noelsierra/Documents/Codex/2026-10-18/staging-auth-activation-review/` and the
recorded private temporary directories. No app feature, employee UI, financial
behavior, RLS policy, production configuration or credential has changed.
