# PR18 staging visitor protection and scanner hosting preparation

**Published/follow-through:** staging access/preparation is pushed to main and `codex/pr18-local-staging-access` at `bd206a8`, deployment skipped. The [hosting review](FREE_SCANNER_HOSTING_REVIEW.md) is now historical: the owner selected a Netlify/Supabase-first commercial direction and stopped Oracle verification. Scanner deployment remains unresolved. No host is provisioned and all hosted readiness gates remain open.

**Local access-gate follow-through (October 17):** the owner selected a free, custom approach. A staging-only gate is implemented and tested locally; see [local access protection](STAGING_ACCESS_PROTECTION.md). Native Netlify protection is still locked, no plan/team change or scanner purchase is approved, and hosted visitor protection remains unverified. The earlier paid host recommendation is retained as historical review, not the selected budget.

## Outcome

The verified managed-default review **`bd6ea2d` is pushed to main** and
`codex/pr18-managed-defaults-review`, with deployment skipped. This follow-through
prepares the next existing PR18 gates. No app, VM, firewall, DNS record, paid plan,
account, credential, provider integration or production setting is created.

The owner requested a new scanner hosting recommendation for review. Recommend
a **company-owned DigitalOcean Basic bundled VM: 8 GiB RAM / 4 shared vCPUs /
160 GiB SSD, listed at $48/month**, Ubuntu 24.04 LTS AMD64, in an available US-east
region. Confirm that exact bundled plan and region at checkout. This is a
recommendation, not a purchase approval or an existing assigned host. The native
AMD64 build/runtime/capacity checks remain mandatory; only ARM64 has run locally.
[Published VM price](https://www.digitalocean.com/pricing/droplets).

## Visitor protection: verified blocker and prepared route

Read-only dashboard inspection reconfirmed the exact staging site
**`d81d923d-6ccf-4c1e-87cc-263f3d51555d`**, `angel-tree-admin-staging`, in ATS / nh4sh.
Its current legacy Free team has one member and the user is Owner. The actual
Visitor access card says **“No protection settings”** and **“Upgrade to unlock.”**
The site still has no published app deploy. No failed write was retried and no
account token was read to bypass the dashboard or plan boundary.

Do not upgrade/migrate the shared ATS production team or change its team defaults
to solve staging. The prepared route is a **separate company-controlled
Credit-based staging team**, then supported transfer of **only the existing
undeployed staging site**, and **Private** visibility for production **and**
previews. Preserve the site's ID and reserved hostname; verify transfer support,
plan eligibility and settings before proceeding. Stop if the supported transfer
would replace either identifier or affect other projects. No transfer is performed
here. The new team's actual ID is deliberately unassigned.

Credit-based Free/Personal private projects are owner-only. If that is sufficient
and the account is eligible for a separate Free team, it may avoid an extra
subscription. Do not assume that eligibility. For collaborator access, budget a
separate **Credit-based Pro team starting at $20/month** before usage/taxes, then
review the actual checkout. This is independent of the scanner VM. Never convert
the existing shared legacy team as an unapproved shortcut.
[Private project rules](https://docs.netlify.com/manage/security/secure-access-to-sites/project-visibility/),
[current Pro pricing](https://www.netlify.com/pricing/).

The current settings are at:
[staging Visitor access](https://app.netlify.com/projects/angel-tree-admin-staging/configuration/general#visitor-access).
After an approved eligible staging-team setup, a Team Owner or Developer with
project access uses **Project configuration → General → Visitor access → Project
visibility → Private → Production and previews → Save**. For a legacy plan that
actually offers it, site-specific Password Protection must similarly cover
**all deploys**. Do not select previews-only: this separate staging site's primary
deploy is its Netlify “production” context even though it is not the business CRM.
No password was generated, entered or saved.

Keep the CRM's existing Supabase login, effective-access rules and RLS. Perimeter
login and CRM login are separate sessions; no Identity/SSO bridge is introduced.
Do not change company dashboard SSO/MFA to implement site-load gating. If later
inviting Git Contributors for team-login review, use the **Reviewer** invitation
path rather than assuming a Developer seat is required. Recheck plan eligibility.
[Netlify protection options](https://docs.netlify.com/manage/security/secure-access-to-sites/password-protection/).

### Verification required before marking protection true

After the approved setting change, read back the exact site, mode and all-deploy
scope in the dashboard. Before any later approved app release, test in a fresh
signed-out browser, then a permitted account and a non-permitted account. Cover
the named origin, immutable deploy URL, branch/preview URL if any, static assets,
`/login`, `/admin`, and `/api/health/live`. A CRM login redirect, application 401,
404, missing deploy, robots/noindex or obscure URL is **not** perimeter proof.
Verify app/RSC/API/static requests stay behind the perimeter, with no public alias
or redirect around it. Retest after signing out and cached navigation. Retain
private screenshots/headers without session cookies or credentials.

There is no live staging artifact to prove that transport behavior now. Its
protection and live-origin flags stay false. Private site protection also blocks
external service webhooks; the initial `core-no-providers` profile remains correct.
Future real provider callbacks need a separately reviewed path; do not make the
staging CRM public to accommodate them.

## Scanner recommendation and budget

| Item | Review estimate | Scope |
| --- | --- | --- |
| DigitalOcean Basic bundled VM | $48/month | 8 GiB, 4 shared vCPUs, 160 GiB SSD, listed 5,000 GiB transfer |
| Optional weekly VM backup | +$9.60/month | 20% of base VM price; base plus weekly backup is $57.60 |
| Separate Netlify staging team | $0 if eligible owner-only Private; Pro starts at $20/month for collaboration | Separate decision; existing production team stays unchanged |
| Source-object backup, private registry, extra usage/tax/domain/monitoring | Not purchased or quoted as included | Choose after ownership, retention and operator decisions |

Prices were checked October 17, 2026. These are base estimates, not an all-in
operating-cost cap. The VM is unmanaged: ATS needs a named maintainer for security
updates, certificate renewal, alerts and recovery. A monthly billing cap does not
make usage extras free. Avoid substituting uncapped v5 pricing for the quoted
bundled plan. Stopping a VM is not the same as ending its billing; review the
provider's billing/recovery rules before procurement.
[Backup pricing](https://docs.digitalocean.com/products/backups/details/pricing/),
[bundled/v5 billing](https://docs.digitalocean.com/products/droplets/details/pricing/).

This recommendation fits low-volume staging and the prepared four-container
package. It is an engineering recommendation, not a benchmark: shared CPU may
vary, and the application's 12-second timeout still governs. If native two-scan
and definition-reload tests cannot meet it reliably, review a dedicated-CPU
option and new quote rather than increasing timeouts or approving unscanned files.

## Concrete host handoff, after separate approval

Use an ATS-owned account with a named owner/operator, separate staging project,
SSH key access and reviewed billing alerts. Assign the actual VM ID, region,
hostname, administrative source CIDRs and maintainer in private operational
records. The checked-in preparation inventory keeps these unassigned. Do not
reuse production credentials, the laptop scanner, a public upload-scanning service
or a free tunnel. Preserve the prepared in-company scanning architecture.

1. Use the selected Ubuntu 24.04 baseline and rootless Docker with cgroup v2 /
   systemd. Keep a nominal **8 GiB RAM / at least 2 vCPUs** allowance; total service
   caps remain 6.625 GiB. Disable swap and persistent core dumps on the approved
   scanner host only, with reviewed host change/reboot proof. This document
   changes no machine. Do not disable AppArmor globally to get rootless Docker
   working; use the vendor-supported Ubuntu package/profile route.
2. Run `hosting/inspect-host.mjs` directly on the candidate Linux host with its
   explicit local Unix Docker socket. It collects only selected OS/daemon facts,
   omits identities/addresses/credentials, and performs no install/start/change.
   It checks the chosen OS, architecture, CPU, usable memory, no active swap,
   rootless daemon and cgroup mode. The 7.5 GiB usable-memory floor allows kernel
   reservation on a nominal 8 GiB VM. Operator/provider evidence must still bind
   those facts to the approved host; don't run it inside a container as host proof.
   A suitable preliminary result **never** means ready for activation.
3. Build all pinned images natively on the chosen AMD64 host, record image and
   source digests, and preserve the approved images privately. Validate the exact
   resolved Compose file and actual cgroup memory/no-swap limits. Do not rebuild
   or silently float the pinned Node/ClamAV/nginx versions to hide build failures.
4. Retain loopback-only proxy publication while preparing. Public ingress, when
   separately approved, must expose only trusted TLS on **443**; SSH is restricted
   to approved operators. Deny engine 3310, bridge 3311, direct 8443, Docker API and
   any other bypass on public IPv4/IPv6. Netlify functions cannot reach a VM with
   only a private VPC address without an additional approved connectivity design.
   A public TLS endpoint with the separate scanner bearer credential is the
   planned connection, not a publicly usable anonymous scanner.
5. **Review rootless port443 binding explicitly.** Standard rootless Docker may
   not bind ports below 1024. The existing loopback 33443 tests don't establish this
   capability. Use the documented narrowly scoped RootlessKit binding mechanism
   or a separately reviewed TCP ingress arrangement. Do not broadly lower the
   host's privileged-port boundary, add capabilities to the scanner containers,
   run them as root or change the CRM to accept a port alias. The local VM's
   existing privileged-port setting was read, not changed or copied as policy.
6. Apply a provider/cloud firewall as well as a reviewed host/Docker network
   policy. Docker-published ports can bypass UFW rules; “UFW enabled” is not an
   external reachability test. Do not disable Docker's firewall integration.
   Verify actual remote denial and permitted TLS from independent IPv4/IPv6
   clients. Separate upstream definition/OS-update egress from file-processing
   containers, which retain their internal-only networks.
7. Supply a new private staging token and trusted TLS chain/key only at approved
   provisioning. Use private file mounts with actual mapped UID readability,
   retain 0600 token/key modes, and recreate the relevant service after atomic
   credential/certificate replacement. Confirm renewal with a real post-renewal
   synthetic scan. No key/token was generated for this preparation.
8. Run the existing clean/EICAR, limit/archive, wrong-token/TLS, concurrency,
   outage/restart and scratch/log tests on the actual host. Measure two concurrent
   25 MiB scans during definition update/reload with peak memory and latency;
   leave failed/uncertain files held. Set up an actual alert recipient/operator
   response for stale definitions, failed updates, disk/memory, TLS expiry and
   persistent 503s. Do not claim Docker unhealthy status alone sends an alert.
9. Preserve source files and audit history. A scanner VM backup includes its
   OS/config/signature disk and can include mounted secret files; restrict backup
   access and review key custody. It does **not** back up Supabase Storage source
   objects or the database. Approve separate encrypted source-object backup,
   manifest, key custody, retention and recovery objectives, then prove a paired
   synthetic restore. Do not enable a retention purge or scan legacy business
   files in this step.

The read-only command, after reviewing the real candidate socket path, is:

```sh
node scripts/private-scanner/hosting/inspect-host.mjs --socket /run/user/1000/docker.sock
```

The UID/socket above is illustrative, not an assigned operator identity. The
tool uses that explicit Unix endpoint rather than inheriting a remote context.
It does not perform SSH, contact a cloud API, expose raw daemon data, or update
any readiness manifest. See the existing hosting README for the reviewed
four-container commands; none are executed on a remote host here.

## Local verification and preserved state

The existing label-verified disposable scanner project is used only on loopback
for synthetic tests, then returned to its prior stopped state. No customer bytes
or provider messages are involved. New tests exercise preliminary host screening,
missing/insufficient facts, remote-endpoint refusal and safe output. Existing
staging preflight must still reject unassigned/unverified targets. Full results
are recorded in `staging/HOSTING_PREPARATION_VERIFICATION.json`.

The local Docker VM has about **5.76 GiB RAM**, ARM64 and Ubuntu 26.04. It is
functional test evidence, not a capacity-certified substitute for the recommended
8 GiB Ubuntu 24.04 host. No VM resize or host security change is made. The original
local CRM/scanner, owner account, employee UI, earlier feature work, migrations,
RLS, default grants, source-retention policy and production configuration remain.

The existing roadmap is unchanged: complete these PR18 ownership/protection/host
decisions and actual-host proofs, isolated Auth mail/session and server-key/runtime
binding, then request a separately approved protected staging release. All
unproven application readiness flags stay false; no deployment is authorized.

## Operational sources

- [Docker rootless setup](https://docs.docker.com/engine/security/rootless/) and
  [Ubuntu, cgroup and privileged-port limitations](https://docs.docker.com/engine/security/rootless/troubleshoot/).
- [Docker/firewall and UFW interaction](https://docs.docker.com/engine/network/packet-filtering-firewalls/).
- [DigitalOcean cloud firewall](https://docs.digitalocean.com/products/networking/firewalls/details/features/).
