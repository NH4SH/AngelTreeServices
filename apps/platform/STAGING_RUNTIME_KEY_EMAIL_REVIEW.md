# Staging runtime, key and email isolation review

**Follow-through, October 18:** this review is pushed to main and its preserved
branch at `e6dbc02`. The recommended no-send Postgres Auth hook is now implemented
and tested in a separate local rehearsal package. See
[Auth email guard](STAGING_AUTH_EMAIL_GUARD.md). Hosted configuration is unchanged;
mail isolation and hosting readiness remain false. Recommendations below describe
the original review state.

Reviewed October 18, 2026 UTC / October 17 Eastern.

## Decision

Verified reconciliation `24d6b3e` is pushed to main and
`codex/staging-93-reconciliation`, with deployment skipped. The staging database
remains verified at 93/93. **Keep the staging application undeployed.** Its four
public environment settings are correct, but server keys and outer-gate secrets
are absent, and hosted Auth email still uses the default Supabase mail route.

The next useful scanner-independent work is a **local staging-only Auth no-send
hook prototype** inside the existing Supabase infrastructure. Prove that it
rejects email requests without SMTP fallback, never stores/logs recovery tokens,
and leaves password sign-in and production behavior intact. Do not install it
remotely as part of this review. Continue full recovery testing in local Mailpit;
hosted recovery/invite delivery remains unavailable until a controlled delivery
route is separately reviewed. This uses the existing provider direction and needs
no new account or scanner host.

No remote environment, Auth setting, key, hook, email template, schema or
production data was changed. No key was created/rotated/revealed, no hosted email
was requested, and no deploy occurred. Review tools/evidence are local on
`codex/staging-runtime-key-mail-review`.

## Actual observations

Targets were the dedicated Netlify site
`d81d923d-6ccf-4c1e-87cc-263f3d51555d` and ATS Supabase project
`gbyhdsuiqeslgjdnbqng`. Production settings/secret values were not fetched for
comparison. The existing CLI credential was used in memory for read-only
Management API access; it was not exported, printed, stored in this package or
installed in the application.

| Area | Observed result | Remaining proof |
| --- | --- | --- |
| Netlify site variables | Exactly APP_ENV, STAGING_MODE, APP_BASE_URL and NEXT_PUBLIC_SUPABASE_URL; correct staging values, context `all`, all four scopes | Actual deployed build/Functions/Edge environment is unobserved |
| Shared team variables | Read-only API returned none | Recheck at release and inspect actual runtime; this does not establish future inheritance |
| Public API key | Existing staging publishable key gets Auth settings HTTP200; invalid control gets401 | It is not installed in the Netlify staging app |
| Server API key | Not installed; no privileged project key fetched | Obtain only a staging key privately and prove project/role binding before use |
| Portal encryption | PORTAL_TOKEN_ENCRYPTION_KEY absent | A separate staging-only value is needed for synthetic portal-link recovery |
| Outer access gate | STAGING_GATE_KEY and STAGING_GATE_VERIFIER absent | Separate hosted-only credentials and actual route/cache/alias proof remain necessary |
| Hosted app | No published staging deploy | No hosted process, adapter, CSP, runtime scope or gate evidence yet |
| Database | Exact 93 migrations and reviewed grants; empty/OFF inventory | No activation implied |

The source export selects Node22 and an empty custom scheduled-functions
directory. The actual five production schedules and production configuration
remain intact. A dedicated site's `production` deploy context is still staging;
it must not inherit business production settings. `SITE_ID` is reserved and must
be checked from the actual runtime, not manually configured.

Scope precedence is evaluated independently. A site URL in Builds does not
override a shared Functions URL. `netlify.toml` build variables are also not
Functions environment variables. API metadata and successful local compilation
cannot establish the deployed environment. See [Netlify Functions environment
rules](https://docs.netlify.com/build/functions/environment-variables/).

## Keys: what to provision later

Keep the existing variable names and production credentials unchanged. Populate
only a separately reviewed staging artifact/site, privately:

| Variable | Staging binding and intended availability |
| --- | --- |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Staging publishable/anon key; Build and Functions; safe for client use |
| SUPABASE_SERVICE_ROLE_KEY | Staging server secret/service-role key; Functions, with server-only name; never client output |
| PORTAL_TOKEN_ENCRYPTION_KEY | Independently generated staging 32-byte base64 value; server-only |
| STAGING_GATE_KEY / STAGING_GATE_VERIFIER | Independent hosted-staging gate pair; Build check and Edge runtime; never the local review access code |

Use narrow scopes where the existing plan supports them; do not purchase a plan
or assume secret flags change public-prefix bundling. If scope selection is not
available, keep the existing plan and explicitly review all applicable scopes
and client output before release. No values are included in this report.

Opaque `sb_secret_` syntax does not prove project identity. Decoded legacy JWT
claims are rejection checks, not signature verification. A future server-key
probe must use the exact staging URL and read-only known metadata; record only
success/project/role evidence, never the key. Do not test unknown keys against
production, create users just to test a binding, copy an old production value or
turn runtimeKeyBindingVerified on based on format alone.

Do not install Stripe, Resend, Google, Twilio, SMTP, worker, webhook, management,
intake or production recipient variables in this initial core-no-providers app.
The existing preflight rejects those values. Scanner credentials remain parked.

## Auth and email findings

The effective managed configuration and independent public Auth settings agree:
email/password is enabled; global public signup is disabled; anonymous/social
providers are off. Site URL is exactly the staging origin and its only additional
redirect is the staging `/update-password` URL. All 13 standard templates were
reviewed; none contains a literal URL or production target. Recovery/invite/
confirmation/magic-link/email-change templates use ConfirmationURL. All 13
custom-content flags in the managed template map are false.

The CLI config pull alone omits SMTP, hooks, templates and the email-provider
switch. Missing fields are not evidence that a provider is off. This review used
the effective Management API configuration (whose secrets are HMAC-redacted),
without exposing templates or credential values in reports.

There is **no custom SMTP host/user/password/sender and no enabled Send Email
Hook**. Consequently the built-in Auth mail route remains, even though the CRM
has no Resend key. Correct redirects and an empty user table do not isolate
future Auth deliveries. No hosted recovery, invite, magic-link or email-change
request was sent to test this. The default mail service is not a controlled
test sink; see [Supabase SMTP behavior](https://supabase.com/docs/guides/auth/auth-smtp).

The recommended next local prototype is a small invoker Postgres Send Email
hook that returns an explicit staging-unavailable error and sends/stores nothing.
Use only the necessary `supabase_auth_admin` execution/schema grants, revoke API
callers, and avoid a broad definer or custom password-reset mechanism. Package it
outside ordinary production migrations with exact staging targeting. Test real
Auth error propagation, zero mail capture/provider calls, allowed password
sign-in and rollback before considering any staging installation. Supabase
documents this hook on Free and supports in-project Postgres hooks; no new host,
third-party inbox, HTTP credential or access to production is needed for that
route. [Hook security and errors](https://supabase.com/docs/guides/auth/auth-hooks),
[Send Email behavior](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook).

This proposed rejection gate intentionally cannot prove successful hosted mail
delivery. Keep that verification separate. Production email and existing CRM
email features are preserved. The recommendation is not implemented or enabled.

## Local verification

- **779 regression results pass**, no skips/failures. Eight new review tests
  cover scoped site/shared precedence, production URLs leaking only into
  Functions, inherited provider credentials, context overrides, masked values,
  incomplete/named-context evidence and value-free output. They reuse the real
  staging preflight rather than a competing allowlist.
- Typecheck and a fresh optimized Next build pass. The new source-only export
  records committed source `24d6b3e`, no env/linkage/credentials copied, zero
  scheduled custom functions selected and a synthetic-only assigned manifest.
  These synthetic true flags never enter the shared manifest or hosted inventory.
- The compiled app rejects startup for a production SITE_ID, production database
  URL, inherited Resend key and removed staging marker. A valid synthetic setup
  serves login/health200, rejects all five unauthenticated workers401, excludes
  providers/other databases from browser CSP, and rejects production-origin lead
  intake403. The harness records **zero outbound attempts** and stops its server.
- All **91 public static build files** are free of the synthetic private server
  key canary. No actual secret was used in that build. This is a bounded check,
  not proof of a future Netlify artifact or its configured keys.
- The existing real local password-recovery integration passes **1/1**, using
  local Auth and its existing Mailpit container only. It creates three new
  synthetic accounts, captures the reset email, changes only the recovery-link
  account despite another signed-in user, rejects link reuse, preserves the
  other accounts and removes its test accounts. A follow-up count confirms none
  remain. No existing messages were deleted and the review browser/session was
  not touched.
- Read-only staging verification still passes93/93 with private buckets,
  reviewed defaults and empty/OFF state. The normal local review app is preserved.

Fresh source export is not a Netlify adapter build/deploy. Real packaging,
inherited/reserved runtime variables, hosted visitor protection, logs, TLS and
mail handling still require their own approved proof. Shared `staging/targets.json`
stays null/false, and all hosting/key/mail readiness flags remain false.

Evidence is outside Git under
`/Users/noelsierra/Documents/Codex/2026-10-14/pu/work/staging-runtime-review/`;
private source snapshots and local mail logs are mode0600. The reusable offline
reviewer is `scripts/release/review-staging-runtime.mjs`.

Final independent readbacks confirm the staging environment and effective Auth
configuration are unchanged. Published CRM deploy `6ad23c757dfc53f702ae00b9` and
website deploy `6ad41cc12fd086f697f224e8` are unchanged; the staging site still has
no published app. This review remains aligned with main `24d6b3e`.
