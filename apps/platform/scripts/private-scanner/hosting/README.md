# Private scanner hosting package

Local preparation for existing PR18/F17. No host, DNS, service credential,
staging deployment or production activation is created by adding these files.
Use with `../../../SCANNER_ACTIVATION_RUNBOOK.md` and
`../../../SCANNER_HOSTING_AND_RESTORE.md`. Provisioning remains a separate step.
The current staging procurement/protection recommendation and host handoff are
in `../../../STAGING_VISITOR_AND_SCANNER_PREPARATION.md`; no host is assigned.

## Runtime boundary

Four supervised containers run on company-controlled infrastructure:

| Service | Network access | Persistent storage | Limit / runtime UID |
| --- | --- | --- | --- |
| TLS proxy | TLS ingress; bridge only downstream | Certificate/key mounts; bounded status logs | 128 MiB / 101 |
| Bridge | Proxy and engine; no external network | Private token mount; bounded startup logs | 512 MiB / 1000 |
| ClamAV engine | Bridge only; no external network | Virus definitions mounted **read-only** | 4 GiB / 10001 |
| Signature updater | Internet for definition updates; no access to file-processing networks | Definitions mounted read/write | 2 GiB / 10001 |

Engine and bridge have no published ports. Only the proxy publishes a port;
the default is **127.0.0.1:8443**, deliberately closed to remote clients. Two
Docker networks are internal. The updater cannot receive documents from the
bridge. Docker administration remains privileged and must be tightly restricted.

Every service drops all capabilities, prohibits privilege escalation, uses a
read-only root, has a PID/memory/CPU limit and disables core dumps. Scratch
directories are bounded tmpfs, with noexec/nosuid/nodev. The engine has 1 GiB of
scratch **within** its 4 GiB memory limit. `memswap_limit` equals `mem_limit`;
the host must also pass the no-swap requirement before any business files are
sent. Verify actual cgroup limits, not just the Compose text. The supplied
`coredump.conf` is a future host configuration fragment, not installed by Compose.

Total service memory caps are 6.625 GiB. Keep the reviewed 8 GB / 2 vCPU host
allowance; validate actual peak usage and latency during definition updates and
two simultaneous 25 MiB scans. CPU caps are ceilings, not reserved cores. Do not
reduce memory simply because the idle engine uses less. The local ARM64 test VM
is smaller and establishes functional behavior, not production capacity.

## Images and credentials

Dockerfiles pin base images by digest and pin ClamAV's Ubuntu package version.
Node is 22.23.3, ClamAV is 1.5.4, nginx is 1.30.6. The official ClamAV 1.5.4
image lacked an ARM64 manifest at verification time, so the engine uses the
same Ubuntu 24.04 package already tested locally. Both ARM64 and AMD64 package
builds are intended; **only ARM64 was executed**. APT dependencies can change or
the exact package can disappear. Preserve the final approved image in a private
company registry by digest; a Dockerfile alone is not a permanent binary backup.
No image was pushed. See `LOCAL_VERIFICATION.json` for local image IDs/evidence.

Compose requires a private operator-owned env file containing **paths only**:

```dotenv
SCANNER_TOKEN_FILE=/private/scanner/token
SCANNER_TLS_CERT_FILE=/private/scanner/fullchain.pem
SCANNER_TLS_KEY_FILE=/private/scanner/key.pem
SCANNER_LISTEN_IP=127.0.0.1
SCANNER_HTTPS_PORT=8443
```

The token file must contain one private random token, at least 32 characters
without whitespace; no other key belongs in it. Bridge startup rejects public
file modes and ambiguous token sources. Existing local `DOCUMENT_SCANNER_TOKEN`
callers remain supported. Use separate future staging and production tokens;
never use a Supabase key. No new production credential was generated or changed.

Use 0600 token/key files, readable only by the mapped runtime UID. Token UID is
1000; nginx key UID is 101. A rootless daemon remaps these IDs on the host;
inspect its UID/GID map and verify container readability without printing files.
Do not solve permission errors by using 0644 secrets or root containers. Compose
file-backed secrets use bind mounts; its `uid`/`gid` options cannot fix ownership.
The local rootless map needed host IDs 525287 (token) and 524388 (TLS key);
**these IDs are local evidence, not portable settings**. Keep parent directories
private and restrict Docker/host administration. Never place secrets in images,
Git, Compose values, logs, commands or shared test reports.

The future proxy needs a valid publicly trusted certificate for the approved
hostname. Self-signed localhost certificates are test-only; TLS verification is
never disabled. Configure renewal and test a proxy restart before expiry. After
replacing a mounted secret/certificate file, recreate the corresponding service
so its bind mount reads the new inode. Rotate the matching application token
only in an approved coordinated change; approval failures stay held.

## Future operator commands — not executed on a host

Run only after host/provisioning approval, from this directory. Compose 5.6.0 was
tested; current Compose v2 implementations must validate the resolved config.
Use the intended project name and explicit env/config paths every time.

```sh
docker compose --project-name ats-scanner --env-file /private/scanner/paths.env -f compose.yaml config --quiet
docker compose --project-name ats-scanner --env-file /private/scanner/paths.env -f compose.yaml build
docker compose --project-name ats-scanner --env-file /private/scanner/paths.env -f compose.yaml up -d
docker compose --project-name ats-scanner --env-file /private/scanner/paths.env -f compose.yaml exec -T bridge node probe.mjs
```

First boot requires internet access for the updater to obtain signed definitions;
the engine may restart while its database is absent. No file is approved until
the engine can load current definitions and complete a real scan. Never bootstrap
with an empty/fabricated database or a cached clean result. A changed image must
pass the same tests before promotion. Do not use `down -v` or prune as maintenance.
The definitions volume contains public signatures, not company attachments.

After approval, bind TLS ingress to the approved interface/port (typically 443),
configure the host/cloud firewall for that port and restricted administrative
access, and verify remote TLS. No Docker socket or engine port is public. Neither
these commands nor an ordinary Git push grants production deployment approval.
Rollback selects the previous verified image/config with the **same** retained
definitions volume; check compatibility and a synthetic scan before use. Never
disable scan gates to hide an outage. Stop approved file processing if recovery
cannot preserve the access boundary.

For a rootless host, review port 443 binding explicitly; the default high-port
loopback test does not prove privileged-port support. Do not change a system-wide
privileged-port boundary or run scanner containers as root to make it work.
Docker port publishing can bypass UFW rules, so use the cloud firewall and real
external IPv4/IPv6 denial tests as well as the reviewed Docker/host rules. Do not
disable Docker's firewall handling. These are future host gates, not changes
installed by this package.

`inspect-host.mjs --socket /absolute/local/docker.sock` is a read-only preliminary
check run directly on the approved candidate Linux host. It explicitly selects
a local Unix socket, emits only selected OS/daemon facts and never reads
credentials or installs/starts services. Nominal 8 GiB hosts must expose at least
7.5 GiB usable memory after kernel reservation. Suitable preliminary facts do
not establish native image behavior, enforced limits, TLS, firewall, operator,
monitoring or recovery proof; `readyForActivation` always remains false.

## Health, updates and retention

The bridge healthcheck performs an authenticated synthetic **scan**, verifies the
digest and reads the engine's loaded VERSION. A listening port alone is not
healthy. Checks run every 60 seconds (15 second timeout, 120 second warmup).
Unhealthy Docker status is an alert signal; Docker does not restart a container
solely because it becomes unhealthy. Configure an external company-controlled
monitor/operator response before activation; no monitor or outbound alert has
been created here. Also monitor external TLS/expiry, updater failures, memory,
disk/log limits and sustained 503s.

The signature updater checks 12 times daily and validates databases; clamd
checks for new definitions every 600 seconds. Concurrent reload is disabled to
bound peak memory; transient unavailability during reload is a held file with
explicit retry. Loaded definition age reports warning at 24h, urgent at 36h;
age **over** 48h or implausibly future/invalid dates refuses scanning. The app's
12 second timeout, bridge concurrency of two, bounded ClamAV work and no proxy
retry prevent uncontrolled waiting or repeated requests. The tested encrypted and
limit-exceeded ZIP fixtures are quarantined. Known, complete engine verdicts and
matching SHA-256 are required; errors never substitute for a clean result.

Both engine budgets (individual expanded member and aggregate work) are 100 MiB;
the application/HTTP upload ceiling stays 25 MiB. A real 110 MiB ZIP-member test
exposed a clean-after-truncation gap with the earlier 26/100 MiB combination.
Matching these budgets makes that case reach aggregate-limit alerting. Keep the
encrypted/expanded-size tests as release gates; a setting named AlertExceedsMax
alone is not evidence that all extractors enforce it as expected. This is not a
guarantee that every archive format or every malicious document is detected.

Nginx request/response buffering and caching are off. No filenames, record IDs,
IPs, headers or bodies appear in its access log: status and latency only. Clamd
has no persistent output and its Docker log driver is disabled. Other Docker
logs are capped at 1 MiB × three files **per container**; this is a space bound,
not a 14-day expiry guarantee. No central log export or time-based purge is
configured. Review operator log access and lifetime before activation. Do not
enable debugging/body capture for diagnosis. Definitions persist; submitted file
bytes and archive extraction do not persist on the scanner. The scanner is not
a source-file backup. A compromised host/root could still inspect live memory;
restrict administration and apply reviewed OS/image security maintenance.

Keep all business source files, metadata and audit history under the existing
preserve-first policy. No new business retention deletion is implemented. Agree
an encrypted separate source-object backup, version/manifest, recovery key custody,
retention, schedule, recovery objectives and restore operator before activation.
Database backups alone exclude Storage bytes. See the paired synthetic recovery
drill below; it does not establish a running production backup service.

## Local recovery verification

`tests/scanner-hosting.integration.test.mjs` exercises this exact package on
loopback with a private test token and explicitly trusted localhost certificate.
`tests/attachment-restore.integration.test.mjs` backs up only newly created
synthetic fixtures, verifies encryption/digests, simulates lost bytes and restores
through existing authenticated Storage/RLS and scan commands in all seven areas.
It does not read existing business files, restore over existing objects or
replay financial/audit actions.

Six attachment areas restore a **missing** original path with `upsert:false`
and a new Storage identity/generation, retaining existing metadata and old scan
history. Authorization is checked using an active permitted recovery actor; do
not impersonate an offboarded uploader. A different actual recovery operator
must pass its existing insert policy; an unavailable original actor is a manual
authorization blocker, not permission to forge ownership or use a bypass.

The library uses a new document ID **and** new path with matching classification
and business links, while the missing original is archived and retained. The
test fixture has no business links; linked-library recovery needs a reviewed
mapping through the existing authorized workflow. Never copy `scan_status`, old
tokens, service claims or approval timestamps from a backup, and never reinsert
bytes at a previously clean library ID/path. A fresh real scan releases access.
Outage/unknown state stays held; recovered EICAR stays quarantined. Existing
costs, purchases, job state and photo audit entries must remain unchanged.

`../test-local-db-restore.mjs` separately dumps the existing empty independent
92-file replay and restores it into a **new randomly named** local database.
It compares function definitions/grants, table owners/effective ACLs/RLS,
policies, private bucket config and off-by-default scan gates. It requires the
existing disposable Docker socket and fixed container name. It does not reset
the shared review database or alter cluster roles. Supabase schema ownership is
preserved using its existing local cluster admin. The source replay has no CLI
migration ledger; no ledger is fabricated. This is not hosted PITR, cross-version
restore, global-role recovery or proof of production backup scheduling.

See `../../../tests/README.md` for opt-in test variables and safe fixture shape.
Run host outage tests and attachment recovery tests **sequentially**: both stop
only their label-verified, newly owned local engine. Retain evidence outside Git,
with credentials separate. The original local CRM/scanner remains independent.

## Sources

- [ClamAV Docker guidance](https://docs.clamav.net/manual/Installing/Docker.html)
- [Docker service and file-secret behavior](https://docs.docker.com/reference/compose-file/services/)
- [tmpfs and swap behavior](https://docs.docker.com/engine/storage/tmpfs/)
- [Nginx proxy buffering](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)
- [Supabase backup scope](https://supabase.com/docs/guides/platform/backups)
