# Staging credentials and access protection preparation

Verified October 19, 2026. Continues the existing PR18 staging sequence.
**Credentials are installed; the app is undeployed and hosting is not ready.**
No application feature, ordinary migration, RLS rule, scan safeguard or production
configuration was changed. No hosted user or customer record was created.

## Completed

The prior Auth guard activation/evidence `647bce2` is pushed to main through
`87193e3`. This preserves the independent website cookie-banner update `ba41899`
and its analytics predecessor. The merge and push use deployment-skip markers.

Only Netlify site `d81d923d-6ccf-4c1e-87cc-263f3d51555d`
(`angel-tree-admin-staging`) received new settings. The original four public
settings are preserved. The team-variable API returned zero shared variables.

| New setting | Source | Context and storage |
| --- | --- | --- |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Existing staging publishable key | Dedicated site's production context; public, all scopes |
| SUPABASE_SERVICE_ROLE_KEY | Existing staging modern secret key | Production context; write-only secret |
| PORTAL_TOKEN_ENCRYPTION_KEY | New independent staging 32-byte value | Production context; write-only secret |
| STAGING_GATE_KEY | New independent staging signing key | Production context; write-only secret |
| STAGING_GATE_VERIFIER | Verifier for a new independent preview access code | Production context; write-only secret |

Here, “production context” means the primary deploy of the **separate staging
site**, not the business production site. No dev, branch or preview secret value
was installed. Those contexts lack required credentials and must fail closed.

Free-plan secrets use Builds, Functions and Runtime scopes and exclude Post
processing. The dashboard disables narrower choices. An initial narrower-scope
request returned a success message but saved nothing; readback caught it before
other credentials were installed. Retrying with the supported secret scopes
saved successfully. There was no plan upgrade or fallback to readable secrets.
Actual API metadata and dashboard badges confirm all nine variables and the
four secret flags. Write-only values cannot be independently read back: their
correct availability to the deployed process remains unverified. Site-variable
precedence is evaluated separately per scope; this does not assume a Builds
setting overrides inherited Functions settings.

The existing Supabase project is `gbyhdsuiqeslgjdnbqng`. Its existing publishable
key was accepted by Auth settings; the existing secret was accepted by the exact
staging Auth admin and profiles read-only APIs. The publishable key was rejected
by the admin API. These probes did not create users or send mail. Neither key was
created or rotated. The modern secret keeps the app's existing server-only
variable name; no application API-key migration is needed.

The installed no-send Auth guard, effective permissions, original 93 migrations,
empty inventory and reviewed application/default contracts passed a fresh
read-only verification. The earlier bounded hosted email-route evidence and
remaining rate-limited route checks are unchanged; see
[Auth activation](STAGING_AUTH_EMAIL_ACTIVATION.md).

Only the credential verifier/review tooling, tests and setup records changed in
Git. All generated secret material stays outside Git in a mode0700 private
operation directory, with mode0600 files. No application `.env` was edited. The
plaintext preview access code is retained privately for the owner, not uploaded
to Netlify or included in reports. Keep the staging portal encryption key for
staging record recovery; changing it later affects existing encrypted links.

## Verification

- **800 CRM regression results pass**, zero failures/skips. Five new metadata
  cases reject wrong targets, shared/provider values, missing/duplicate keys,
  readable secrets, wrong scopes/context overrides and privileged browser keys.
  Metadata alone never marks values, runtime, visitor protection or hosting ready.
- **154 public-site JavaScript checks pass**, plus public build and validation.
- **5 loopback gateway integration results pass**, including denied routes,
  session forwarding, binary/25 MiB streaming, aliases, cross-site requests and
  logout. These use synthetic upstreams and do not touch the review session.
- The actual prepared preview code/key/verifier passed local hosted-mode handler
  checks: correct code admitted, wrong code/tampering denied, Secure/HttpOnly/
  SameSite cookies and no-store responses retained. The actual prepared portal
  key passed encryption/decryption and tamper rejection with a synthetic token.
- Typecheck and offline schema contract pass. A fresh committed-source export
  (`87193e3`) built locally with synthetic credentials only. It selected zero
  scheduled custom functions; 91 browser build files contained no synthetic
  server/scanner-key markers. This is not a Netlify adapter/hosted artifact test.
- The compiled synthetic app rejected production site/database bindings,
  inherited mail credentials and missing staging markers. With the synthetic
  valid profile, login/health passed, all five unauthenticated workers were
  denied, production-origin lead intake was denied and CSP excluded providers.
  The harness blocked outbound networking and recorded zero attempts; its
  temporary process stopped. The original local review app still returned200.

Safe evidence: `staging/CREDENTIAL_PREPARATION_VERIFICATION.json`. Private
operation receipts and local logs are under
`/Users/noelsierra/Documents/Codex/2026-10-19/staging-credentials/`.

## Remaining release gates

The shared `staging/targets.json` remains unassigned/false. Installing credentials
has **not** made `readyToBuildForHosting` or `deploymentAuthorized` true. The
preflight still rejects the actual incomplete target; no synthetic readiness
flags are copied into it.

The existing preflight requires real scanner isolation/credentials, paired
source-file/database recovery and an assigned maintainer, as well as actual
runtime key binding, canonical links, visitor protection and private logs.
The home-Mac scanner preparation remains parked until the hardware is available.
Hosted visitor protection still needs proof on the canonical URL, every alias,
framework/direct-function path and CDN response. No existing check was weakened
to allow a scanner-free deployment, and no new upload area is activated.

Next, continue scanner-independent local workflow acceptance and prepare the
bounded hosted route/runtime checklist. Connect and verify the scanner and
remaining restore/operator evidence when available. Any protected staging app
deployment needs separate approval and a review of these existing gates;
production deployment remains separately prohibited. Keep Stripe, Resend,
Google, Twilio, SMTP, worker/webhook/intake credentials and recipients absent.
The Auth no-send guard must remain enabled.

References: [Supabase key roles and handling](https://supabase.com/docs/guides/getting-started/api-keys),
[Netlify secret contexts and scopes](https://docs.netlify.com/build/environment-variables/secrets-controller/),
[scope precedence](https://docs.netlify.com/build/environment-variables/overview/).
