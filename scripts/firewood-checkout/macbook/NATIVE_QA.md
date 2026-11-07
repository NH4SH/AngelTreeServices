# Private MacBook Firewood runtime

This adapter reuses the reviewed SQL checkout, durable worker, browser interface,
Stripe sandbox and existing MacBook. It requires no provider subscription. It
does not publish checkout, change CRM or install startup/background jobs.

The new private laboratory uses a dedicated native PostgreSQL 17 cluster with
loopback port 56382 and database `firewood_macbook_qa`. Roles are separate:
`firewood_macbook_migrator` owns this database; `firewood_macbook_worker` cannot
create tables or alter environment/migration markers or the CRM queue. Existing
embedded test orders and CRM/scanner databases are never opened by this adapter.

`native-main.mjs web` binds only 127.0.0.1:56381 on the approved physical MacBook.
`native-main.mjs worker` runs one bounded batch; `status` returns redacted status.
`native-migrate.mjs --apply-private-macbook-qa` is an explicit operator migration.
All commands require the exact claimed Angel sandbox, a test key and explicit
MacBook test enablement. The adapter refuses email sending and CRM enablement.
No production key fallback exists. The reviewed eight-attempt limit remains.

The private HTTP entry point uses HttpOnly/SameSite cookies and exact loopback
host/origin checks. It rejects forwarded headers and LAN/public binds. It does
not relax Render's HTTPS, Secure-cookie or verified database TLS rules. If an
existing private VPN peer relay is used for browser testing, neither PostgreSQL
nor its credentials are forwarded. No router/firewall/DNS change is required.

This is a private test adaptation. Public HTTPS routing and Stripe webhook
delivery, supervised startup, unattended encrypted off-device backups, alerts,
full-host restart/FileVault recovery, lid/power reliability, capacity alongside
future CRM services and approval to accept real orders are separate gates.
Process-restart tests cannot establish unattended recovery from a full Mac reboot.

The CLI uses private environment files stored outside the repository. Export
with `prepare-native.mjs <new-directory-outside-repository>`; it creates a source
hash manifest without including keys, data, node_modules or test results.

Native runtime, migration CLI and operations entry points verify the dedicated
lab's private hardware identity pin before database/provider access. The pin
contains a SHA-256 of the IOPlatformUUID, not a mutable hostname, and is created
only by the trusted operator over the established pinned SSH connection. It is
not generated automatically, included in source exports or accepted from HTTP.
The existing UID, private-file, database, sandbox and sending guards remain.
