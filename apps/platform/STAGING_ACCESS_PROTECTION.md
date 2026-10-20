# Local staging access protection — October 17, 2026

**October 19 follow-through:** independent hosted-staging gate credentials are now
installed as write-only site variables and verified locally; see
[credential preparation](STAGING_CREDENTIAL_PREPARATION.md). No app is deployed,
and hosted route/CDN/alias protection is still unverified. The original local
review gateway and the historical implementation observations below are preserved.

**Published/follow-through:** staging access/preparation is pushed to main and `codex/pr18-local-staging-access` at `bd206a8`, deployment skipped. The [hosting review](FREE_SCANNER_HOSTING_REVIEW.md) is now historical: the owner selected a Netlify/Supabase-first commercial direction and stopped Oracle verification. Scanner deployment remains unresolved. No host is provisioned and all hosted readiness gates remain open.

Status: **implemented and verified locally; hosted protection remains unverified**.
This continues the existing PR18 staging-isolation work. There is no paid service,
new dependency, deployment, hosted configuration change or database operation.
The owner selected a free approach; the earlier paid scanner recommendation and
Netlify plan/team route are alternatives for review, not approved purchases.

## Review locally

- Protected entry: `http://127.0.0.1:3110/admin`.
- Preview access status/end access: `http://127.0.0.1:3110/__staging-gate/login`.
- Normal CRM authentication and permissions remain required after the preview gate.
- The original developer server remains at `127.0.0.1:3102`, bound to loopback.
  It deliberately remains available. The local gateway demonstrates protection
  on port 3110; it cannot prevent someone with local machine access from using
  port 3102. Neither port is a public staging deployment.

From `apps/platform`, using Node 22:

```sh
node staging/access/local.mjs --init
node staging/access/local.mjs --config /absolute/path/from-init/config.private.json
```

Initialization prints **file paths only**. It generates a fresh private temporary
directory (0700), `config.private.json` and `access-code.private.txt` (0600), with
exclusive creation. It never overwrites an existing file or edits an `.env`.
Open the private access-code file locally and paste the code into the form.
Keep those files out of Git and shared reports. Temporary files may disappear
after restart/cleanup: generate a new set then, rather than reusing application
or service credentials. The launcher reads the configuration at startup.

Stop only the gateway process with Ctrl-C; this leaves the CRM server alone.
To rotate access, stop it, initialize fresh credentials and start with the new
configuration. Starting with the new key invalidates old gateway sessions on
that instance. No Supabase or CRM credential is changed.

## What is protected

The shared Web API handler gates every route before forwarding: documents,
APIs, static assets, image paths and direct function paths. Anonymous API/asset
requests receive 401; browser document requests receive the access form.
There are no public health, webhook or function exceptions. This is suitable
for the current provider-disabled staging mode, not live provider callbacks.

The generated access code and signing key are independent random 256-bit values.
The runtime stores an HMAC verifier instead of the plaintext code. Signed,
audience-bound sessions expire after four hours. Native WebCrypto verifies
signatures. Missing/invalid configuration, wrong origin/site, tampered/expired
cookies, duplicate gate cookies and middleware-subrequest claims fail closed.
Login/logout require same-origin POSTs. Return destinations are local and
normalized; form values are escaped. Form bodies are bounded to 2 KiB.

Hosted cookies use the `__Host-` prefix, Secure, HttpOnly, SameSite=Strict and
Path=/, with no Domain. The explicit IPv4 loopback-only test launcher uses a
different cookie name over local HTTP. That local mode is unavailable through
the hosted adapter. Gate cookies are removed before forwarding; CRM cookies,
Bearer authorization and multiple upstream Set-Cookie values are preserved.
Browser and CDN cache headers are forced to private/no-store and responses
marked noindex. This does not constitute live CDN verification.

The local gateway streams binary/25 MiB uploads and compressed responses,
rewrites redirects to the review origin and rejects WebSocket upgrades.
It can proxy only an explicit high-port IPv4 loopback origin. It cannot proxy
production or remote destinations. No access codes or keys are logged.

## Limits and hosted release gates

- This is a shared preview code, not individual identity, MFA, CRM authorization
  or a replacement for RLS. Use only the generated high-entropy code; there is
  no distributed brute-force limiter or per-person access audit.
- Ending preview access clears this browser's gate cookie. It does not revoke
  a stolen copy server-side; absolute expiry and key rotation are the controls.
- The future Netlify Edge adapter is selected **only by a new isolated staging
  source export**. Production `netlify.toml`, Next proxy, dependencies, app
  features, migration history, database grants and scan switches are unchanged.
- The isolated export selects a noncached `/*` Edge declaration with fail-closed
  error behavior and an empty scheduled-functions directory. A prebuild check
  rejects missing/invalid gate settings and unassigned/wrong target bindings.
- Future private `STAGING_GATE_KEY` and `STAGING_GATE_VERIFIER` belong only to
  the separate staging project in build and runtime/Edge scopes. Never use a
  public prefix, TOML literal, Git or a production/shared-team secret. No hosted
  gate credentials have been installed in this task.
- Netlify adapter execution, actual CDN behavior, every deploy/preview alias,
  direct function URL, framework/skew route and old immutable deploy must be
  verified on the actual isolated host before claiming visitor protection.
  Old deploys must be retired/checked; key rotation is not a claim that frozen
  old deploys have lost their former keys. No alternate hostname is allowed by
  the current exact-origin policy. Do not flip readiness flags from local tests.
- Shared `staging/targets.json` remains unassigned/false. The target inventory's
  hosted protection/build/deploy readiness flags remain false. Scanner hosting,
  an operator, source-file recovery, isolated mail/runtime keys and Auth evidence
  remain separate existing PR18 gates. No hosting plan or scanner is provisioned.
- Local use costs nothing and adds no service. Future Netlify execution remains
  subject to its then-current quotas; this is not an unlimited free-host promise.

## Verification

- Full regression suite: **731 passed, zero failures/skips** (includes 13 new
  gate unit tests). Typecheck passed.
- Real loopback gateway suite: **5 passed, zero failures/skips** (one parent and
  four subtests). Synthetic upstream only; no database/provider mutations.
- Actual review app: anonymous health 401; correct-code login 303; authorized
  health 200 and admin routing; original health 200. No app write requests.
- Browser: wrong code stays denied; correct code renders CRM with its existing
  login; end access returns to the gate and denies the next admin visit while
  the original CRM remains signed in. Keyboard focus and error association checked.
- Responsive template rendered at 390×640; actual desktop gate at 1280×720.
  This was a narrow iframe layout check, not physical-device/mobile-cookie proof.
- Browser testing found an Origin failure caused by `no-referrer`. Gate pages
  now use `same-origin`; existing CRM policy is preserved. Strict Origin checks
  remain enabled. The independent visual reviewer requested a stronger input
  border; that correction retains the visible keyboard focus treatment.
- Existing dashboard “URI too long” notice reproduces directly on port 3102;
  it is unrelated to the gateway and was not changed in this scoped task.
- No application source/build inputs were changed. Existing typecheck/regression
  coverage was run; no additional Next production build or Netlify deployment
  is claimed. The committed source export at `25f8393` includes the catch-all
  gate and no scheduled functions or credentials. Both unassigned-target preflight
  and missing-gate-settings checks correctly fail with exit 1. All 13 gate unit
  tests pass again after the border correction.

Local screenshots and raw logs are retained outside Git in the existing Codex
work directory. No business screenshots, access codes or key material are
included here. See `staging/ACCESS_PROTECTION_VERIFICATION.json` for the
machine-readable scope and `STAGING_PREPARATION.md` for the broader release gates.

Adapter design references: [Netlify Edge declarations](https://docs.netlify.com/build/edge-functions/declarations/),
[request chain](https://docs.netlify.com/resources/troubleshooting/request-chain/),
[Edge API](https://docs.netlify.com/build/edge-functions/api/) and
[failure behavior](https://docs.netlify.com/build/edge-functions/optional-configuration/).
