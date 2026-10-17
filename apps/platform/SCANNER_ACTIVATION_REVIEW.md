# PR18 scanner hosting, retention and legacy-file activation review

Reviewed October 16, 2026 against published commit `df59d8a`. This is a review,
not a release authorization. No host, DNS entry, secret, hosted schema change,
retention job, production scan or deployment was created. Existing application
logic and the 91 committed migrations are unchanged.

## Decision

**Keep production activation on hold.** The local implementation is verified and
published to main. Main subsequently includes the independent public-site
update `5412b26`; this review branch includes it without changing its files. Adopt one company-controlled scanner VM and a preserve-first
retention policy. A bulk legacy scanner is unnecessary for the current production
inventory. Complete the readiness items below, then review a staged release.

This continues existing PR18/F17. It does not reopen the CRM audit, renumber the
roadmap, replace Supabase/Netlify or add a new document-management system.

## Verified current state

Read-only snapshot: 2026-10-16 23:50 UTC. Supabase project `ddvlnixdugcbnrewktes`
is the active CRM project in `us-west-2`. Its seven existing attachment buckets
are private. Aggregate metadata inventory returned **zero objects, zero file
references and zero missing-reference/orphan candidates in each bucket**. No
customer bytes, filenames, paths or personal data were downloaded for this review.
The query ran as postgres; the empty result is not a caller-RLS filter.

The buckets are platform-documents, employee-files, employee-program-files,
equipment-files, material-files, job-cost-receipts and job-photos. The inventory
covers the current CRM metadata relationships, including archived direct rows
and linked disposal receipts. It cannot prove that a physical blob matches its
metadata, or inventory attachments outside this CRM project. Repeat immediately
before release; do not treat an empty snapshot as a permanent exemption.

Production has **65 recorded migrations versus 91 repository versions**. The 26
unrecorded versions span F08/PR02 through PR18. A history gap is not proof that
all 26 schemas are absent. Both scanner settings tables and the attachment-source
view are specifically absent. Follow SUPABASE_MIGRATION_RECONCILIATION.md before
any repair or replay; do not run db push or mark versions applied from this count.

The published Netlify CRM deployment remains `6ad23c757dfc53f702ae00b9`, commit
`49a0b82`, rather than the newer main stack. Its Next server function reports
Node22, 1024 MB and `us-east-2`. Site-level configuration has no
DOCUMENT_SCANNER_URL or DOCUMENT_SCANNER_TOKEN. Existing service-credential
configuration spans production and preview/development contexts; those secret
values are masked. Isolation is unverified, not proof that credentials are equal.
The production target must be confirmed separately before staging deployment.
Team-level inherited scanner variables could not be verified through the connected
API; site-level absence is not proof about inherited runtime configuration. No
environment values were written or included in this report.

## Hosting choice

**Recommend one AWS Lightsail Linux VM, 8 GB / 2 vCPU, in Ohio (`us-east-2`),
owned and billed to Angel Tree Services.** The current listed bundle is $44/month,
before taxes, optional snapshots, monitoring, storage-backup costs and excess
transfer. No purchase has been authorized or made. Existing company-owned capacity
can substitute only if it passes the same controls and load tests.
[AWS bundle specification](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-bundles.html).

This region keeps the byte-submission hop close to the observed Netlify runtime;
Supabase remains in Oregon. It is a recommendation, not a claim that a host or
AWS account is already available. The VM size leaves headroom for the engine,
signature updates, two scans, temporary extraction and the bridge. ClamAV's
published recommendation is at least 3 GiB, preferably 4 GiB in containers;
8 GB is our operating allowance, not a measured minimum for this CRM.
[ClamAV requirements](https://docs.clamav.net/),
[container memory guidance](https://docs.clamav.net/manual/Installing/Docker.html).

Keep the CRM on Netlify and the source files in private Supabase Storage. The
existing server downloads the authorized object and sends raw bytes to the owned
HTTPS bridge. The bridge returns only verdict/engine/digest. It needs **no
Supabase credential, database connection, original filename or record metadata**.
Do not run the persistent ClamAV daemon inside a request-driven Netlify function.
[Netlify runtime model](https://docs.netlify.com/build/functions/overview/).

Hosting acceptance contract:

- A dedicated company scanner subdomain, valid HTTPS and strong bridge token.
  DNS/name and billing account remain to be approved. Only 443 is public; restrict
  administration to approved access. Netlify has no verified fixed egress IP here,
  so do not invent an IP allowlist as the only authentication mechanism.
- Run the existing bridge as an unprivileged supervised service on loopback 3311.
  Run clamd privately on 3310, with container isolation/loopback publication only.
  Never expose its unauthenticated TCP interface publicly.
  [ClamD socket guidance](https://docs.clamav.net/manual/Usage/Scanning.html).
- Terminate TLS at a maintained proxy. Stream requests without disk buffering;
  cap request bodies to 25 MiB and align upstream timeouts with the current client.
  Do not enable request-body, authorization-header or query-string logging.
- Use the reviewed strict clamd.conf, bounded resources and two concurrent scans.
  Reject saturation with 503; do not add an unbounded queue. Record exact engine,
  OS/package versions and image digest after maintenance. No mutable latest-only
  release target. Re-run clean/EICAR and resource-limit checks before upgrading.
- Use memory-backed temporary extraction with a bounded tmpfs, no retained
  temporary files, no core dumps or swap containing document bytes. Keep signatures
  persistent. The bridge itself buffers bytes in memory; that alone does not prove
  the engine never extracts temporary files. Test the whole host configuration.
- Supervise freshclam and signature reloads. Warning at 24 hours without definitions,
  urgent alert before 36 hours, fail closed after the existing 48-hour limit. Confirm
  loaded engine definitions, not merely an updater's success. Synchronize system time.
  [Signature management](https://docs.clamav.net/manual/Usage/SignatureManagement.html).
- Configure server-only scanner vars in Netlify production Functions scope and the
  private host. Use a different token/target for staging. Never put the token in
  NEXT_PUBLIC, source, build output or preview contexts that use production data.
- An authenticated synthetic POST/scan probe must exercise TLS, bridge, engine,
  digest and loaded-signature age. There is no existing GET health endpoint to rely
  on. Proposed five-minute probes and alerts need an assigned maintainer; none were
  scheduled or sent during this review. A two-probe outage should produce one
  incident, not repeated owner notifications.

A single host is sufficient initially. During an outage, files stay held and the
business records can still save. Repair the host and explicitly retry; keep the
download protection enabled. High availability can follow measured need.

## Retention decision for the first release

These are proposed operational rules, not claims about legally required periods.
No automatic business-data purge should be included in activation.

| Data | Initial policy |
| --- | --- |
| Business documents/photos/receipts | Keep with the parent record; archive from ordinary views when appropriate. Never purge merely because an employee separates, a credential expires or an invoice is paid. |
| Quarantined bytes | Retain in the same protected private object pending owner review. Do not copy them into a publicly accessible quarantine bucket, email them, or allow mark-clean. A safe replacement uses a new path. |
| Unavailable/checking/unscanned files | Retain for explicit retry and lease recovery. A failed check is not grounds for deletion. |
| Orphan candidates or missing-object references | Produce counts and a restricted review list; establish parent/audit/uncertain-write history before any action. No automatic deletion. |
| Scan attempts and audit events | Retain with existing business history in the initial release. No new TTL, cascade or purge. |
| Scanner request bodies / extraction | No persistent document copies. Memory/tmpfs only, cleaned when processing completes; verify no proxy buffering, swap/core dumps or snapshots include bytes. |
| Minimal scanner/proxy operational logs | Proposed 14-day rotation. Status, latency, engine version/signature age and random request correlation only; no auth headers, body, filename, signed URL or person/record identifiers. This rotation is not implemented. |
| Source-file backups | Separate encrypted, access-controlled object backups paired with database metadata. Propose daily file capture and a one-business-day restore target; owner must approve the backup schedule and retention before launch. No copies were made here. |

Monthly owner review of quarantines and orphans is a recommendation, not a created
automation. Final record-category deletion periods and holds should be adopted
with the company's record policy before adding any deletion worker.

Supabase database backups contain object metadata, **not Storage file bytes**.
A database restore therefore cannot recover deleted attachments by itself.
A VM snapshot is also not a backup of Supabase files.
[Supabase backup scope](https://supabase.com/docs/guides/platform/backups).

## Legacy-file decision

**Do not build or run a bulk backfill for today's empty production buckets.**
After reconciliation and staging, prefer an empty-area-first rollout with a fresh
aggregate inventory immediately before enabling each area. Every new upload then
enters the normal checked flow. No old row is declared clean by date or ownership.

If files appear before release, stop the empty-area shortcut. The current commands
reject scan claims while the area's gate is OFF; there is no existing safe
pre-scan mode. Enabling the gate holds legacy files until individually checked.
Use an owner-approved bounded window and an active admin through the existing
commands. Retain object/version/generation binding; do not write clean verdicts
with SQL, impersonate a departed uploader, bypass RLS, or scan with arbitrary paths.
Limit a later supervised worker to one file at a time with explicit checkpoints
and an operator identity; it is not implemented or authorized by this review.

Check archived references too. Unknown/oversized/encrypted/missing or orphaned
objects go to review, never deletion or assumed-clean. Legacy employee files with
no captured uploader require a current administrator. The library pilot has its
own staff/restricted classification checks. See the companion runbook.

## Specific readiness issues

| Priority | Issue and engineering decision |
| --- | --- |
| Release gate | Reconcile 65 recorded vs 91 repository versions and verify objects/grants/RLS before any hosted schema or app rollout. Scanner objects are confirmed absent. |
| Release gate | Prove the actual Netlify upload transport at supported sizes. Local Next accepts a 26 MB action body; current UI allows6/10/15/25 MiB by area. Netlify documents 6 MB buffered payloads, roughly 4.5 MB for binary encoding. A local small-image pass does not prove those limits work on the deployed adapter. Preserve capabilities: if the adapter cannot support them, move the initial authenticated upload to held private Storage while retaining normalization, metadata, audit and scan authorization. Raising Next's limit alone is insufficient. |
| Release gate | Provision and verify the owned HTTPS scanner and secret scope, maintainer, signature renewal, resource limits and source-file restore process. No host/configuration was changed here. |
| Before staging | Establish isolated database/service/scanner targets. Context names and masked values do not prove staging isolation. Never deploy a preview against production as a test shortcut. |
| Security qualification | Signed links are bearer capabilities. Turning a gate ON or disabling an actor stops new authorized signing; it does not revoke an issued URL or a downloaded copy. Hosted Smart CDN/browser cache can outlive token expiry. A no-store redirect does not set the object's cache policy. Verify actual private-object caching and document the accepted access window; if strict per-request revocation is required, review authenticated delivery without raw signed-link exposure before activation. Do not delete business files or rotate Auth keys as a revocation shortcut. |
| Operating rule | Never turn an enabled gate OFF to recover from scanner failure: that makes quarantined/unscanned objects accessible again under original permissions. Keep ON, repair forward and retry held checks. |
| Trusted-operator boundary | The six new buckets invalidate approvals on object version changes. The original library pilot binds document/path/digest and denies ordinary replacement, but does not track privileged object generations. Never repair approved library files in place or copy clean scan metadata during restore. Use a new document/path and re-scan; review uniform version binding before any automation gains replacement permissions. |

Sources for the transport and cache gates:
[Netlify payload/runtime limits](https://docs.netlify.com/build/functions/configuration/),
[Supabase signed delivery](https://supabase.com/docs/guides/storage/serving/downloads),
[Smart CDN cache semantics](https://supabase.com/docs/guides/storage/cdn/smart-cdn).
Exact deployed-adapter limits and hosted cache behavior remain untested; this
review did not create a preview deployment or send production files to a scanner.

The October12 Supabase changelog removes obsolete CBC TLS ciphers no earlier than
November10. Retain supported Node/TLS and HTTPS; do not add a legacy-cipher bypass.
[Changelog](https://supabase.com/changelog/cbc-tls-ciphers-deprecated).

## Verification and next implementation step

This review ran 18 existing scanner/service/action tests and 7 targeted disposable
rehearsals. All passed. Rehearsals verified gate-OFF pre-scan rejection, gate-ON
legacy holding with existing signed URLs still valid, actual ClamAV release,
quarantine bypass if OFF, hash-checked synthetic restore requiring a new scan,
aggregate detection of orphan/missing references, and third-request saturation 503.
Local switches were restored and only the new synthetic actor was retired. No
production bytes were scanned or changed. No application/schema edits were made.

The published implementation's 673 regressions, 51 full integration tests,
typecheck/build and 91-migration replay remain its previous evidence; they were
not all rerun for this document-only review.

**Next implementation: local PR18 production-readiness follow-through**, starting
with the file-transfer limit and cache/access contract, followed by versioned host
configuration and smoke-test/restore instructions. Keep all changes local until
verified. A future approved isolated staging release must prove the real transport,
TLS/cache behavior and complete migration chain before production approval. No
new product features, bulk scanner, purge worker or deployment is warranted now.

Companion: SCANNER_ACTIVATION_RUNBOOK.md. Repeatable aggregate query:
`supabase/verification/attachment_activation_inventory.sql` at repository root.
That query is read-only and returns counts only; it authorizes no mutation.

## Local follow-through after this review

The subsequent local upload-size and cache/access implementation is documented in
UPLOAD_ACCESS_READINESS.md. It adds migration 92 and preserves this review's dated
hosted snapshot. This does not authorize hosting, staged deployment or production
activation. Re-read the readiness contract before following the activation runbook.
