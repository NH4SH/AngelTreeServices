# Free scanner hosting review — October 17, 2026 (US Eastern)

**Owner direction supersedes the hosting recommendation below:** keep Netlify and
Supabase as the core infrastructure providers while developing toward a potential
commercial CRM. Oracle account/capacity verification is stopped; no account was
created, no session authenticated and no host provisioned. The prior review is
pushed to main and its branch at `27b70da`, deployment skipped, and is retained
as historical research rather than an instruction to add a provider.

Next engineering decision: assess a credible scanner implementation within the
existing providers before proposing another infrastructure account. The current
four-container scanner is not a drop-in serverless function. Supabase Edge limits
are 256 MB RAM /2s CPU; Netlify Functions default to1024 MB and configurable larger
functions require eligible paid plans. This is a feasibility question, not an
implemented scanner replacement or a promise of free production scanning.
[Supabase limits](https://supabase.com/docs/guides/functions/limits),
[Netlify function configuration](https://docs.netlify.com/build/functions/configuration/).
Preserve current quarantine, access rules, scan semantics and local test setup.
No application code, scan switch, provider setting or production service changes.


Decision: **recommend an Oracle Cloud Always Free ARM VM for a disposable staging
scanner, conditional on account eligibility, actual capacity and host verification.**
Keep the existing local scanner as the working test environment until then.
This completes a hosting review within PR18/F17; it does not provision or release
anything. Production activation remains on hold.

## Published staging access work

The verified access gate and preceding hosting preparation are pushed to both
`main` and `codex/pr18-local-staging-access` at **`bd206a8`**, including the latest
public-site main commit `5bfc9a2`. The push was atomic and every new commit has
`[skip netlify]`. All 18 gate unit/real-loopback results passed again before push.
Read-only Netlify checks before and after confirm the same published deploys:
CRM `6ad23c757dfc53f702ae00b9`, website `6ad40c1165a8595413b99ce4`, staging none.
No deployment command, production setting or hosted credential was changed.
This review itself is prepared locally on `codex/pr18-free-scanner-review`.

## Fit against our existing implementation

We already wrote the scanner bridge and isolation package. Reuse ClamAV for
detection; a new homemade malware engine is not required. Hosting is the remaining
compute/operations question. No file is sent to a public scanning API.

| Existing constraint | Actual source/evidence | Candidate implication |
| --- | --- | --- |
| Four containers, total 6.625 GiB memory caps | `scripts/private-scanner/hosting/compose.yaml`: engine 4 GiB, updater 2 GiB, bridge 512 MiB, proxy 128 MiB | Retain at least the reviewed nominal 8 GiB host allowance; do not shrink scan coverage to fit a tiny free instance |
| CPU caps total 3, host floor 2 logical CPUs | Engine 1.5, other three services 0.5 each; `inspect-host.mjs` | Caps are ceilings, not reservations. A two-core host shares CPU under load and needs measured latency during updates |
| Ubuntu 24.04, rootless Docker, cgroup v2/systemd, no active swap | Existing read-only host inspector | No OS or security relaxation is needed to accept ARM64; inspector already supports ARM64 and AMD64 |
| Pinned images previously built and run on Linux ARM64 | `hosting/LOCAL_VERIFICATION.json` | ARM is compatible with the prepared approach; laptop evidence is not proof of Oracle image/kernel/capacity behavior |
| 25 MiB file ceiling, two concurrent bridge requests, 12-second application timeout | `document-scanner.ts`, bridge and ClamAV configs | Test two maximum-size scans during definition reload; never lengthen the timeout or approve unscanned files just to pass |
| File-processing networks have no general Internet access | Internal engine/ingress networks; separate updater | Keep network separation, TLS, bearer token and non-root/read-only containers |

ClamAV itself recommends 3–4 GiB for constrained environments; our higher
four-service allowance also covers updating and isolation. This explains why
small web-service freebies are unsuitable.
[ClamAV Docker requirements](https://docs.clamav.net/manual/Installing/Docker.html).

## Free options checked

Provider documentation was checked October 18 UTC / October 17 Eastern. These
are published offers, not a quote or proof of this owner's remaining quota.

| Option | Documented offer/limit relevant here | Engineering decision |
| --- | --- | --- |
| Oracle Always Free A1 | Current detailed docs: 2 OCPUs and 12 GB ARM memory; home-region capacity required | Best hosted candidate reviewed; use a single dedicated scanner VM, subject to actual account/host checks. [Compute limits](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) |
| Render Free | 512 MB RAM; sleeps after 15 minutes, about one minute to resume; no persistent disk | Reject for this package: insufficient RAM and cold starts beyond our request budget. [Compute plans](https://render.com/docs/compute-plans), [free limitations](https://render.com/docs/free) |
| Railway Free | Up to 0.5 GB RAM per service and $1 monthly usage credit after trial | Reject: resource ceiling does not fit the engine. [Pricing](https://railway.com/pricing) |
| Google Compute Engine free e2-micro | Free eligible shape has 1 GB RAM and shared fractional CPU | Reject for this package. [Free allowance](https://docs.cloud.google.com/free/docs/free-cloud-features), [machine sizes](https://docs.cloud.google.com/compute/docs/general-purpose-machines#e2_machine_types) |
| Fly.io / AWS introductory compute | Fly trial is 2 VM hours or seven days; new AWS free plan ends within six months or when credits run out | These are temporary trials, not a continuing free scanner plan. [Fly trial](https://fly.io/docs/about/free-trial/), [AWS EC2 terms](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-free-tier-usage.html) |
| Existing Mac/disposable Linux VM | No additional hosting subscription; already verified functionally | Continue local development. Laptop sleep, network availability and current VM capacity prevent treating it as a hosted staging service. No tunnel or public port is introduced |

The prior $48 DigitalOcean recommendation is superseded as the preferred route
by the owner's free budget. Preserve it as a historical paid alternative; it is
not approved for purchase.

## Concrete candidate and cost boundary

Proposed allocation: one `VM.Standard.A1.Flex`, Ubuntu 24.04 ARM64, 2 OCPUs,
12 GB memory, 50 GB boot disk. No load balancer or Kubernetes cluster is needed.
Do not create a second VM for the updater; the existing package separates it.

Oracle currently documents 1,500 OCPU-hours and 9,000 GB-hours monthly; a 31-day
month at this allocation is 1,488 and 8,928 respectively. Combined boot/block
storage allowance is 200 GB. Check existing usage before relying on those totals.
Capacity may be unavailable, and idle free instances may be reclaimed after a
seven-day measurement period. Do not generate artificial load to evade reclamation.
[Detailed current limits and reclamation policy](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm).

Account signup usually requires a phone and payment card. Oracle says charges
require an account upgrade; the trial can temporarily expose larger paid shapes.
Use the actual Always Free allocation, not trial credit, and do not upgrade as a
capacity workaround. [Account/trial rules](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm).
There is no Free Tier SLA or regular Oracle Support entitlement. These limitations
make it a staging candidate, not a production availability commitment.
[Free Tier FAQ](https://www.oracle.com/cloud/free/faq/).

Account ownership, home region, existing usage, actual eligibility and available
capacity are unknown. No account/dashboard was accessed or created. “$0 candidate”
is conditional, not an all-in bill guarantee: check image licensing, storage,
backups, network and monitoring choices in the actual account. Prefer an existing
company-controlled hostname only after a DNS/TLS review; none is assigned here.

## Required follow-through in the existing PR18 roadmap

1. Owner chooses/authorizes the company-controlled Oracle account, maintainer and
   home region. Review exact eligibility and totals with the owner; do not start
   a paid fallback if free capacity is unavailable. Account acceptance/card steps
   and provisioning are outside this review.
2. Bind an approved candidate to actual VM/image IDs, region, operator and billing
   evidence. Keep inventory host fields null until it exists. Recheck current
   package/version/advisory status then; this review does not certify versions anew.
3. Rebuild/run the pinned package natively, use `inspect-host.mjs` on the actual
   host and prove cgroup/swap/coredump/secret-mount isolation. The ARM inspector
   already works; no code change or relaxed host threshold is needed.
4. Review trusted TLS and rootless port443 binding. Allow only the authenticated
   TLS endpoint and operator-restricted SSH; deny direct engine, bridge, Docker
   and alternate proxy ports on IPv4/IPv6. Check both cloud and host/Docker rules.
   A private VM address alone is not connectivity from the Netlify app.
5. Run the existing clean/EICAR/archive/limit/TLS/token/concurrency/outage tests
   and measure actual peak RAM and end-to-end latency during definition reload.
   Reclamation or outage must leave attachments held; neither authorizes bypass.
6. Name an alert recipient and prove stale-definition/TLS/outage notification and
   response. Store reproducible host/config/image evidence outside the disposable
   host. Preserve source objects and audit history; a VM disk backup is not the
   paired source-object/database recovery plan already required by PR18.
7. Obtain separate release approval, then prove hosted visitor gate coverage and
   mail/Auth/runtime/key isolation. Keep all scan switches, hosted protection,
   scanner recovery and deployment readiness flags false until real proof exists.

## Verification performed in this review

- Seven existing host-screening/scanner unit results passed, with zero failures
  or skips. They use synthetic local fixtures; no ClamAV container was started.
- An explicit **hypothetical** two-core ARM64 / 11 GiB usable-memory fixture passes
  preliminary screening while still reporting `readyForActivation:false`.
  One-GiB and non-rootless cases are denied. This is a logic check, not a host test.
- Parsed current Compose caps (6.625 GiB RAM, 3 CPU ceilings) and verified current
  source hashes against the earlier hosting evidence. Scanner runtime/config,
  application code, dependencies, migrations/RLS and shared manifest are unchanged.
- Earlier ARM64 TLS/ClamAV and seven-area restore results remain prior evidence;
  they were not rerun or relabeled as remote capacity/recovery proof.
- Existing developer app and local access gate remain in place. No hosted scan,
  file transfer, provision, DNS/firewall change, key generation, migration, billing
  change or deployment was performed.

See `staging/FREE_SCANNER_HOSTING_REVIEW.json` for the recorded review scope and
`STAGING_ACCESS_PROTECTION.md` / `SCANNER_HOSTING_AND_RESTORE.md` for prior work.
