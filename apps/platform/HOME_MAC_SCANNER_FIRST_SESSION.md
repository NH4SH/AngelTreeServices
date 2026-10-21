# Home Mac scanner: first setup session

Use these steps on the **home M1 MacBook**, not the development Mac. This session installs the two tools and checks the prepared packet. It does not expose a service or change the CRM. We will review the results before creating a VM, installing the scanner or arranging external HTTPS access.

## 1. Prepare the Mac

Connect it to power and reliable Internet. Keep the lid open. Install available supported macOS updates and restart first. Current Homebrew supports macOS 15 and newer. The planned scanner needs at least 16 GB physical memory and 80 GB free space; the check below confirms the actual machine. Do not delete files or reduce the resource limits to make a check pass.

Open Terminal (Command-Space, type Terminal, press Return). In a separate Terminal tab, run this while setting up:

```sh
caffeinate -is
```

Leave that tab running; Control-C stops it. This is temporary, not a permanent power-setting change. Keep FileVault and the firewall enabled. No router forwarding or Remote Login is needed for this session.

## 2. Transfer the prepared packet

Transfer `AngelTreeScannerSetup.zip` to this Mac using AirDrop or another owner-controlled method. Put it in Downloads and double-click it. You should have:

```text
~/Downloads/AngelTreeScannerSetup/
  START_HERE.md
  packet/
    PACKET_MANIFEST.json
    scripts/...
```

The packet contains 20 allowlisted source/configuration/doc files plus its integrity manifest, with no credentials, company files, database copy or running service. Do not put Supabase, Stripe, Netlify or Resend keys in it.

## 3. Check/install Homebrew

In the original Terminal tab:

```sh
brew --version
```

If Homebrew is already installed, continue. If Terminal says the command was not found, follow the installer from [brew.sh](https://brew.sh/), including its displayed “Next steps” for enabling Homebrew in Terminal. Use the official stable installer, not a third-party setup script. If macOS asks to install Apple's Command Line Tools, complete that step. Open a new Terminal tab and check `brew --version` again.

## 4. Install the two tools

```sh
brew install node@22 lima
export PATH="$(brew --prefix node@22)/bin:$PATH"
node --version
limactl --version
```

This uses the documented Homebrew Lima distribution and Node 22. It does not require Docker Desktop or another hosting account. The PATH change applies to this Terminal session only. If the install reports an error, stop at that error rather than resetting or reinstalling existing tools/VMs.

## 5. Verify the packet and check this Mac

```sh
cd "$HOME/Downloads/AngelTreeScannerSetup/packet"
node scripts/private-scanner/home-mac/prepare.mjs --verify "$PWD"
node scripts/private-scanner/home-mac/prepare.mjs --check-mac
limactl validate scripts/private-scanner/home-mac/lima.yaml
limactl list --json
fdesetup status
```

Expected: `integrityVerified: true`, `preliminaryMacSuitable: true`, a successful Lima configuration validation and FileVault on. `readyForActivation: false` is expected at this stage. The Mac check contains only selected OS/resource facts, not passwords, serial numbers or environment variables.

Send back the output from these commands and `node --version` / `limactl --version`. If any resource check is false or a VM named `ats-scanner-home` already exists, stop and let us review it. Do not overwrite or delete an existing VM. If the supplied Ubuntu image/digest cannot be obtained later, stop; do not substitute an unverified image.

## What follows after this checkpoint

We will create the separate 8 GB Ubuntu ARM64 VM using the supplied profile, inspect its generated configuration before first boot, and preserve its zero Mac-folder mounts and loopback-only forwards. Then install rootless Docker inside that guest, configure the existing four-container scanner, create private local test TLS/token material and run clean-file/malware/timeout/permission tests. The existing packet's MACBOOK_SCANNER_SETUP.md and hosting README contain the operator details.

Once local checks pass, we will choose and verify a publicly trusted HTTPS connection that Netlify can actually reach, including ISP/NAT restrictions, authentication, certificate renewal and external denial tests. A home LAN address alone is not a working endpoint for Netlify. No public router ports, Docker socket or scanner engine port should be opened during these first steps. New infrastructure accounts, subscriptions or remote access are not part of this first session.

This is the initial **staging** host. Production scanner activation and business-file scanning require separate target tests and recovery verification. The scanner does not need a Supabase service key or pull production files by itself.

Sources checked October21: [Homebrew](https://brew.sh/), [Lima installation](https://lima-vm.io/docs/installation/), [Lima create](https://lima-vm.io/docs/reference/limactl_create/), [Docker rootless](https://docs.docker.com/engine/security/rootless/). The prepared source/hash manifest remains the authority for the transferred packet.
