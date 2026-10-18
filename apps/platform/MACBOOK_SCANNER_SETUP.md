# Home MacBook scanner preparation — PR18/F17

Prepared October 17, 2026, locally only. **Leave this package parked until the
owner is home.** No remote access, cloud account, hostname, token, certificate,
VM, login service, network rule or production setting was created by this work.
This continues the existing scanner roadmap; it does not authorize activation.

## Decision

Use the company-controlled Apple Silicon MacBook as a **candidate staging scanner
host**, keeping Netlify and Supabase as core providers. The owner estimates 16 GB
RAM; the actual model, RAM, OS and home network remain unverified. A dedicated
Ubuntu 24.04 ARM64 Lima VM is prepared with 8 GiB RAM, four CPUs and a sparse
64 GiB disk. The Mac keeps the remaining physical memory for macOS. Preliminary
screening asks for 80 GiB free on the home volume to allow disk/build headroom;
move/review the VM location explicitly if that is not available. This is a
conservative preparation allowance, not a measured workload disk requirement.

No new paid hosting subscription or extra infrastructure account is required
for the prepared approach. Electricity, Internet and any eventual hostname/TLS
arrangement are not a promise of zero operating cost. This is suitable to
evaluate for staging; it is not yet a commercial availability commitment.

The VM has **no Mac folder mounts**, Rosetta, imported default templates or
automatic scanner installer. Rootless Docker is installed later in the guest.
The existing four-container scanner is unchanged: 6.625 GiB total memory caps,
isolated parser/bridge, separate definition updater, non-root/read-only runtime,
no capabilities, bounded memory-only scratch, private token and TLS proxy.
Only guest loopback 8443 is forwarded to **Mac loopback 8443**; other automatic
port forwards are suppressed. Lima retains its local SSH management channel
and private Docker Unix socket. Neither is a public service. Guest outbound
Internet remains available for installation/updates; scanner isolation is
provided by the unchanged container networks and must be tested on the target.

Default Lima Docker templates currently select Ubuntu 26.04 and shared Mac
folders. This profile instead pins the reviewed 24.04 image and SHA-256, with
no unpinned fallback. If the dated image disappears, stop and refresh its source
and digest deliberately; do not silently use another OS or remove verification.

## Prepared deliverables

- `scripts/private-scanner/home-mac/lima.yaml`: validated VM profile; not started.
- `scripts/private-scanner/home-mac/prepare.mjs`: read-only Mac screening and
  offline committed-source packet preparation/verification. Node 22 is enough;
  no npm dependencies are needed for this helper or scanner bridge.
- Existing `scripts/private-scanner/hosting/`: complete scanner build/config
  package and Linux host inspector. Runtime files have not been rewritten.
- Portable packet: exactly 20 allowlisted source/config/doc files and a SHA-256
  manifest, with private file/directory modes. No environment files, app source
  data, database exports, TLS key, token, Supabase credentials or local linkage.

From the full repository's `apps/platform` directory, after committing reviewed
preparation locally:

```sh
node scripts/private-scanner/home-mac/prepare.mjs --prepare /absolute/NEW-packet-directory
node scripts/private-scanner/home-mac/prepare.mjs --verify /absolute/packet-directory
```

Preparation reads committed Git blobs from the recorded full source revision,
never crawls the working copy, never overwrites an existing destination and has
no install/start/deploy mode. If an interrupted export leaves a partial new
directory, verification fails; use a different new destination. Transfer the
verified packet using an owner-controlled method. Its hashes detect accidental
corruption, not an attacker who replaces both files and manifest. Compare the
reported manifest hash and source revision against this trusted development
copy before executing anything from a transferred packet.

## When the owner is home — first session

These are **future operator steps**, not commands executed by this preparation.
They operate only on the home Mac and a new scanner VM, never on an existing
development VM. If another VM already uses the intended name, stop and inspect;
do not replace it, change its resources or reuse its data.

1. Verify the Mac model/RAM/available storage, macOS security updates, FileVault,
   owner account and physical access. Use an ordinary account; do not enable
   automatic login, weaken FileVault, disable host security or open remote login.
   Install/review Node 22 and Lima from their official distributions if absent;
   Lima 2.2.1 was used to validate the profile. VZ requires macOS 13.5 or later;
   that compatibility floor is not a recommendation to use an unsupported OS.
2. Copy the packet privately, compare its manifest hash, then run from its root:

   ```sh
   node scripts/private-scanner/home-mac/prepare.mjs --verify /absolute/packet-directory
   node scripts/private-scanner/home-mac/prepare.mjs --check-mac
   limactl validate scripts/private-scanner/home-mac/lima.yaml
   limactl list
   ```

   Screening reports only selected OS/numeric facts. It cannot mark activation
   ready. It checks the current Mac, not the absent home machine.
3. Once those facts and the new name are reviewed, create/start **only** the new
   instance. The following creates a VM but does not install Docker or scanner:

   ```sh
   limactl create --name ats-scanner-home --tty=false scripts/private-scanner/home-mac/lima.yaml
   limactl list ats-scanner-home --json
   ```

   Before starting, review the generated config privately for global Lima
   overrides: no mounts, no additional provision scripts, no routable network,
   and only the prepared loopback/socket rules. Stop if those differ. Then:

   ```sh
   limactl start ats-scanner-home
   limactl shell ats-scanner-home
   ```

4. Inside that guest, follow Docker's official Ubuntu 24.04 **APT repository**
   installation and rootless setup linked below. Use Ubuntu ARM64 packages,
   `uidmap` and `dbus-user-session`; check subordinate UID/GID ranges and user
   systemd. Use the package-provided `dockerd-rootless-setuptool.sh install`,
   disable the unused rootful daemon/socket on **this new guest only**, and
   verify the selected endpoint is `/run/user/<guest-UID>/docker.sock`.
   Install Compose/Buildx from the same official repository. Do not use a
   curl-piped Docker convenience installer, Docker Desktop requirement, public
   Docker TCP endpoint, privileged scanner or permissive socket as a shortcut.
   Review user-service linger for restart without an interactive guest session.
   Guest installation has intentionally not been automated or target-tested.
5. Place a separate copy of the packet inside the guest using Lima's `copy`
   command or its private SSH transport, never a shared Mac home folder. Install
   Node 22.23.3 ARM64 using the official archive and verify its signed checksums
   for the read-only inspector. Run inside the guest:

   ```sh
   node scripts/private-scanner/hosting/inspect-host.mjs --socket /run/user/<guest-UID>/docker.sock
   ```

   Substitute the actual UID privately. Require Ubuntu 24.04, >=7.5 GiB usable
   guest/daemon RAM, rootless Docker, cgroup v2/systemd and zero active Linux
   swap. Apply the reviewed no-coredump policy in this new guest; confirm it
   actually applies after restart. Do not lower thresholds to get a green check.
   Guest tmpfs/no-swap does **not** establish that macOS never pages VM memory.
   Review host FileVault, memory pressure and this residual risk before any
   business file. Do not disable macOS swap/protections casually.

## First runtime session — synthetic files only

Follow the existing hosting README and activation runbook. Use fresh **local
test** token/TLS material, stored privately outside the packet and Git; this
preparation creates none. Use a locally trusted certificate with its explicit
test CA; never disable TLS verification. Measure rootless UID mappings for
token/key mounts and keep files 0600. Development mapping numbers are not portable.
The paths env file contains only private file paths and loopback/8443. The
scanner requires **no Supabase service-role key, Stripe key, customer dataset or
Netlify access token**. It does not pull source files by itself.

Build the unchanged Compose package in the guest after version/security review.
The packet preserves build context relationships; `compose.yaml` is under
`scripts/private-scanner/hosting/`, with `context: ..`. Dockerfiles pin base
digests; package availability and transitive APT dependencies still need review.
Do not substitute an unreviewed version if an exact package is unavailable.
Keep all listener overrides at 127.0.0.1:8443 for this first session.

Require actual native ARM64 builds, enforced cgroup/memory/swap limits, rootless
secret readability and an authenticated real synthetic scan. Reuse the full
repo's existing `tests/scanner-hosting.integration.test.mjs` and recovery test
procedures in `tests/README.md`; tests/fixtures are not bundled as production
runtime files. Their current disposable-VM harness is not a drop-in home-host
installer: explicitly adapt/select only the new labelled test stack and socket,
preserving all existing stacks. Do not point it at production Storage or records.

Repeat clean/EICAR, exact/over-25 MiB, encrypted/oversized expanded archives,
stale definitions, wrong token/digest, outage/restart and **two simultaneous
25 MiB scans during definition updates/reload**. Preserve the application 12s
deadline and existing claim/finish/access rules. Earlier development ARM64
results are evidence about that environment, not a pass for this Mac. No
production object or switch is needed to test the server.

## Connection and operations — still unassigned

Do not configure router forwarding, public DNS, a tunnel or app scanner origin
now. A loopback-only VM will deliberately be unreachable from Netlify.

At home, determine ISP public IPv4/IPv6, CGNAT, inbound restrictions, dynamic-IP
behavior and home router capability. Record details privately. If inbound TLS
cannot be made safe/reliable, keep this a local/staging test host and revisit
the connection design; do not expose engine 3310, bridge 3311, Docker API or
Mac/VM administration. No tunnel provider or additional account is approved.
An owned hostname, publicly trusted certificate/renewal, authenticated TLS-only
ingress, reviewed routing/firewall boundary and real outside-network IPv4/IPv6
denial tests remain required. Do not switch the VM forward to 0.0.0.0 as a quick
fix; the end-to-end boundary needs review first. No network ingress design has
been selected by this local package.

Agree a named operator, external health/expiry/freshness monitoring and response.
Docker's unhealthy status alone neither restarts a stuck process nor sends an
alert. Signature updater Internet access must stay separate from document
processing. Preserve source-object/database backups and retention; the scanner
is not the file backup. A home power/ISP failure must leave attachments held
for retry, never automatically approved or scan gates disabled.

Before unattended use, connect reliable power, keep ventilation clear, inspect
battery health and prefer Ethernet. Review Apple's sleep settings so the Mac
and guest stay running on power; do not assume closing the lid is safe or
equivalent to a server. Verify the actual operating arrangement. No power/lid
settings were changed here. Native Lima login startup can be considered later:

```sh
limactl autostart enable ats-scanner-home --condition=login
```

Do not execute until the new guest is verified. Login startup requires the
owner's login/FileVault unlock; it does not prove unattended reboot recovery.
Do not enable auto-login or weaken disk encryption. Test restart, owner logout,
power/Internet loss and recovery before making an availability promise. Stop
with `limactl stop ats-scanner-home` when deliberately taking this new host
offline; retain its disk/definitions. No delete/prune/rebuild-over-data step is
part of this handoff.

## Completion boundary and next work

Local verification: **740 regression tests passed**, including nine new packet/
Mac-preparation tests; typecheck passed. Lima 2.2.1 validates the profile, and
effective-template inspection confirms Ubuntu24.04 ARM64/8GiB/4CPU/64GiB,
empty mounts/networks/provision scripts, disabled containerd/Rosetta, the local
Docker socket, loopback8443 and catch-all suppression of other auto-forwards.
No new VM was created. The existing disposable VM, CRM and scanner were left
running; the separate stopped hosting test stack was left stopped. No app build
was needed for this documentation/offline-tool change. Existing native scanner
corpus results remain in the earlier hosting and Netlify-evaluation reports;
they have not been relabelled as home-host verification.

Local preparation, portable-source integrity checks and profile validation can
be completed while the owner is away. Actual home hardware, VM installation,
runtime corpus/capacity, secret mapping, network/TLS, monitoring and recovery
remain **unverified**. Staging and production scanner switches stay OFF; no live
configuration is changed. Resume at “first session” when the Mac is available.
Other CRM work can proceed independently; nothing needs to stay waiting in an
active turn over the weekend.

## Official references

- [Lima VZ support](https://lima-vm.io/docs/config/vmtype/)
- [Lima ports](https://lima-vm.io/docs/config/port/)
- [Lima login startup](https://lima-vm.io/docs/usage/autostart/)
- [Docker Ubuntu repository install](https://docs.docker.com/engine/install/ubuntu/)
- [Docker rootless setup and limitations](https://docs.docker.com/engine/security/rootless/)
- [Node 22.23.3 archive](https://nodejs.org/en/download/archive/v22.23.3)
- [Apple sleep and wake settings](https://support.apple.com/guide/mac-help/set-sleep-and-wake-settings-mchle41a6ccd/mac)
