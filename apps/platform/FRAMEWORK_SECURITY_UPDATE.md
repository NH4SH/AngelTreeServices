# Next.js and React security update

October 23, 2026. Verified local candidate on `codex/framework-security-update`, based on current main `eb916ca`. Migration 118 reconciliation and its preserved-terms prerequisite are now pushed to main. No app deployment, production change, credential rotation or customer communication occurred.

## Decision and change

This is the separate framework follow-up identified during the Node runtime investigation. [Next's October 14 advisory](https://nextjs.org/blog/nextjs-security-update-october-14-2026) fixes the Cache Components typed-array RCE, upstream SVG-processing issue and Server Actions denial of service in 16.4.1. [Next 16.4.2](https://github.com/vercel/next.js/releases/tag/v16.4.2) includes those fixes and subsequent stabilization. The [React upstream advisory](https://github.com/react/react/security/advisories/GHSA-xqc2-xf4c-x3h3) and [Server Functions advisory](https://github.com/react/react/security/advisories/GHSA-h3gv-c5rc-p453) identify 19.2.9 as the fixed backport on this app's existing React minor line.

The application now pins **Next 16.4.2**, **React 19.2.9** and **React DOM 19.2.9**. Previously locked versions were 16.3.8 and 19.2.6. The npm lock delta changes only that trio and Next's matching `@next/env`/platform compiler packages. Sharp stays at the already-fixed 0.35.5; Supabase, Stripe and all unrelated dependencies are unchanged. No business component, server action, authorization command, RLS policy, migration, term, amount, email payload or hosting configuration was edited.

`scripts/release/verify-framework-security.mjs` performs an offline check of exact stable declarations, npm lock identities/integrities and, with `--installed`, actual installed versions. It checks Next independently from the direct React pair because Next carries its own RSC implementation. Affected standalone/nested RSC package entries are also rejected. The ordinary build runs this check first, so an old cached installation cannot silently build under a patched lockfile. `npm run framework:check` runs it explicitly. The policy covers the reviewed October advisories and supported lines, not every future advisory or arbitrary major upgrade.

The bounded source check still finds Server Actions (40 files), making that fix relevant. It finds no `ImageResponse`, `use cache`, `cacheComponents` or `dangerouslyAllowSVG` use in application/config source. That search is not proof of complete non-exposure. [Netlify's assessment](https://www.netlify.com/changelog/2026-10-14-nextjs-react-security-vulnerabilities/) recommends upgrading despite its platform-specific mitigations. No exploit, load attack or production probe was run.

## Verification

| Check | Result |
| --- | --- |
| Clean isolated `npm ci` and actual installed dependency check | Passed |
| Complete CRM regression suite on Node 22.23.4 | **2,411 passed; zero failures/skips** |
| Same suite on Node 24.22.1 | **2,411 passed; zero failures/skips** |
| Security-floor negative/positive cases | Seven tests, included in each full suite |
| Route types, TypeScript and optimized Next builds on both patched Node lanes | Passed |
| Production dependency audit | Zero known reported vulnerabilities |
| Compiled loopback app acceptance | Five groups passed |
| Actual installed staging terms/expiry commands | 30 + 30 assertions; synthetic data rolled back |
| Staging SQL-produced proposal/invoice through patched React DOM server renderer | Two cases passed; legacy output, records and $100 totals retained |
| Local offline Netlify adapter packaging, adapter 5.16.3 | Passed; six functions and five schedules retained |
| Source/lock/migration preservation and whitespace check | Passed |

The compiled app checks cover liveness, login/static rendering, security headers, all five worker authorization denials, unavailable synthetic document links, a missing private file, a real compiled Server Action carrying benign multipart input, and rejection of a mismatched Origin. With no provider/database credentials in this test server, the valid action returns the existing configuration denial rather than signing in. This proves ordinary action decoding and the Origin boundary, not a successful account sign-in or an end-to-end customer mutation. The loopback server was stopped afterward.

The two native builds and compiled server attempted zero external application requests. During offline Netlify packaging, the tooling still tried a public plugin-list lookup, edge-type update and dummy `master--site-name.netlify.app` warm-up. The local preload blocked all three before transmission; their call sites were verified as Netlify tooling, and packaging completed using the existing cached adapter. These are not CRM/provider requests or evidence of hosted execution. No global telemetry/account preference or repository Netlify configuration was changed.

The current staging target remains `gbyhdsuiqeslgjdnbqng`, **118 migrations**, latest `20261023030829`. Fresh before/after evidence matches the read-only 118 contract: exact native ledger, all 5,110 catalog objects/permissions, 49 protected business/Auth/history sets, immutable terms bindings and the Auth no-send guard. Automatic sending, appointment notices and recurring generation remain OFF. No staging schema or setting was changed by this batch.

Staging acceptance uses its actual installed database commands and SQL-produced synthetic records through renderer adapters. The patched app was **not uploaded to hosted staging**, and no hosted browser, real mailbox, live payment or physical-device acceptance is claimed. Existing fixture-expansion React key notices and the typeless-module warning remain test-harness diagnostics; they are not a newly reproduced product defect.

## Preserved work and release boundary

The employee redesign, dashboard release, customer journey/terms preservation, financial and communication safeguards, scanner and all earlier work remain intact. Existing local previews retain their original installed dependencies; verification used a clean tracked-source copy with separate `npm ci`, no ignored environment files, and no provider credentials. After switching this branch into a fresh development environment, run `npm ci` before building. The isolated tested copy is under the evidence directory, not a new Git repository.

The Node runtime security branch remains separately at `06580f6`; it was neither merged nor modified. A patched framework does not patch Netlify's managed Node runtime. Ticket **#1151908** is awaiting Netlify's response after the approved correction; production's actual Node patch remains unverified. This report does not grant production or hosted activation readiness, and no duplicate support message was sent.

Next: once Netlify confirms patched runtime availability, perform an explicitly authorized isolated hosted acceptance of the reviewed release combination before any production rollout. The customer terms policy decisions in `CUSTOMER_TERMS_REVIEW.md` also remain open; no business wording was chosen during this security batch.

Sanitized receipt: `staging/FRAMEWORK_SECURITY_VERIFICATION_20261023.json`. Private evidence: `/Users/noelsierra/Documents/Codex/2026-10-23/framework-security-update/`, containing clean build source, both lane logs, staging snapshots/fixtures, compiled acceptance and the undeployed Netlify artifact. Credentials, complete logs, local build keys and raw snapshots stay outside Git. This new security candidate is committed locally, pending a separate push request.
