# PR18 local upload-size and cache/access fixes

October 16, 2026. Based on main `89c3d59` (scanner activation review). That review
and its parent stack have been pushed to main with `[skip netlify]`. This follow-up
is local work; no hosted schema, environment, credential, scanner host or deploy
has changed. The earlier review remains a dated production snapshot.

## Implemented contract

All existing attachment forms now transfer nonempty files directly to the private
`platform-upload-staging` bucket with the actual user's JWT. Form submissions
carry a short reference instead of binary bytes. iPhone job-photo uploads use the
same transport, followed by the existing authenticated photo command. Old multipart
photo requests remain supported for compatibility; their hosting payload limit is
not changed. Coordinate the native release with a future approved server release.

The holding area is not a business document library. Only active internal workers
can insert into their own UUID namespace. Ordinary clients cannot download, sign,
list, replace or delete its objects, irrespective of business-area scan switches.
It accepts at most 25 MiB per object. The server checks actual ownership, age,
size, immutable object version and live account access before hydrating a reference.
References can be consumed for one hour; they are not download credentials.

The original action still performs its original role checks, destination Storage
INSERT under caller RLS, MIME/extension/signature validation, image normalization,
metadata writes, scan commands and audit work. Existing 6/10/15/25 MiB area limits
and the 26 MiB aggregate form budget remain. A reference from another user or an
expired/invalid transfer fails before business mutation. A failed transfer does
not submit the form. A reference is transport state, not an exactly-once business
command; the existing financial idempotency and uncertain-write recovery remain.

Only newly owned temporary transport buffers are removed after an acknowledged
successful action or its successful navigation. Cleanup failure never retries the
business action. Failed, abandoned or uncertain transfers stay private for review;
no timed cleanup worker or business-file purge was added. They cannot be consumed
after expiry. Retention/operating review must account for these private buffers.

Existing attachment links now point inside the CRM. A security-invoker descriptor
requires both caller-visible metadata and the exact current Storage object under
its original RLS and scan gate. Delivery uses the actual user's JWT, never the
service key or a raw signed URL. Each request checks current access. Large files
are read in explicit chunks of at most 1 MiB, bound to an object version before
and after reading, then assembled in browser/native memory. Full-body or malformed
upstream range responses, stale versions, truncation and access revocation fail
closed. This avoids Netlify's documented 20 MB streamed response limit as well as
its roughly 4.5 MB binary buffered request limit.

Manifest/chunk/error/redirect responses explicitly disable browser and both CDN
cache layers. Origin fetches use no-store, a fresh cache nonce and authenticated
Storage access. New final uploads use cache lifetime zero as defense in depth.
Thumbnails load only when visible and use memory Blob URLs. Viewer URLs are
revoked on cleanup; native requests ignore local/remote URL caches, and image
views discard their in-memory image on disappearance. Legacy `signed_url` /
`signedUrl` response field names remain for compatibility, but contain CRM record
routes, not bearer Storage links.

A previously issued signed URL or a file already downloaded cannot be revoked by
this change. No files were deleted or Auth keys rotated to simulate revocation.
Hosted CDN behavior still needs an approved isolated staging test; local evidence
cannot certify a CDN or Netlify adapter that was not deployed during this work.

## Changes and preservation

One additive migration: `20261017000918_private_upload_transport.sql`. It adds the
private holding bucket, four narrowly scoped Storage policies and two bounded RPCs.
All 91 previous migrations, 241 existing application functions, and existing public
and Storage policies are preserved. No original scan switch, classification,
permission boundary, offboarding transaction, financial command or audit trigger
was changed. The effective-access checks still apply to previously issued JWTs.

The original upload controls, saved wording, photo categories and employee UI
remain. The small private-file viewer uses the incumbent CRM frame, type, palette,
44px actions and phone layout, with loading/unavailable/retry states. It offers
memory previews for images, opening PDF/text files and downloads for every allowed
type. File names retain extensions. Native image transport is updated; no native
visual redesign is included.

Only development CSP adds the explicitly configured loopback Storage origin.
Production CSP stays unchanged. Cookie upload initiation requires the configured
app origin (or actual request host when unconfigured); native requests require a
valid bearer session. No new secret or environment value was added or exposed.

## Verification

- 679 unit/regression tests passed, including caller-scoped batch reads, bounded
  range delivery, version/access changes, truncated/ignored ranges, CSRF origins,
  file-only direct transfer and failed-transfer handling.
- 10 new disposable upload/access scenarios passed (11 tests including parent):
  25 MiB authenticated transfer, actual ClamAV release, tiny action reference,
  exact 25-chunk byte reconstruction, inaccessible holding objects, theft/expiry,
  area limits/normalization, aggregate budget, caller/CSRF rejection, archive/scan
  rechecks, six native photo categories/audit and old-JWT deactivation.
- 24 existing remaining-attachment scenarios passed (25 tests including parent),
  extended to exercise authenticated delivery and denied foreign callers in all
  six areas. Existing document and provider/audit integration results are recorded
  with the local verification report.
- Typecheck and optimized Next build passed. Schema contract generated against a
  new disposable CLI stack; an independent PostgreSQL replay passed all 92
  migrations. Existing definitions/policies match the previous clean replay.
- Schema lint: zero warnings/errors. Security advisors: zero warnings/errors;
  26 existing informational notices describe deliberately closed private tables.
- Browser: actual 25 MiB upload through the live form, passed scan, file viewer,
  authenticated thumbnail, loading/empty/error recovery, keyboard focus and
  desktop/390px responsive layout. Only synthetic local records/files were used.
- Swift Foundation transport sources typecheck; four compiled transport scenarios
  passed (staged upload, authenticated chunks, revoked read and oversized file).
  SwiftUI files parse. Full XCTest/iPhone/iPad runtime verification requires Xcode;
  the installed command-line SDK does not provide XCTest or the iOS simulator.

Local evidence directory: `Documents/Codex/2026-10-14/pu/work/upload-access` under
the current user's home. Credentials remain in pre-existing private files outside
Git; only nonsecret result summaries should be shared.

## Next release gate

Keep production on hold. Continue the existing PR18 activation runbook: reconcile
hosted migration history, prove isolated targets, prepare the company-controlled
scanner host, credential scope, signature updates, retention and restore process.
Then obtain approval for an isolated staging release to prove actual supported
upload sizes, native compatibility, private caching and revocation across the
Netlify/Supabase delivery path. The local migration chain now contains 92 versions;
repeat the hosted inventory/history review before any release. Do not infer that
all unrecorded versions are absent or run a blind db push.

No bulk legacy scanner, purge worker, customer communication, recurring task or
production activation is part of this fix.

References: [Netlify function limits](https://docs.netlify.com/build/functions/configuration/),
[Supabase authenticated downloads](https://supabase.com/docs/guides/storage/serving/downloads),
[private CDN behavior](https://supabase.com/docs/guides/storage/cdn/fundamentals),
[Smart CDN and cacheNonce](https://supabase.com/docs/guides/storage/cdn/smart-cdn).

## Focused design verification

Impeccable's fresh finish reviewer returned **ship for the reviewed web UI scope**
after the one P2 retry-button correction was scored resolved. The documentation
pass confirms the incumbent CRM pattern; no global design/token files changed.
Existing PRODUCT.md context drift was left untouched; a separate context refresh
can be considered later. This UI review does not certify native visuals or hosted
security. The local web preview remains available at http://127.0.0.1:3102.
