# Staging hostname support and isolation — October 17, 2026

Status: **implemented and verified locally; separate targets exist but are not ready or approved to run**.
Subsequent target provisioning is recorded in STAGING_TARGET_SETUP.md. The
hostname/isolation verification below describes the original local source pass;
the new staging database now has 92/92 migrations and restricted signup/redirects,
but fresh-project grants and the remaining hosting/Auth-mail/scanner gates are
unresolved. No approved deployment or readiness claim exists.
This continues PR18/F17 and STAGING_PREPARATION.md. Reconciliation/preparation
`d72e5d1` is pushed to main and its branch, with Netlify deployment skipped.
The branch also includes latest main `73a099d` (an independent public-website
update; its platform tree is unchanged). No deployment, provisioning, DNS, hosted migration/history repair, production
configuration/data/credential change or customer communication was performed.

## Engineering decision

Keep production's exact `https://admin.angeltreeservices.org` boundary. Support
one explicitly reviewed staging hostname, bound to a separate Supabase project
and Netlify site in the artifact's embedded `staging/targets.json`. Never infer
it from request headers, Netlify preview URLs or an arbitrary HTTPS whitelist.
Production no longer accepts a non-default HTTPS port alias. Loopback HTTP
development remains supported with the unassigned production manifest.

The checked-in target manifest remains null/false. After separately approved
target assignment, populate only a **new isolated exported copy** and record its
target-file hash alongside the existing source/archive/config hashes. Do not
commit staging target assignments into the shared production app manifest.
The offline CLI must read that same embedded file; passing a different CLI
manifest does not alter what the application accepts. Verification flags are
evidence requirements, not approval, and synthetic fixtures cannot satisfy them.

## Changes and preserved behavior

- One pure `staging-policy.mjs` supplies the offline preflight, canonical-origin
  policy and build/startup guards. `next.config.ts` checks before building and
  `src/instrumentation.ts` checks server startup. An assigned staging artifact
  fails if APP_ENV/STAGING_MODE are removed or the runtime site/project changes.
- Staging requires its exact HTTPS origin, separate actual SITE_ID, matching
  Supabase URL, correctly typed public/server keys and separate scanner. Known
  production targets/aliases, decorated URLs, IP/loopback hosts, non-default
  ports, malformed or project/role-mismatched JWTs, public privileged values,
  provider/worker/intake/management credentials and notification recipients fail
  closed. A customer-portal override may only match the staging origin.
- JWT decoding is rejection-only, **not** signature verification. Modern
  publishable/secret key shapes cannot establish their project binding offline.
  Real API key/project checks remain mandatory before setting the corresponding
  evidence flag. No tool reads or compares production secret values.
- Portal quote, invoice and change-order links, Google OAuth callback URLs,
  employee-access notices and job notices use the canonical origin. The employee
  password-reset action rejects an invalid origin before requesting email;
  its hardcoded production fallback is removed. Canonical URL construction
  rejects absolute/protocol-relative destinations, backslashes and controls.
- Staging browser policy permits only its own Supabase project for API/Realtime
  connections and omits Stripe/Google script/frame/connect permissions in this
  initial provider-free profile. Production/development CSP stays unchanged.
  Staging intake accepts only its staging origin; it does not inherit production
  website origins, and its diagnostic endpoint points to staging. Production
  intake validation, sender blocking, deduplication and rate limits are unchanged.
- Scheduled wrappers still target only the exact production CRM origin and now
  also require its reserved Netlify SITE_ID. They refuse staging, unknown site
  IDs, unknown environment labels and unsafe internal paths before reading or
  forwarding a worker credential. All five production schedules are retained.
  The isolated export still selects an empty custom-functions directory.

No RLS, authorization commands, financial transactions, migrations, prices,
employee UI, retention/restore rules, scanner switches or production Netlify
configuration changed. Existing provider capabilities remain available in
production; staged provider testing is a separate reviewed profile, not enabled
by adding a hostname. Stage Auth mail must use isolated handling even though
Resend and other app provider keys are absent.

## Local verification

Node 22.23.3 / npm 10.9.9; Next.js 16.3.8, existing lockfile/dependencies.

- **704 regression tests passed**, including the prior financial, authorization,
  offboarding and upload/access tests. Twelve new cases cover this change; the
  expanded staging cases also exercise multiple independent failure inputs.
- Typecheck and default Turbopack production build passed in a new isolated
  source copy with cloned local dependencies, reserved `.invalid` hostnames,
  unsigned test keys and synthetic evidence flags. No env files, Netlify linkage,
  production data or production secrets were copied.
- A built local server refuses startup for a production SITE_ID, production
  Supabase URL, inherited email-provider key and removed staging marker. A valid
  synthetic setup serves health/sign-in and denies all five worker APIs without
  credentials. Browser policy and rejection of production-origin intake are
  checked on the built server. A harness blocks outbound network access; no
  outbound attempt occurred. The temporary test server is stopped afterwards.
- Real portal URL generation and the real checkout preparation implementation
  are exercised with synthetic data/provider doubles: both payment return URLs
  stay on staging, the amount is unchanged, and no Stripe/email request occurs.
  The reset action is tested to stop before requesting a recovery client when
  canonical configuration fails. Actual provider round-trips are not enabled.
- The real unassigned staging manifest still fails its offline preflight with
  zero requests and zero changes. The active disposable reviewer is preserved,
  recurring automation remains OFF, and the existing review app remains local.
- Read-only Netlify metadata still identifies published deploy
  `6ad23c757dfc53f702ae00b9`; the push did not replace the production deploy.

Evidence is saved outside Git under the existing Codex work folder,
`work/staging-isolation/` (unit/typecheck/build logs, runtime-isolation result and
preservation result). The final export records the reviewed source commit/tree.
Actual Netlify adapter packaging, visitor protection, runtime environment scopes,
TLS/DNS, hosted API-key binding, Auth redirects/mail and scanner recovery have
**not** been established by these local tests.

## Next implementation / release gate

The code blocker for narrow staging hostname support is resolved. Next, assign
and independently verify the separate company-owned Supabase project, Netlify
site, exact app/scanner hostnames, maintainer and paired source-file/database
backups. Inspect site **and shared/team** variables in both build and Functions
scopes, exact Auth Site URL/reset allowlist/email-template redirects, private
logs, protected visitor access, default-OFF automation and synthetic-only data.
Use a separate staging portal-encryption key; never transfer production keys.

Then review an export with the actual target evidence and resolved function
inventory. No actual hosted readiness flag is set by this implementation.
Hosting/provisioning and deployment remain separate decisions. Pending financial
and communication records and legacy non-DML/default grants still need the
controlled production cutover review from MIGRATION_RECONCILIATION_REPORT.md;
this work does not waive that gate or start a competing roadmap.

References checked October 17: [Netlify function environment variables](https://docs.netlify.com/build/functions/environment-variables/)
(reserved SITE_ID and build/runtime scopes), [Supabase Auth redirects](https://supabase.com/docs/guides/auth/redirect-urls)
(exact redirect allowlist, Site URL and email-template redirect behavior),
[Supabase API keys](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys)
(public/server key types and RLS implications), and the
[Supabase changelog](https://supabase.com/changelog) (current TLS deprecation;
no Auth/API migration or credential rotation is part of this change).
