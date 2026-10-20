# Staging Auth email guard activation — October 19, 2026

The reviewed no-send Auth hook is **installed and enabled only on CRM Staging**
(`gbyhdsuiqeslgjdnbqng`, ATS). The original function bytes, private invoker model,
exact grants and all93 application migrations are preserved. The app remains
undeployed. No production configuration, credentials or data changed.

The activation review `a311c0e` is published to main and its preserved branch
through `d0241d7`. That merge also preserves the independently received public-site
analytics work `cc9ebb7`; this task did not publish that website. The public-site
deploy present at the start of activation was `6ad55139227a40602bbc1df3` and the
CRM deploy was `6ad23c757dfc53f702ae00b9`.

## Operation completed

- The interrupted operation had already committed the staging installation. On
  resumption, fresh reads proved the exact function, metadata, role privileges,
  database identity/version and unchanged93-candidate state. The install was not
  replayed. Expired review evidence was renewed only after those full readbacks.
- The targeted transaction used the normal migration owner and the existing
  reviewed private schema/function statements. There is no migration94 or hosted
  migration-history entry. Neither RLS nor managed/default grants changed.
- Activation changed **only** `hook_send_email_enabled` to true and
  `hook_send_email_uri` to
  `pg-functions://postgres/ats_staging_auth/reject_email`. Effective full
  Auth/API configuration readback matches precisely that two-field change.
- Auth remains GoTrue `v2.197.0`, matching the tested local image. Public signup
  stays OFF; email/password stays ON; staging Site URL/reset redirects, templates,
  provider settings, SMTP settings and rate limits are unchanged. The hook schema
  remains outside the exposed Data API schemas.
- Existing staging-only publishable/admin keys were retrieved for the test
  process and kept in memory. No key was created, rotated, printed, committed,
  copied into an env file or installed in Netlify. No production key was read.

The resulting function is still a constant503 rejection, owned by normal postgres,
SECURITY INVOKER, with an empty search path and only Auth execution permission.
Its body MD5 remains `3217b69110500f25a29e85e4cb945b7f`. It has no tables, payload
storage, logging or network calls. Direct and inherited Auth/API permissions were
rechecked after activation. The API roles have no access to the schema/function.

## Synthetic hosted verification and its limits

The single bounded test run created two uniquely tagged `@example.invalid` users
through the supported staging Auth Admin API, without sending confirmation mail.
It performed15 client checks:

| Check | Result |
| --- | --- |
| Empty staging and two synthetic fixture creations |200, no email sent by creation |
| Password sign-in and refresh |200; correct identity |
| Wrong password |400 |
| Recovery, invite, magic link, confirmation resend, email change |All rejected; clients received429 |
| Signed-in identity/email preserved |200; original account/email |
| Public signup still disabled |422 |
| Global sign-out |204 |
| Refresh after sign-out |400 |

The client429 results alone were **not** accepted as proof that the hook ran.
A bounded server-log review correlated one recovery request ID with **two hook
error events returning the expected staging rejection, two completed503 records,
and a final429**. This confirms actual hosted Auth invocation of the reviewed
function. The sequence is consistent with an intermediary retry of a503 response;
the exact retrying component was not independently identified. The client script
issued one recovery request and contains no automatic retry loop.

The existing project limit is two email attempts per hour with a60-second
per-user minimum. No limit was raised, disabled, reset or changed. The other four
email routes were rejected by that shared limit before their own hook responses
could be observed. Their direct hook/error behavior is covered by the existing
real local Auth/Mailpit suite, but a **complete hosted per-route503 matrix remains
unverified**. Do not present15 client checks as15 independent hook invocations.
Do not disable the hook or relax limits to obtain another result.

There were no successful mail responses. In the bounded Auth/edge log window,
no synthetic payload canary or SMTP-named event appeared; no postgres log rows
were returned for that window. This is a scoped log observation, not a complete
provider-side delivery audit. No hosted SMTP positive-control request was made.
Successful hosted email delivery remains intentionally unclaimed.

Both owned test users were deleted after global sign-out. Fresh database counts
confirm **zero Auth users, identities, sessions, refresh tokens and public
profiles**. Original application data counters are still zero and communication,
recurring and scanning switches remain OFF. Audit/log history is retained; no
shared reset, business-row cleanup or audit purge was performed.

## Repeatable read-only checks

`supabase/staging/auth-email-guard/active-profile.json` records the current safe
configuration fingerprints and original function body. Historical local/review
profiles remain unchanged. No secret value is stored in this profile.

The existing review CLI now supports an explicitly read-only active-state mode:

```sh
STAGING_SUPABASE_BIN=/absolute/path/to/supabase \
node scripts/release/review-staging-auth-activation.mjs \
  --project-ref gbyhdsuiqeslgjdnbqng \
  --auth-config-file /private/fresh-managed-config.json \
  --verify-active
```

It requires a fresh private effective-config GET, verifies independent project and
physical database identity,93-source/ledger/catalog/grant/default state, exact
installed function/schema/effective privileges and current full Auth/API
fingerprints. It rejects a disabled/replaced/exposed hook, unknown permissions,
config drift, nonempty initialization state or stale evidence. It does not apply,
repair, generate credentials, send mail or claim to repeat historical synthetic
proof. This is an **empty-target maintenance check**, not a general health check
for a populated staging test run. Unknown later changes require explicit review,
not editing fingerprints until a check passes.

795 CRM regression results pass, including three new offline active-verifier
cases; typecheck and schema-contract checks pass. All152 public-site JavaScript
checks pass after preserving the independent main update. Hosted security
advisors report no hook-specific finding and no errors; the retained INFO for RLS
without policies and WARN for the guarded authenticated definer remain outside
this change. No new app build/deploy was needed for operations/evidence changes.

## Current boundary and next work

The Auth no-send route is verified as active with bounded hosted recovery proof.
The broader Auth isolation/runtime readiness flags remain false. Netlify still
has no deployed staging app and no installed application/gate/server credentials.
Visitor protection/aliases, actual app runtime and scanner readiness remain open.
The separate original scanner preparation is untouched.

Continue the existing staging sequence with staging-only runtime/private-key and
visitor-gate preparation; an app deploy still requires its own authorization.
Record the remaining per-route hosted message check when the existing limit
permits it. If explicit503 messages must reach a staging client, consider a
separately reviewed non-retryable denial response; this operation deliberately
retains the exact reviewed503 function and makes no response-code change.

Keep the hook enabled if a future check fails. Removing/disabling it restores the
built-in mail route; a private CRM page does not close direct Auth APIs. No hosted
uninstall or automatic rollback-to-SMTP command is supplied.

Safe evidence: `staging/AUTH_GUARD_ACTIVATION_VERIFICATION.json`. Private metadata,
operation receipts and synthetic cleanup journal live outside Git under
`/Users/noelsierra/Documents/Codex/2026-10-19/staging-auth-activation/`; the original
interrupted installation receipt is retained in the October18 evidence folder.
