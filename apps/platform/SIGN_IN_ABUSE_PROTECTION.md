# Shared sign-in abuse protection — existing CRM audit follow-through

Verified locally October 17, 2026. Continues the original audit's open direct
sign-in limiter finding. No scanner dependency, new service, migration, role or
provider-configuration change. This is not a new roadmap or deployment approval.

## Publication and decision

The verified MacBook scanner preparation and earlier owner-direction/Netlify
evaluation commits are pushed to `main` and
`codex/pr18-home-mac-scanner-preparation` at **`26d1860`**. The merge preserves
latest main's website navigation (`4d7bb9e`); both the CRM regression suite and
public website build/validation passed before the atomic non-force push. Every
incoming/local commit and the merge have `[skip netlify]`.

Read-only Netlify checks before and after the push show the published CRM deploy
still `6ad23c757dfc53f702ae00b9`, and website deploy still
`6ad411e184f64f3612b4d6d1`. The website ID is the actual start-of-turn baseline;
older reports record an earlier website release. No published deploy was changed
by this task. The scanner ZIP remains an export from ancestor `f7221cc` and its
original manifest/hash remain valid; aligning with website-only changes does
not require rebuilding it.

Next scanner-independent work selected: close the existing audit's application
sign-in abuse gap. The web action previously forwarded every password attempt
to Supabase Auth. The CRM already has an atomic, service-only shared counter;
using it avoids a second rate-limit service, process-local counters, account
lookup/enumeration and new database privileges. The new work is local on
`codex/crm-sign-in-abuse-protection`, based on published main `26d1860`.
During verification, main advanced with homepage service descriptions at
`64ff25c`. Fast-forwarded this branch to include them before saving the new
security work; none of the incoming changes touches the platform. The final
branch preserves that newer main as well as the published scanner preparation.

Final read-only verification observed a **separate website release**:
`6ad4161bdbf2175dcdccac7e`, with source commit `64ff25c`, published at
2026-10-18T00:43:20Z (October17,20:43 Eastern). Netlify reports `deploy_source:api`;
this task made only read calls to Netlify and issued no deployment request.
Do not misreport the website as globally unchanged over the entire session.
Its earlier baseline/immediate post-push checks above remain historical facts.
The CRM published deploy is still `6ad23c757dfc53f702ae00b9`. No action was taken
against that separate website release.

## Resulting behavior

The ordinary web sign-in action consumes two existing database-backed budgets
before requesting a password session:

| Scope | Maximum attempts | Window | Stored action |
| --- | --- | --- | --- |
| Connecting address across all submitted emails | 60 | 10 minutes | `auth.password.ip` |
| Connecting address plus normalized submitted email | 10 | 10 minutes | `auth.password.ip-account` |

All attempted credentials count, including successes and provider errors. There
is no success reset or persistent account-lock flag. Emails are trimmed and
lowercased for bucket identity only; the existing trimmed input/password and
safe return URL still go to the existing cookie-scoped Supabase client. Raw
email/IP/password/session values are not stored by this limiter or logged.
Existing SHA-256 keys are pseudonymous identifiers, not a claim of anonymity
against dictionary guesses. The password is never part of a rate-limit key.

There is **no account-only bucket** an attacker on another network can exhaust
for an employee. A busy/abusive shared office/public NAT can still consume its
own address budget; this is the deliberate aggregate abuse boundary. Rotating
source networks/IPv6 addresses and direct SDK/native Auth requests are not
fully prevented by this web-only guard. Supabase's own controls remain required.
No direct Auth endpoint, mobile flow or provider limit was reconfigured.

The original fixed-window SQL function is unchanged: adjacent windows can admit
a boundary burst; repeated denials do not extend a window. Two counters are
separate atomic calls, not a new combined transaction. A partial/late request
can conservatively consume an IP count without a pair count. Never refund/reset
counters on success, timeout or uncertain completion. Existing probabilistic
expired-counter cleanup and retention are unchanged.

Both limiter calls share the existing three-second deadline helper, with an SDK
abort signal. Missing service configuration, missing trusted address, database
error, malformed result or timeout stops **before Auth** and returns a temporary
unavailability message. An exhausted budget returns a generic wait/retry message.
Neither message depends on whether an account exists. Invalid credentials keep
the identical existing rejection for wrong password and unknown account.
Unexpected Auth transport exceptions are sanitized. The three-second bound is
for the limiter, not a new promise about Auth's own network latency.

## Address trust and release gate

Hosted sign-in accepts only one valid `x-nf-client-connection-ip` address. It
does not fall back to arbitrary `X-Forwarded-For`, `Forwarded`, Host, or an
unknown-IP bucket. IPv6 spelling and IPv4-mapped forms normalize to one identity.
For `NODE_ENV=development` only, a single loopback forwarded address **and** a
loopback Host support ordinary Next development. This fallback is absent from
the production build. An invalid direct header cannot trigger the fallback.

Before any separately approved rollout, verify the actual isolated Netlify
Next adapter delivers the genuine connecting address to the action and replaces
client-supplied spoofed versions. Test IPv4/IPv6, forged headers, the service-only
RPC/key binding, healthy/unavailable counters and normal employee sign-in. If
the adapter strips the header, sign-in deliberately fails closed; resolve the
adapter boundary before release rather than trusting arbitrary proxy headers.
Production-mode direct `next start` without a trusted ingress is likewise not
enabled for sign-in by this patch. No new environment switch weakens this rule.

Supabase's server/proxy rate limits may still see the server address. This patch
does not silently introduce `Sb-Forwarded-For`, secret-key Auth clients or a
provider setting change. Such forwarding needs its own verified provider
configuration; do not bypass the existing user-scoped cookie client.

## Files and preserved behavior

- `src/app/login/actions.ts`: gate password requests, sanitize transport errors;
  safe local redirects, cookie client and unthrottled sign-out remain intact.
- `src/lib/security/sign-in-rate-limit.ts`: address policy, existing shared
  budgets and reused deadline helper. No new account/role query.
- `src/lib/security/rate-limit.ts`: optional SDK abort signal and strict reply
  validation. Valid existing RPC replies retain their behavior; strings such as
  `"false"`, missing/negative counters, impossible retry values and duplicate
  rows fail closed. Existing caller action names/limits and IP policy elsewhere
  are unchanged.
- Unit/integration tests and this handoff; no UI layout or financial change.

All 92 migration files, RLS/grants, offboarding commands, employee redesign,
financial/concurrency/reporting/communication work and scanner runtime/config
remain unchanged. No dependency/lockfile, production environment, account,
credential, startup service, network rule, business data or worker was changed.
No application feature was enabled in staging or production.

## Verification

| Check | Result |
| --- | --- |
| Credential-free regression suite, including 14 new tests | **754 passed**, zero failed/skipped |
| Disposable PostgreSQL/Auth/API integration | **9 passed** including parent, zero failed/skipped |
| Typecheck | Passed |
| Offline schema/migration fingerprints | Passed; all 92 retained |
| Optimized Next 16.3.8 production build | Passed in separate source-only copy |
| Incoming website navigation | Public interaction tests/build and all 15-page validation passed |
| Existing review app | Local health remains 200; existing session not signed out |

The real local database admitted exactly ten of twenty simultaneous IP/email
attempts. Changing email could not exceed the 60-address budget. Denials retained
their original expiry, another address remained usable, and ordinary/anonymous
JWTs could neither call nor read the service-only counters. Correct credentials
were blocked before Auth after the cap; another source still signed in. Known
wrong-password and unknown-account results matched. The first fixture lookup
used a noncanonical IPv6 spelling; corrected the test lookup and reran successfully.

A separate owned production-build server bound only to 127.0.0.1 uses the
existing disposable API. Its actual rendered login and compiled React/Next
server action were exercised over HTTP: exhausted budget produced no Auth cookie
or redirect; a missing direct header with forged forwarded address was denied;
a permitted sign-in issued the synthetic session cookie and preserved the
employee-page return path. Cookie values and passwords are not in reports.
The test server is stopped. No browser/user review session was signed out.

Only newly marked synthetic local Auth actors and rate counters were created;
new actors are disabled/banned and sessions revoked afterward. No role or
business fixture was needed. Existing local app/scanner and the stopped owned
hosting test stack are preserved. New build copy contains no environment or
Netlify linkage files; its build used no credentials. Logs/evidence live outside
Git under `work/sign-in-abuse-protection/`.

To repeat the opt-in local integration from `apps/platform`:

```sh
SIGNIN_DISPOSABLE_STACK=1 \
SIGNIN_LOCAL_STATUS_FILE=/private/local-test/local-status.private.json \
SIGNIN_BUILD_DIRECTORY=/absolute/source-only-built-copy/apps/platform \
node --experimental-strip-types --test tests/sign-in-rate-limit.integration.test.mjs
```

The private status must select exactly `http://127.0.0.1:54321`. Omitting the build
directory runs the seven database/Auth scenarios without the compiled HTTP
scenario. Build a separate source-only copy with local dependencies and no env
or linkage; do not build over the active review server's `.next` directory.
The optional results file contains test names/status only, not credentials.

## Operations and remaining work

Publication update, October 17: verified implementation `099315f` and the
independent-release observation `55d0ba5` are now pushed to `main` and
`codex/crm-sign-in-abuse-protection`, with deployment skipped. Read-only Netlify
checks during that push and the subsequent local appointment work show CRM
`6ad23c757dfc53f702ae00b9` and website `6ad4161bdbf2175dcdccac7e` unchanged.
This source publication did not apply hosted configuration or migrations.

Future authorized operators can inspect aggregate attempt volume by action and
window from the existing service-only table. Do not expose raw hashes or rows
to ordinary clients or log credentials. Counts reflect budget consumption,
including successful sign-ins; they are not confirmed password-failure metrics.
No external monitor, alert destination or automatic account ban was introduced.

Keep scanner/home networking parked until the owner is home. This security
follow-through is complete locally; hosted adapter/header/isolation proof and
any release remain separate approval gates in the existing plan. Leaked-password
protection/CAPTCHA/provider-forwarding options remain separate decisions; none
is silently enabled here.

## Official references reviewed

- [Supabase Auth rate limits and forwarding](https://supabase.com/docs/guides/auth/rate-limits)
- [Netlify connecting-address header guidance](https://answers.netlify.com/t/upcoming-change-stripping-exposed-netlify-headers-from-function-and-proxy-requests/52665)
- [Supabase changelog](https://supabase.com/changelog.md), reviewed for relevant interface changes before implementation.
