# PR18C: private document-library file checks

**Local implementation and verification only. No production activation.**
This first scanner rollout guards the `platform-documents` library. Employee
self-service/program files, equipment attachments, material receipts, job-cost
receipts and job photos retain their existing controls. F17 remains open for
those separate upload/download workflows; this package does not claim that all
CRM attachments have been scanned. Extend this same reviewed boundary to each
bucket with its own authorization tests before calling the wider rollout done.

## Behavior and authorization

Metadata is saved before the immutable file upload. A failed upload archives only
its newly created metadata, avoiding the former orphan-file cleanup path (staff
had no Storage DELETE permission). Existing file validation, classification,
linked records, archive/history and staff roles are retained. Server Action
parsing allows 26 MB to support the existing 25 MB file limit and multipart
headers; application and Storage size/type limits still apply. This is a code
change for later review, not a change to the hosted service. Check the hosting
platform's request limits before production; local verification cannot establish
Netlify upload-size support.

When checks are enabled, files remain held until the actual bytes downloaded
from private Storage pass the private scanner. A SHA-256 digest binds the verdict
to those bytes and to the server-prepared upload when available. One 90-second
lease owns a check. Expired attempts can be explicitly retried; stale tokens,
archives, concurrent checks and deactivation cannot finalize a clean result.
Role-management serialization and live actor/classification checks occur at both
claim and finish. Durable attempt history and completion audit are transactional.

Ordinary clients cannot set scan results or change a file's identity. No
"mark clean" control exists. Storage retains its existing staff/classification/
archive and PR02 effective-access policies, plus a restrictive clean-scan SELECT
policy when activated. Direct REST/Storage signing cannot bypass it. Authenticated
file replacement remains denied. The scanner's service client is server-only,
uses bounded requests, reads one claimed path and never signs a download.
Service administrators remain privileged; this is not a restriction on their keys.

Passed files open through a fresh, noncached staff-authorized download route,
which signs for 60 seconds when clicked. Long-open pages therefore remain usable.
Issued Storage signed URLs are bearer capabilities until expiration; deactivation
or quarantine cannot revoke one already issued. Before activation, allow the old
30-minute links to expire. Do not rotate production signing credentials here.

## Private scanner boundary

The owner selected **infrastructure under our control**, not a managed service
receiving document copies. `scripts/private-scanner/bridge.mjs` runs with Node 22
and built-in modules only. It receives bytes, not names, customer/employee details,
or database credentials. It authenticates requests, bounds size/concurrency/time,
and sends ClamAV INSTREAM frames to an isolated daemon. No files or verdict
payloads are written to disk/logged by the bridge. ClamAV may use its own temporary
parsing files; isolate its temporary filesystem and include it in retention and
backup review. Files themselves remain in existing private Storage; nothing is
automatically deleted, moved, released or backfilled.

The adapter requires an authenticated HTTPS `/scan` endpoint. HTTP loopback is
allowed only outside production. Redirects, URL credentials/query strings,
malformed/oversized replies, unknown verdicts/engine, wrong hashes, stale signature
sets (>48 hours), encrypted/over-limit content and scanner failures do not approve
files. A passed antivirus check is not a guarantee that a document is harmless.

ClamAV TCP itself has no authentication or encryption: never expose port 3310 to
the internet. Run bridge and daemon within isolated infrastructure. Terminate TLS
at controlled ingress, restrict access to the app, manage the shared token in a
secret manager, and use the supplied strict `clamd.conf`. Maintain supported engine
versions and signature updates; monitor failures, capacity and signature age.
The bridge defaults to binding loopback. No public scanner was provisioned here.

Server-only setup names (no values committed):

- `DOCUMENT_SCANNER_URL`: your controlled HTTPS endpoint ending in `/scan`.
- `DOCUMENT_SCANNER_TOKEN`: shared secret, at least 32 characters; never public.
- Bridge: same token; optional `CLAMD_HOST`, `CLAMD_PORT` (3310),
  `SCANNER_BIND` (127.0.0.1), `SCANNER_PORT` (3311).
- Existing Supabase service credentials remain server-only and unchanged.

Start the bridge with `node scripts/private-scanner/bridge.mjs` after securely
supplying those variables. No new package dependencies, production secrets,
external scanner account, provider deployment or recurring automation is added.

## Activation and recovery

The migration creates a private singleton setting with **enabled=false**. Thus
existing unscanned documents are not silently cut off by a staged schema rollout.
Only the disposable stack was explicitly enabled during this work. Before a
production activation, approve infrastructure/capacity, signature maintenance,
retention of held files/attempts/temporary scanner data, and handling of existing
unscanned documents. Reconcile deployed schema first under the existing migration
runbook. Enabling checks holds legacy unscanned files until an explicit check;
there is no bulk background scanning, default grandfathered "clean" status or
customer communication. Disabling the rollout is a deliberate operator decision,
not an automatic fail-open reaction to scanner downtime.

An unavailable file stays held and offers Check file. A quarantined file cannot be
retried into a clean status: archive it and upload a separate safe replacement.
A lost worker can retry after its lease expires. Scans never change HR review,
credentials, prices, payments, schedules, notifications or production data.

## Verification

The local disposable tests use real Auth, REST, Storage and live owner/estimator/
crew states. They cover pending signing/download denial; forged results and
identity changes; service-only RPCs; simultaneous claims; wrong/expired tokens;
hash mismatch; retry; replacement denial; restricted employee files; archive and
deactivation during scanning. A real ClamAV 1.5.4 daemon with current official
signatures and the supplied strict config passed clean stored content and held
the standard harmless EICAR test fixture. The authenticated app download route
returned held-file 404 and clean-file 303/download bytes, without caching.

Adapter/bridge tests cover authentication, URL restrictions, framing, malformed,
unknown/oversized responses, errors and stale signatures. Existing format/image
validation tests remain. Browser upload, failed retry feedback, desktop/mobile
layout and keyboard focus were checked. See the external PR18 report for final
whole-suite, typecheck, build, migration-replay and database-advisor results.
