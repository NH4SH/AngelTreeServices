# Local permissions and private-file acceptance

**Published October 20:** the verified package is pushed to main and
`codex/dashboard-attention-layout` at `b2a0b22`, with `[skip netlify]`.
The verification snapshot below records the earlier local verification state.
The next local follow-up is documented in `DASHBOARD_URI_READINESS.md`.

Verified October 20, 2026, against main `8327a33` on the existing disposable
review stack and app at `http://127.0.0.1:3102`. This continues the existing
CRM/staging roadmap. Nothing was pushed, deployed or changed in production.

## Decision

The tested role and private-file boundaries pass. One small privacy-header defect
was found and fixed locally: Next's general `/files` configuration overrode the
download handler's `no-referrer` policy with `strict-origin-when-cross-origin`.
The file route configuration now preserves `no-referrer`, including the viewer.
The real HTTP regression initially caught this mismatch and passes after the fix.
No authorization, offboarding, financial, Storage policy or transaction changed.

## Verified behavior

- Owner/admin can read staff and employee-sensitive documents. Payroll/estimator
  can read staff documents but cannot read employee-sensitive documents. Crew,
  customer and property-manager roles cannot read those office documents.
  Checks cover metadata RLS, file descriptors, actual HTTP bytes, bearer sessions
  and SSR cookie sessions. Payroll/estimator invoice and quote directory reads
  remain allowed under the existing rules; reading is distinct from collecting
  money. Non-owner/admin actors cannot invoke invoice voiding or change employee
  access. No financial boundary was broadened.
- Assigned crew can upload a photo through the real native-compatible HTTP route
  and read its private bytes. Removing the assignment blocks the next chunk;
  restoring that synthetic assignment restores access. Existing suites also
  verify all six photo categories and mandatory upload history.
- Each of the five staff roles loses file access with its exact original JWT and
  cookie immediately after the existing deactivation command. A previously open
  manifest does not authorize another chunk. Upload initiation and new signing
  fail. Reactivation restores the previous role assignments and permitted reads,
  while time-clock permission remains disabled for separate review.
- Anonymous/foreign/forged callers and unknown files are refused. Archive,
  classification changes, scan holding, stale versions and oversized ranges are
  checked on the next request. Successes, denials and range/version errors retain
  no-store headers, both CDN no-store directives and the corrected referrer policy.
- Existing real suites pass 25 MiB direct private transfer, exact 25-chunk byte
  reconstruction, inaccessible holding objects, stolen/expired upload references,
  original area/aggregate size limits, normalization, CSRF checks, employee and
  supervisor classifications, private receipts, object replacement fencing,
  expired scan claims, service-command denial and quarantine in all seven areas.

## Results

Counts include parent/subtest results, matching the existing reports. Repeated
runs are not double-counted. Final runs have no failures or skips.

| Suite | Passing results |
| --- | ---: |
| Existing issued-JWT offboarding | 6 |
| Existing document scanning, real ClamAV and HTTP downloads | 12 |
| Existing remaining attachment scanning and permissions | 25 |
| Existing large upload/access checks | 11 |
| New seven-role/private-file HTTP acceptance | 17 |
| **Local integration total** | **71** |
| Normal CRM unit/PostgreSQL regression gate | 801 |

Typecheck and optimized Next build passed in a separate source copy containing
the current application changes and synthetic staging configuration only. It had
no project `.env`, real credentials, Netlify link or selected schedules; its
synthetic readiness flags were not copied back. The running review app and its
browser session were preserved. Offline schema contract passed from the real
repository, where the migration sources are available. The first schema command
in the app-only build export could not locate those sources; this was an export
layout issue, not schema drift. Public website code was untouched.

The new suite signs out its eight synthetic actors globally, disables/separates
them, archives its own library documents and retains audit/business records.
Existing suites retain their synthetic history and disable their own remaining
actors; the older offboarding suite removes only its own disposable Auth users.
All test-process HTTP destinations were restricted to local services. No hosted
credentials or provider send was used. The only external operational request was
the local antivirus definition updater downloading official public signatures.

## Issues resolved during verification

1. The local ClamAV definitions were more than 48 hours old. The bridge correctly
   returned unavailable instead of falsely approving clean files. Official
   definitions were updated to version 28158 and reloaded in the existing local
   daemon, without restarting/resetting the CRM or weakening the age check.
   Subsequent actual clean/EICAR checks passed. The standalone test creates an
   ephemeral loopback bridge; the initial transport allowlist also needed to
   allow that loopback `/scan` endpoint. Both failed attempts remain in private
   evidence and are not counted as passing runs.
2. The old offboarding fixture upserted existing role names, advancing
   `roles.updated_at` for five local staff roles on the first run. That fixture
   now uses `ignoreDuplicates: true`; later runs preserve existing role rows.
   These timestamp changes are explicitly excluded from the preservation claim.
   Role identities, descriptions and permissions were not rewritten. Timestamps
   were not artificially reset to conceal the test side effect.
3. The actual file HTTP headers exposed the referrer-policy override described
   above. A narrow application change plus a header regression test fixes it.

Before testing, fingerprints were captured for all 110 existing public tables,
the migration ledger, application function definitions, policies, constraints,
scan settings and bucket configuration. Afterward, every pre-existing public-row
fingerprint outside `roles` remained present. Five role fingerprints changed from
the initial fixture timestamp writes; the other 109 tables and all captured
configuration/schema fingerprints were preserved. No RLS, grants or triggers were
disabled. The iterative review stack retains its 68 native ledger entries; this
was not reported as a new 93-migration replay.

## Limits and next step

A signed Storage URL is a bearer credential until it expires. The new suite
verifies actual expiry and separately confirms that a synthetic 30-second link
issued before deactivation remains usable during its lifetime. Already downloaded
bytes cannot be recalled either. Current CRM/native file links use authenticated
record routes instead, so subsequent requests recheck access. Do not describe
that guarantee as retroactive invalidation of historical signed URLs.

Local evidence cannot certify Netlify CDN/adapter behavior, aliases/direct
functions, hosted visitor protection or actual hosted runtime key binding.
Those checks remain in the existing protected-staging checklist. Home-Mac scanner
connection, signature-update monitoring, paired file/database restore and operator
readiness are still required before the larger CRM release. No readiness flag,
scan activation in staging/production, or deployment permission was added here.

The preserved local dashboard renders with the original review session but shows
`Database notice URI too long` amid accumulated synthetic fixtures. Treat bounded
dashboard query construction as the next scanner-independent local follow-up;
do not erase history to hide it. This pass did not broaden into that change.

Local changes are based on current main, with no upstream commits missing.
Existing employee/UI/PR01–PR18 work, the production-only CSS hotfix branch and the
pre-existing untracked Impeccable files are preserved. Changes await review/push.

Private operational evidence is in
`/Users/noelsierra/Documents/Codex/2026-10-20/local-permissions-files/`.
Only the nonsecret summary is tracked at
`staging/LOCAL_PERMISSIONS_PRIVATE_FILES_VERIFICATION.json`.
