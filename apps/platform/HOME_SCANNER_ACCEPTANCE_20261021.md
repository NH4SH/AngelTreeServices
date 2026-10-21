# Home scanner local acceptance — October 21, 2026

The owner-authorized home Mac was independently accessed over a dedicated LAN SSH key after matching the owner-provided host fingerprint. Scanner work remains local and synthetic. No public ingress, staging activation, production configuration or application deployment was performed.

## Verified home setup

The actual Apple silicon Mac has 16 GiB memory and FileVault enabled. Its isolated Ubuntu 24.04.5 arm64 Lima VM has four CPUs, 8 GiB nominal memory, no Linux swap and rootless Docker using cgroup v2/systemd. The system-wide Docker/containerd services remain inactive and disabled. There are no shared Mac folders; scanner HTTPS remains on loopback port 8443. Docker, bridge and engine ports were not exposed to the LAN or internet.

The immutable 20-file packet from `08c2d9ff8914cb414d7a5c164c7442d6a26e9427` still passes its manifest verification. Its manifest SHA-256 is `26be475b7ee55076ca522e2f57f8d78c0e47ee78cbf7d0c1c94d2e47ff141402`. Existing source images and credentials were preserved. Separate local image tags correct inherited non-readable program/config modes without changing runtime users or secret-file permissions; these are local recovery artifacts, not a newly published production image.

## Maintenance and restart fixes

- Installed 57 reviewed Ubuntu package upgrades and six new kernel packages, with zero removals. Kernel `6.8.0-147-generic` is running and the package audit is clean. Eight vendor-phased updates remain deferred at Ubuntu's defaults.
- Persistently masked the guest's Apport service because it overwrote the no-dump handler at boot. After a new VM boot, `kernel.core_pattern=|/usr/bin/false` remains effective. The existing zero-core container limits remain enforced.
- Registered Lima 2.2.1 owner-login startup through `~/Library/LaunchAgents/io.lima-vm.autostart.ats-scanner-home.plist`.
- A real shutdown exposed an updater recovery gap: the engine, bridge and proxy restarted but the signature updater remained stopped. Added the guest user unit `~/.config/systemd/user/ats-scanner-local.service`, ordered after and associated with rootless Docker. It runs the existing exact Compose project with its existing paths and permission override, using `up --detach --no-recreate --no-build --pull never`. Existing containers, images, mounts, credentials, limits and networks were preserved.
- Lima's stop command unloads its login job; the existing plist was explicitly reloaded for the recovery test. A stale waiting stop CLI was terminated only after its requested shutdown had completed. The new login-managed VM and all four containers are running.

The Mac itself was not rebooted or logged out. FileVault unlock and owner login are still needed after a full Mac restart. Physical lid/power, logout/login and home internet outage behavior have not been witnessed. The owner's existing sleep-disabled setting was observed, not changed. Login startup is not a claim of unattended recovery before FileVault unlock or continuous monitoring.

## Actual home test results after maintenance

Post-maintenance smoke passed at `2026-10-21T19:20:44.671Z`. The full native synthetic HTTPS capacity/security suite then passed all 11 subtests plus its parent (12 results, zero failures/skips): real clean and EICAR verdicts, matching digests, exact 25 MiB boundary, oversized refusal, TLS/authentication denial, encrypted/expanded archives held, bounded concurrency, engine outage/recovery, loaded-signature freshness and resource/log/disk checks.

Two concurrent 25 MiB requests through the unchanged application scan client completed cleanly in 430/469 ms. During a real definition-update check plus engine reload, both requests safely returned unavailable in 9,172/9,141 ms and scanning recovered, preserving the 12-second deadline. Definitions were already current (version 28160); a concurrent new-definition download burst was not observed. The stale-signature guard used the actual engine response with a future evaluation argument; the machine clock and signature files were not changed.

All four services retained nonroot users, read-only roots, dropped capabilities, no-new-privileges, enforced memory/no-swap/CPU/PID/core bounds and their original network separation. No OOM kills occurred. Peak engine memory was about 1.02 GB and bridge memory about 233 MB. No synthetic file body or token was found in the checked logs or writable layers.

## Remaining before hosted staging and release

1. Select and verify a trusted HTTPS ingress route. Router access/model/provider details were requested. No port forwarding, DNS change, public tunnel or external firewall change was made. LAN SSH access does not make the scanner reachable from Netlify.
2. Verify certificate renewal, outside-network authentication/denial and bypass-port checks, bounded monitoring and operator response. The current certificate and token are localhost test credentials, not staging/production credentials.
3. Review host availability and encrypted macOS paging: the host was already using encrypted swap, although Linux guest swap is disabled. The complete Mac/Linux operating arrangement is not a proof that business bytes can never be paged by the host.
4. Establish separate staging credentials and synthetic hosted acceptance, paired database/source-object recovery and the coordinated existing production migration/application cutover. Do not activate scanning, retention, purge or automation as a side effect.

Sanitized independent evidence is kept locally in `/Users/noelsierra/Documents/Codex/2026-10-21/home-mac-scanner-setup/HOME_SCANNER_POST_MAINTENANCE.json` and `HOME_SCANNER_VERIFIED_REPORT.json`. Guest maintenance before/after records and test results are retained outside the source packet in the private scanner runtime. No SSH private key, scanner token or TLS private key is included in Git.

References: [Lima login startup](https://lima-vm.io/docs/usage/autostart/), [Docker restart policy behavior](https://docs.docker.com/engine/containers/start-containers-automatically/), [Compose up preservation options](https://docs.docker.com/reference/cli/docker/compose/up/), [systemd unit relationships](https://www.freedesktop.org/software/systemd/man/latest/systemd.unit.html). Actual installed Lima 2.2.1 help/source and the home unit state were checked; no options from newer Lima versions were assumed.
