# Private MacBook Firewood operations

This prepares operator-controlled test services using the existing two Macs.
No public endpoint, live payment, sender, CRM integration or subscription is
enabled. Source preparation never activates login jobs.

## Prepared schedules

- PostgreSQL and web: launchd supervises their foreground processes and restarts
  unexpected exits, with a 30-second throttle.
- Worker: at login/load and every five minutes; one bounded batch, process lock
  and the reviewed SQL leases/idempotency remain in force.
- Monitor: every minute; checks database/web, heartbeat, review/overdue queues,
  backup freshness, disk space and battery power. Email-disabled jobs do not
  generate a false pending-email alarm. Logs contain redacted status only.
- Backup: at login/load and hourly; PostgreSQL consistent dump streamed through
  AES-256-GCM encryption. Plaintext dumps are never written to disk. A failed or
  interrupted dump cannot replace the last successful snapshot.
- Development Mac watcher: every five minutes while that Mac is awake and
  connected. It detects server/network loss and pulls the latest backup over the
  existing pinned SSH/WireGuard route. It verifies SHA-256 and decrypts to a
  discard stream for authentication before acknowledging the remote copy.

Retention keeps 24 recent snapshots and one snapshot for each of seven calendar
days. The server deletes superseded copies only after a verified off-device
acknowledgement. A 128-snapshot safety ceiling stops growth and raises an issue
if transfer/retention remains unresolved. Old manual recovery-drill backups are
outside this managed namespace and are never removed by these scripts.

The existing recovery key is private and excluded from snapshots/source. The
second Mac's key copy and backup directory are private. This is a second-device
backup, not geographically separate storage. If the development Mac is asleep or
disconnected, copying and its local outage notifications wait until it returns.
Local macOS notifications are rate limited and require that Mac's notification
permissions. No external alert email or customer message is sent.
Freshness alarms are paused when the remote server is intentionally inactive;
the watcher can still verify and copy its latest existing snapshot.

Worker, backup, watcher and schedule-controller locks use macOS's built-in
`lockf` on an inherited descriptor. The kernel releases a lock when its owner
exits or is killed. The private lock file remains in place intentionally; never
delete it to recover a lock. This avoids concurrent stale-PID reclamation races.

## Preparation and activation

On the home Mac, run `node <code>/prepare.mjs`. This stages five plists under the
private lab's `ops/LaunchAgents/`, not in the user's live Login Items. It validates
the existing test-only application environment and copies only database access
into a separate private operations file. Backup/monitor jobs use read-only
database sessions and do not receive Stripe or Resend keys.

Prepare the development watcher with `node <code>/prepare-watch.mjs
<existing-private-recovery-key-file> <existing-pinned-ssh-config>`. It stages one
plist and copies only five standalone built-in-Node modules into
`~/.local/share/ats-firewood-qa-ops/code/`; no package subscription is needed.

After review, private login-job activation is explicit:

```
node <home-code>/launchd.mjs server --activate-private-qa
node <development-source-code>/launchd.mjs watch --activate-private-qa
```

Server activation requires AC power. These are per-user login agents; they start
after the owner's login/unlock, not before FileVault unlock. No automatic login,
FileVault, power-management or scanner setting is changed. macOS 26 may support
remote FileVault unlock under Apple's requirements, but that path and full-Mac
restart recovery have not been tested here. The private VPN cannot be assumed to
be available before the encrypted system has started.

Activation and deactivation validate every owned file and loaded job path before
changing jobs. An unfinished transition is recorded before any job is changed.
Activation failure rolls back newly loaded jobs, including a bootstrap that
reports an error after loading. If cleanup cannot stop a job, its plist remains
and settings retain `active: true`, `attentionRequired: true` and a control error.
An incomplete shutdown likewise cannot silently report an inactive service or
mute monitoring. Inspect that status and the owned jobs before retrying.
Shutdown/rollback allows up to 40 seconds for asynchronous launchd removal,
covering the configured 30-second exit timeout, before reporting cleanup failure.

Use the matching `--deactivate-private-qa` command to unload only owned jobs,
remove their matching live plists, and leave data/keys/backups intact.
Stop one-shot jobs and the web process before stopping PostgreSQL.

## Status and recovery

Home status: `ops/state/monitor.json`; second-Mac status:
`~/.local/share/ats-firewood-qa-ops/status.json`. These files do not contain
customer details, credentials or raw Stripe payloads. Database/web health does
not prove public internet reachability or real provider webhook delivery.

An older backup must be restored to a separate quarantined database with sending
off, its identity and records verified, and provider events reconciled before any
fulfillment resumes. Never automatically restore over the active database or
replay an uncertain old confirmation queue. Restore is deliberately not a
scheduled action.

Public HTTPS/provider delivery, continuous AC/lid uptime, actual login/full-host
reboot, sustained co-hosted CRM capacity, notification delivery permission,
off-site retention and separate live-order approval remain release gates.

Native startup verifies an owner-private hardware UUID hash in
`host-identity.private.json` under the dedicated lab. A trusted operator pins the
existing Mac over the established SSH identity before startup. Missing, shared,
symlinked or mismatched pins refuse startup. Hostname/DHCP changes do not change
the approved machine. The pin and raw hardware ID are excluded from exports.

## Bounded cold-start recovery

Native database/account startup retries known temporary host-probe, database and
Stripe transport failures up to six times. Backoff is 1/2/4/8/15 seconds, with a
60-second window for starting further attempts. In-flight operations retain their
own existing timeouts; the window does not abandon a live connection or task.
Host/configuration setup in the supervisor has a shorter 20-second retry window.
Wrong identity, credentials, schema, sandbox or private-file permissions stop
immediately. No guard is relaxed or automatically repaired.

Worker order processing begins only after startup succeeds. Its existing SQL
leases/idempotency and 150-second work deadline remain; the supervisor permits
240 seconds for child startup plus work. It never reruns a started batch as a
startup retry. An interrupted or unhealthy batch remains for its normal durable
queue handling and operator review. Read-only encrypted backup operations can
retry temporary dump/stream interruptions; their lock, last verified snapshot,
partial-file cleanup and retention safeguards remain in force.

Successful job state includes startup attempt counts and defined failure codes.
Exhausted startup failures retain code, phase, retryability, attempt count and an
exhausted flag. Unknown errors and arbitrary child stderr become generic codes;
connection strings, provider payloads, raw messages and stack traces are not
persisted. This improves diagnosis without exposing credentials or order data.
A further complete cold reboot is still needed to assess the new behavior under
real login load; controlled delayed-dependency tests are a separate check.
