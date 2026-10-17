# Private attachment checks

PR18 extends the existing document-library pilot to every remaining CRM upload
area. The scanner is run within infrastructure we control; no managed scanning
service receives document copies. This implementation is verified locally.
The hosting/retention/legacy review is recorded in
[SCANNER_ACTIVATION_REVIEW.md](SCANNER_ACTIVATION_REVIEW.md), with its
[staged runbook](SCANNER_ACTIVATION_RUNBOOK.md). Production activation remains
on hold pending the documented readiness gates and explicit release approval. Nothing here authorizes deployment.

## Coverage

| Private bucket | Existing workflows |
| --- | --- |
| `platform-documents` | Existing PR18 document library; original scan workflow retained |
| `employee-files` | Staff/self-service credentials, employee documents and profile photos |
| `employee-program-files` | Training and safety attachments/photos |
| `equipment-files` | Equipment documents and crew problem-report photos |
| `material-files` | Inventory movement attachments, purchase/disposal receipts, delivery proof and stockpile photos |
| `job-cost-receipts` | Direct job-cost receipts |
| `job-photos` | Shared web/mobile upload command, all six photo categories |

Every upload still uses the original authenticated Storage client, file-format
validation, image normalization, metadata writes and audit rules. Checking an HR
file does not approve a credential or change its classification. A scanner outage
holds the attachment while allowing its cost, credential or report metadata to
save; it does not change amounts, cost review status or financial transactions.

## Download boundary

Migration `20261016231215_remaining_attachment_scan_boundary.sql` adds private
settings, object records and durable attempts. All six rollout switches default
OFF. Applying the schema does not scan old files, declare them clean or enable
checks. With a switch OFF, the existing Storage permission rules still decide
access and the UI says checks are not enabled. With it ON, Storage also requires
a passed scan of the current exact object/version. A hidden UI link is not the
security boundary. Only the original uploader or an active owner/admin can
request a check; existing metadata visibility is also required by the app.

A Storage trigger captures authenticated ownership from the request or Storage's
system-assigned `owner_id`, plus object ID/version and a new generation. Client
ownership forgery and ordinary replacement/move are denied while checks are ON.
Privileged replacement, retirement and delete/reinsert invalidate approval and
outstanding attempts. Access-timestamp changes do not invalidate content scans.
Trusted out-of-band modification of underlying blob storage without its Storage
object metadata is outside this boundary and must not be used as an upload path.

Service-only claim/finalize functions enforce live effective access, uploader or
admin eligibility, a single 90-second lease, exact generation/object/version,
prepared/stored SHA-256 binding, expiration and acknowledged finalization. Results
and minimal audit events commit together. Unavailable/expired checks are explicitly
retryable; quarantined files cannot be manually marked clean. Add a safe replacement
through the original record. No quarantine deletion or retention job was introduced.

The source/check views use `security_invoker` and original metadata RLS. Scan state
visibility never grants download access: the UI's `can_open` also evaluates the
caller's actual Storage rules. Linked disposal receipts resolve to `material-files`
even when displayed on a job cost. No cost or disposal transaction was rewritten.

The `/files` review list uses bounded pages and source filters. Opening a file
rechecks current authorization, signs using that authenticated client for 60 seconds,
and returns a private, uncached redirect. Existing views retain their original
signed-link lifetimes. Previously issued signed URLs remain bearer capabilities
until expiry at the origin, while hosted CDN/browser caching may extend access.
Scans and deactivation do not revoke issued URLs or downloaded copies retroactively.
The uncached redirect does not control the object cache; see the activation review.

## Scanner operation

Reuse `DOCUMENT_SCANNER_URL` and `DOCUMENT_SCANNER_TOKEN` from the library pilot,
server-side only. Never put the token or privileged Supabase key in a public
variable, browser bundle, log or repository. The privileged scan client remains
separate from the authenticated upload/download client. Local HTTP is accepted
only on loopback outside production; production requires HTTPS. The authenticated
bridge submits raw bytes only and checks engine and matching digest responses.

Use `scripts/private-scanner/bridge.mjs` and its strict `clamd.conf` with a private
ClamAV daemon. The versioned hosting package and synthetic restore evidence are
in `SCANNER_HOSTING_AND_RESTORE.md`; use its updated matching 100 MiB member/total
engine budgets to avoid the verified ZIP-truncation gap. The upload ceiling
remains 25 MiB, and existing live/local services are not changed by these files.
Keep signature updates and scanner health supervised. The bridge
holds files if definitions exceed 48 hours, the engine is unavailable, replies are
invalid or bounded scanning limits are exceeded. Do not disable this boundary to
work around a scanner outage. Apply the reviewed schema before rolling out the new application: a missing scan-mode RPC blocks new uploads with a configuration error rather than silently bypassing checks. Validate the switches-OFF flow in staging before any approved activation. Do not enable production switches before planning
existing-file checks, signed-link expiry, infrastructure capacity, monitoring and
retention with the owner. No new production secret values were created here.

## Verification

See `tests/README.md` for the opt-in disposable integration suite. It exercises
actual Auth, original RLS, Storage, private ClamAV, harmless EICAR fixtures, all six
buckets, ownership/classification, replacement and lease races, employee disabling,
receipt preservation, all photo categories and mandatory photo audits. It also
verifies the actual authenticated Next download route when the local app is running.
The original document-library integration suite remains separate and must pass.

Use only synthetic fixtures. Tests retire their own marked accounts and archive
employee document fixtures; they retain business/audit history and restore the
previous local scan switches. Never run them against a hosted database or reset
the shared review stack. Apply new SQL locally without writing migration-history
entries, and verify a complete replay separately before considering a release.
