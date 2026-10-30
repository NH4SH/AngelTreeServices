# Firewood runtime and operations

## Current installation — October 28, 2026

The permanent address is `https://checkout.angeltreeservices.org/firewood/checkout/`.
It runs against Angel's isolated Stripe sandbox with an access-code gate,
noindex/no-store and host-only secure cookies. Ordering is paused after testing;
live payments, customer email and CRM sending remain off. The public website is unchanged.

### Launch preparation follow-through

The owner approved continued preparation on October 28. The isolated test service
and its receiving Mac now have opt-in email alerts to the fixed owner inbox,
`info@angeltreeservice.org`, alongside local notifications. No customer or order
details enter these alerts. The current monitor's controlled attention/recovery
checks each reached the Inbox. Email delivery freezes its payload and identity
before the network call; uncertain delivery retries the same identity for at most
23 hours, after which it requires review. Accepted email is not sent again if the
local notification fails. The incident itself retains its pending identity over
process restarts and observation changes. `ops/notification-settings.json` contains
only version, enabled, sandbox and location; the private sending key is separate.

The distinct production directory `~/.local/share/ats-firewood-production` is
now staged with a fresh empty native cluster/database, new role passwords, new
TLS peers and backup key, source export and five job files. Those jobs are not
installed in LaunchAgents. A transient loopback-only database preflight on 56394
validated the schema, authenticated its encrypted backup and restored all 13
tables into a quarantined database with worker access denied. The temporary
cluster is stopped. The normal production port remains available for a later
checkout-only cutover after stopping the test profile; the two clusters must
never own it together.

A separate receiving-Mac directory/key was prepared and manually authenticated
and acknowledged the empty production backup. Its schedule and notifications
are disabled. Production settings have `stage: prepared`, `active: false`,
`livePayments: false`, `emailEnabled: false` and `crmEnabled: false`.
No live Stripe key, live webhook secret, customer-sending key or owner release
approval file is present. Actual activation was attempted as a negative check
and was refused before any job installation. Backup acknowledgement/private
reporting do not require working payment credentials.

The current county exemption was rechecked in published Spotsylvania Code
§21-137. The earlier CRM owner confirmation identifies the order-taking business
location in that county. The exemption is for qualifying domestic use; a business
buyer's use cannot be assumed exempt from their delivery address. The owner
approved household-only online orders, with business purchases handled by phone.
The source uses `firewood-20261028-household-v2`, requires an explicit boolean
use confirmation, and freezes it with the order's address and terms. One visible
acknowledgement covers household use and delivery/cancellation terms. Returned
unpaid orders restore the saved choice and contact details; office quotes require
the same explicit use basis. The earlier sandbox orders, messages and source are
preserved. This revision is checked in separate native schemas and a synthetic
local browser preview. The inactive production policy identity can be upgraded
only after proving all order/session/financial/outbox tables empty and preserving
the previous source and encrypted backup. No release approval is implied.
Ancillary stacking follows
the documented sale-treatment inference; no stacking-specific ruling is claimed.
The CRM's earlier Forest Products Tax classification/filing follow-up also remains.
The existing CRM import is explicitly sandbox-only, with test references, terms
and payment verification. It cannot receive live orders by changing a URL/key.
No production CRM contract or endpoint has been activated or modified here.

Evidence and remaining decisions are in the Website workspace's
`outputs/firewood-checkout/launch-preparation-20261028/`. The separate controlled
confirmation rehearsal proved four confirmation copies plus alert/recovery emails
in the owner's Inbox; it did not enable automatic customer sending.

The active namespace is `~/.local/share/ats-firewood-routed-sandbox-20261028/`.
Its separate native cluster binds to loopback 56388; authenticated HTTPS uses
56389, with the private relay on 56390. Caddy reaches host loopback through
`host.lima.internal`, presents its dedicated client certificate and trusts the
exact backend certificate/DNS name. The backend pins distinct gateway and owner
certificates. Neither the database nor app has a LAN/public listener. Public
owner/health routes are blocked and forwarded headers stripped. Existing scanner
routes, listeners and policies were preserved; reload used SIGUSR1 without a
container restart, router change, new subscription or nameserver migration.

Public HTTPS renews through the existing Caddy ACME setup. Its initial certificate
expires January 26, 2027. Private peers last 90 days; monitoring warns 14 days
before expiry. Renew private peers through controlled maintenance: stage new
isolated certificates and gateway trust/client material, update native pins,
validate/reload the checkout route, restart the owned web job, verify both
directions and retain rollback material. Never disable certificate verification.

`ops.mjs` owns five login jobs under `com.angeltreeservices.firewood.routed-sandbox`:
database/web restart on failure, retries every 30 seconds, monitoring every
60 seconds and hourly encrypted backups. Managed web disables its foreground
worker. Startup verifies the approved MacBook and owner-approved battery >10%
policy; database/web stop at 10% or unknown power. Global power/CRM settings stay
unchanged. Monitoring covers web/database/public HTTPS, worker/queue health,
failed/overdue retries, jobs, disk, power, certificate expiry and local/off-device
backup freshness. Alerts contain no order details; startup has a three-minute
notification grace.

`watch-routed.mjs` runs on the other Mac every five minutes. It uses the existing
pinned private SSH connection, verifies archive hash and AES-256-GCM
authentication, then acknowledges durable receipt. Its key is in a separate
private config directory. Server pruning requires acknowledgement. Retention
keeps 24 recent hourly copies and one from each of seven days; unacknowledged
copies remain, with an attention-raising 128-archive cap. This is a second-device
backup, not an off-site/cloud backup. The receiving Mac must be available.

Pause availability before maintenance. Use the owned operations controller's
`deactivate`/`activate` actions; conflicting files/listeners are refused and
partial activation rolls back. Keep newer shared gateway configuration. Restore
only into a quarantined database with worker CONNECT revoked, authenticate the
copy and compare every table. Reconcile current Stripe/email evidence before
resuming any old work; never automatically replay an old outbox or repeat an
uncertain payment/refund outside the provider's idempotency window.

Jobs resume after this user's login following FileVault unlock. The MacBook and
home gateway/network must remain available. No automatic login or security
protection was weakened. The completed whole-machine reboot drill was not repeated.

The same code has an explicit `production` profile with distinct root
`~/.local/share/ats-firewood-production`, job prefix
`com.angeltreeservices.firewood.production`, database `firewood_orders` and
separate backup receiver/key. It is staged as described above, with no production jobs activated. Profile/settings
selection alone cannot activate payments: a private owner-approved release file,
restricted live merchant key, live webhook and matching identities must satisfy
all runtime gates. No live file/key was created; its empty production database is now staged. The review-only
operations specification is `../operations.review.json`.

Before live cutover: finish tax applicability review, customer confirmation
delivery/operator handling and the separate production CRM contract; stage fresh
empty production storage, credentials, TLS peers and off-device backup target;
verify restricted live-key permissions; and obtain final approval. A short
checkout-only maintenance window switches the single native port to that separate
profile. Never import sandbox orders. Availability starts paused. Public website
links and Git release require their own approval.

Current evidence is in `outputs/firewood-checkout/permanent-routing-20261028/` in
the Website workspace. Run `npm run test:firewood:candidate` and the existing
`npm run test:firewood`. Exported native tests use the separate test database and
disposable schemas. No dependency was added. No Git/public website release occurred.

### Operations review corrections

The follow-up review separates observed issues from successfully delivered
notifications. Failed alert/recovery delivery retries on the next monitoring
pass; startup silence preserves pending changes. A shared file lock prevents
overlapping manual/scheduled checks from sending duplicate notifications.
The receiver keeps server-health and failed-control alerts even when backup
copy/authentication fails. Invalid active reports cannot suppress notifications
through an unbounded startup grace. Controlled shutdown and private health
reporting verify the host/settings without requiring working payment credentials;
activation still performs the full configuration and approval checks. Control
settings are reread under the control lock. Older QA helper/source files remain
unchanged. Review evidence is in
`outputs/firewood-checkout/permanent-routing-review-20261028/`.

## Historical candidate notes (superseded operational status)

The notes below describe the earlier October 27 installation. Their statements
about absent routing/schedules apply to that preserved namespace, not the current
isolated installation above.

This is the production-capable application candidate, exercised only against
Angel's isolated Stripe sandbox on the existing MacBook. It is separate from the
original local, hosted and native QA implementations. It does not change the
public website, analytics, consent, CRM, shared gateway or DNS.

## Isolation and activation

The staged MacBook directory is
`~/.local/share/ats-firewood-candidate-sandbox-20261027/`. Its dedicated native
PostgreSQL cluster listens on loopback port 56388. The application database is
`firewood_candidate_sandbox`; native tests use `firewood_candidate_test`, and
restoration uses a quarantined `firewood_candidate_restore` database. Original
Firewood QA clusters, records, configuration and installed source are preserved.

All sandbox runs require a dedicated restricted test key, the exact claimed
sandbox account, HTTPS canonical origin, separate webhook secret and matching
database identity. No live release file, key, webhook or production database was
created. Both sending and CRM are disabled. Live configuration is refused without
a private release file satisfying every independent gate; that file is not an
instruction to create it or activate anything.

Native startup verifies the existing MacBook identity. The owner explicitly
approved battery operation for these checks while charge is **above 10%**.
Startup/worker checks enforce that threshold; the web process checks every 15
seconds and shuts down at or below it. The older QA startup policy is unchanged.

## Order and payment boundary

- Server prices remain $300/$450/$840 delivered, plus $150 stacking once per
  delivery. The six totals are $300, $450, $450, $600, $840 and $990. Delivery is
  free. No ZIP-area/distance eligibility gate or veterans checkbox is added.
- Customer acknowledgement, contact, price and versioned policy are frozen in
  PostgreSQL before Checkout opens. A database trigger prevents rewriting those
  snapshots or rebinding a payment to another order.
- Customer sessions use hashed random identifiers and Secure, HttpOnly,
  SameSite=Lax **__Host-** cookies. The dedicated checkout hostname and Path=/
  prevent parent-domain cookie shadowing. No customer details enter browser
  storage or query strings. An office quote URL contains only a short-lived
  random authorization token, bound to email, quantity and stacking.
- Session leases, fenced updates and persistent Stripe idempotency keys handle
  double clicks and unknown create outcomes. Unknown creations are not retried
  after the 23-hour safety window. Active or processing payments cannot be
  replaced without verification/expiry.
- Signed event identifiers are committed to a durable inbox before HTTP 200.
  Workers verify current Stripe state against the frozen order before recording
  payment and two unique confirmation jobs. The return page only displays state
  and requests reconciliation; it cannot fulfil an order.
- Paid, delayed, expired/failed, refund and dispute events reconcile into the
  same order. Current provider state handles out-of-order lifecycle events.
  Permission failures and identity conflicts surface for private owner review.

## Private owner operations

`owner.mjs` sends a pinned mutual-TLS request using a separate owner certificate.
It supports `status`, `details`, `pause`, `quote`, `schedule`, `cancel` and
`delivered`. JSON input comes from a protected file; customer details and quote
tokens must not be pasted into shared logs. Actions are audited; order changes
require the current version to reject stale edits. Owner endpoints are blocked
at the customer relay and require the owner certificate at the backend.

Scheduling records an absolute start/end window; the displayed policy uses
America/New_York and the 48-hour cutoff is measured from window start. Full
refunds also apply before scheduling, if Angel cancels/cannot fulfil, or if the
customer declines an Angel-initiated reschedule. Late customer cancellations
remain non-refundable. Refund jobs freeze amount/reason and use the same
idempotency identity on retries; uncertain old creations require review. A known
refund identifier is polled across restarts without creating another refund,
including after the creation-retry window. Only succeeded refunds count toward
the confirmed total. Pending refunds remain queued; failed, canceled or
action-required refunds surface for owner and customer review. Signed
`refund.created`, `refund.updated` and `refund.failed` events are required in
addition to `charge.refunded`. A later failure keeps the monetary audit history
and visibly requires review; it never automatically charges the customer again.
Mutable refund/dispute reads and updates are serialized by the order lock;
new refund events fence older worker completions.

The office quote operation records an explicit owner-approved price before
payment, requires residential and single-discount confirmation, and binds that
price to the customer and order selection. It does not automatically interpret
or combine the veterans benefit with quantity savings. The approved five-percent
benefit remains an office decision under the existing terms.

## Transport and operations

The new backend requires verified, pinned mutual TLS from distinct relay/owner
peers. The sandbox relay uses a fresh authenticated handshake on every request;
its TLS certificate is verified by the temporary QA tunnel. Repeated warm
requests are covered. The tested hop is inside this isolated MacBook setup.
Connecting the existing guest Caddy gateway to this native listener is still a
separate routing/private-peer release task. No shared gateway was reloaded.

The foreground QA process drives bounded retry passes. No launchd jobs or
automatic startup schedules are installed/activated for this candidate.
`worker.status()` exposes private queue counts, review flags and stale heartbeat
alerts without customer information. Before live use, startup, monitoring,
off-device backup cadence and recovery must target the production namespace.
Active runs count as a fresh heartbeat. Live mode with sending held leaves its
outbox pending, reports the hold and refuses new payments.

The confirmation outbox captures messages in sandbox. The live-only Resend
adapter freezes the verified Angel sender, reply address, payload and idempotency
key. Sending requires separate release approval and a private credential file;
no real email is sent by these tests. An uncertain message older than the
deduplication window is quarantined rather than blindly resent.

`seal.mjs` provides AES-256-GCM backup authentication/encryption. The controlled
drill used a consistent native PostgreSQL dump, an off-server sealed copy, a
separately held key and a quarantined restore. It does not activate unattended
backups. Never resume provider/email work automatically from an older restore.

## Verification and remaining launch work

Run `npm run test:firewood:candidate` from the repository. Native exported tests
use the dedicated `FIREWOOD_CANDIDATE_NATIVE_TEST_URL` and isolated per-test
schemas; they never connect to the original QA or CRM database. `prepare.mjs`
creates a new, allowlisted export outside the repository and refuses overwrite.
Dependencies remain pinned to the existing lockfile; no new package was added.

Evidence is in the Website workspace at
`outputs/firewood-checkout/production-candidate/REPORT.md`; the subsequent
regression review is `outputs/firewood-checkout/production-candidate-review/REVIEW.md`.
Live readiness still
requires reviewed permanent routing/certificates/private peer, a fresh production
database and operational targets, verified live-key permissions, customer email
delivery, current tax applicability, a separately agreed CRM production contract
and final activation approval. The completed full-MacBook reboot drill is not
being repeated. No commit, push, live payment or production release is authorised.
