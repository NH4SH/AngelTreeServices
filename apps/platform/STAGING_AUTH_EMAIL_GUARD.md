# Staging-only Auth email guard — local verification, October 18, 2026

**Current state, October19:** the reviewed hook is now installed/enabled on the
separate staging project after explicit authorization. Exact permissions/state
and bounded hosted recovery invocation are verified; two synthetic users and
all sessions were removed. Other hosted email routes were rate-limited; full
per-route hook-message proof remains open. See
[activation record](STAGING_AUTH_EMAIL_ACTIVATION.md). Earlier statements below
record their original review date. No app deployment or production change occurred.

**Published/follow-through:** guard `56d3c13` is now pushed to main and its preserved
branch. The targeted staging installation and activation review is prepared and
tested locally; see [current review](STAGING_AUTH_ACTIVATION_REVIEW.md). Original
local SQL bytes are unchanged. Hosted installation/activation remain false.

The isolation review is published on main and `codex/staging-runtime-key-mail-review`
at `e6dbc02`, with Netlify deployment skipped. Its next recommended step is now
implemented and verified **locally** on `codex/staging-auth-email-guard`.

The guard rejects Auth email delivery with an explicit error. It needs no
additional provider, mailbox, hosting service, HTTP hook secret or subscription.
Supabase documents Postgres Send Email hooks on Free:
[Send Email hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook)
and [hook privileges/errors](https://supabase.com/docs/guides/auth/auth-hooks).
This removes a paid-service dependency; it is not a claim about future account
quotas or successful email delivery.

## Implementation and boundaries

`supabase/staging/auth-email-guard/` is a separate operations package, **outside
ordinary migrations**. The 93 production/shared migration files, frozen 92-file
manifest, current appointment candidate, schema contract, application code,
permissions, RLS, earlier financial work and employee interface are unchanged.
There is no migration94 and no automatic hook activation during app deployment.

The private `ats_staging_auth.reject_email(jsonb)` function ignores its payload
and returns a constant JSON error with HTTP503 and this message:

> Email delivery is disabled in staging. Use the local test environment for email testing.

It has no tables, payload storage, network access, secret lookup, dynamic SQL,
logging or application-role decisions. It runs as **SECURITY INVOKER**, owned by
the normal migration owner with an empty search path. Only `supabase_auth_admin`
gets schema USAGE and function EXECUTE; PUBLIC, anon, authenticated and
service_role are explicitly revoked. A dedicated schema avoids granting Auth
access to existing private application helpers. The schema must remain outside
the Data API's exposed schema list.

The installer is deliberately **local-only**: it requires the harness's random
`ats_auth_email_guard_<32 hex>` database and normal non-superuser postgres role.
It rejects the shared local database and hosted databases. Installation is
transactional, with bounded lock/statement timeouts and no replace-existing
behavior. SQL SHA-256 hashes and the body MD5 bind the reviewed package. Rollback
rejects changed bodies/owners, extra routines or any relation; it uses no CASCADE.
These are guardrails for a local drill, not an identity check for a hosted target.
**No hosted installer or activation command is provided.**

## Real local results

The opt-in native test passes **11 results: one parent and ten scenarios**.
It uses GoTrue `v2.197.0` (existing installed image digest
`sha256:1736a63078f5922b198c4cbe50f80ab9a2d3b54fe8b7b6cfb2e9dc5dbbc12c6b`)
and Mailpit `v1.31.3`, with a fresh synthetic signing secret, password and users.

- A new empty database receives the trusted Auth/Storage schema-only bootstrap,
  the matching managed Auth version ledger, and a genuine CLI replay of all93
  application migrations. No existing users, sessions, emails or business rows
  are copied. Managed bootstrap history is distinct from application history.
- A new **internal Docker network**, Auth service and reachable Mailpit service
  have no published ports. Requests travel over that network through the local
  DB container. SMTP positive control delivers one synthetic recovery email.
- With the hook enabled, known-user recovery, invite, magic-link, confirmation
  resend and secure email change return503 with the explicit message. Mailpit
  remains at one message. The signed-in account's identity/email remain intact.
- Password sign-in and refresh work; an incorrect password fails. Missing-hook
  and revoked-execute cases return500 with no SMTP fallback. Restoring the grant
  restores the explicit503. These checks do not merely accept any rejection:
  throttled429 responses would fail the tests.
- A null/forged payload produces the same result, no guard tables exist, and a
  synthetic payload canary is absent from the inspected Auth logs. The shared
  application catalog/ACL seal is unchanged before install, during use and after
  rollback.
- Wrong-database install is rejected; an injected pre-commit error leaves no
  installed schema. Rollback refuses an added test relation, then succeeds after
  that relation is explicitly removed. Disabling the hook only on the owned test
  Auth service and rolling back restores SMTP (second captured message).
- Synthetic accounts are removed. Owned Auth/Mailpit containers and network are
  removed. The original DB network membership and the original DB/Auth/Mailpit
  start times/running states match their pre-test state. Review app3102 stays up.

Auth may return a privacy-preserving success for a nonexistent account without
attempting mail. This package does not change that behavior. Signup remains off;
social/phone providers and security-notification variants not enabled in the
current staging configuration are outside this test coverage. Successful hosted
mail, hosted hook compatibility and provider-side telemetry remain unverified.

During harness development, normal-owner permission and rootless published-port
assumptions failed; the harness now uses the actual managed Auth owner for its
own bootstrap and unpublished internal service transport. An initial zero mail
interval reverted to Auth's default minute; the **owned test service only** now
uses1ms so each attempt reaches the hook. Hosted and shared Auth limits were
never reduced. No security grants were widened to fix a test failure.

The ordinary suite passes **783/783** with no failures/skips; four new offline
tests validate local target refusal, explicit opt-in, source integrity and
rollback binding. Typecheck and offline schema checks pass. Local database
security advisors report no errors and one existing `pgcrypto`-in-public warning;
no new finding concerns the guard. No new application build was needed: this
package changes SQL operations, tests and documentation only.

## Hosted state and next step

Read-only verification confirms the exact93 staging ledger, current grants and
restricted migration-owner defaults still match. The effective staging Auth
configuration is unchanged: no enabled Send Email hook and no custom SMTP.
Therefore **hosted Auth mail is still unisolated**. The staged hook has not been
installed, configured or exercised remotely. No hosted test mail was requested.
Production CRM deploy `6ad23c757dfc53f702ae00b9` and website deploy
`6ad41cc12fd086f697f224e8` are unchanged; staging still has no published app.

Continue the existing PR18/staging sequence: prepare a separately reviewed,
exact-target hosted operations package for `gbyhdsuiqeslgjdnbqng`, with the current
93-candidate catalog/default/grant contract, private schema/grants, transaction
failure/rollback tests and explicit Auth configuration verification. That package
must not accept a project ref alone as proof of database identity. Only an
explicitly approved staging activation may install it and enable the hook;
recheck it against the hosted Auth version before any release. A disabled hook
restores the built-in mail route, so rollback/config drift must close staging
entry points first. Never apply this rejection gate to production.

After that, independently reconcile staging-only app keys, portal encryption and
gate credentials, then hosted visitor/runtime/alias checks when authorized.
Keep the scanner parked. All shared readiness flags remain false. Nothing in
this local verification grants deployment, production changes or credential
creation/rotation.

Safe evidence: `staging/AUTH_EMAIL_GUARD_VERIFICATION.json`. Detailed local evidence
is outside Git under
`/Users/noelsierra/Documents/Codex/2026-10-14/pu/work/staging-auth-email-guard/`.
Private test environment files are mode0600 in a private temporary directory;
never copy them into a repository or hosted environment.
