# Isolated Firewood Render QA runtime

Implemented locally; not hosted or approved for live payments. No resource,
repository, credential or Stripe webhook is created by these scripts. The
regular public build does not include checkout or these routes.

## Runtime

- `main.mjs web`: strict environment/account/database checks, HTTPS-proxy HTTP
  server and private owner gate. No local simulator or storage/admin RPC.
- `main.mjs worker`: one bounded scheduled batch; durable webhook inbox,
  independent pending-payment reconciliation, controlled email and heartbeat.
- `main.mjs status`: redacted status and nonzero exit when stale, overdue or in
  review. It does not send an alert; external monitoring remains a hosted QA gate.
- `migrate.mjs --apply-isolated-qa`: explicit migration command for a dedicated
  database, using the separate `firewood_migrator` role. Web/worker never migrate.
- `prepare.mjs <new-directory-outside-repo>`: allowlisted local source export and
  manifest. Does not commit, push, deploy, initialize a provider or run npm install.

The original `../server.mjs` loopback preview and previous Netlify/MacBook guards
are preserved. Tests inject fake Stripe/mail services into temporary SQL storage;
there is no environment switch bypassing hosted identity checks.

## Required future configuration

Configure secrets privately only after hosted QA has been separately approved.
No working credential values belong in this document or source control.

| Variable | Requirement |
| --- | --- |
| `FIREWOOD_RENDER_QA_ENABLED` | Explicit `1` |
| `RENDER_SERVICE_ID` | Actual provider service ID; exact match for that process |
| `FIREWOOD_QA_WEB_SERVICE_ID` | Dedicated `srv-…` web ID |
| `FIREWOOD_QA_WORKER_SERVICE_ID` | Different dedicated worker/cron ID |
| `FIREWOOD_QA_ORIGIN` | Exact HTTPS `angel-firewood-qa…onrender.com` origin; no trailing slash |
| `FIREWOOD_STRIPE_TEST_ACCOUNT_ID` | `acct_1UU9U8RAZXGe6tX0` only |
| `FIREWOOD_STRIPE_TEST_SECRET_KEY` | Claimed sandbox restricted test key preferred; no live/shared fallback |
| `FIREWOOD_HOSTED_TEST_WEBHOOK_SECRET` | New QA endpoint's signing secret |
| `FIREWOOD_QA_ACCESS_TOKEN` | New private random 64-hex owner access code |
| `FIREWOOD_TEST_DATABASE_HOST` | Exact approved Render Postgres external host |
| `FIREWOOD_TEST_DATABASE_URL` | Dedicated `/firewood_test`, role `firewood_worker`, ≥32-character password, verified TLS |
| `FIREWOOD_CRM_TEST_ENABLED` | Absent or `0`; enabled CRM configuration is refused |
| `FIREWOOD_TEST_EMAIL_ENABLED` | Absent/`0` by default; enable only for a separately approved batch |
| `FIREWOOD_TEST_RESEND_KEY` | Existing approved sending-only key, only if email batch authorized |
| `PORT` | Render web port; default `10000` |

Certificate validation is mandatory and channel binding is enabled. There is deliberately
no insecure/private-network TLS exception. Provider hostname/certificate/role
compatibility must be checked on the actual account before deployment. If the
internal hostname cannot satisfy verification, use the approved external TLS
endpoint with suitable network restrictions; do not disable certificate checks.
Configure database role ownership so `firewood_migrator` can create/migrate the
isolated schema and grant application access. The app cannot modify environment
identity, migration history or CRM rows. Hosted PostgreSQL restore and grants
must be verified in QA before live use.

## Checkout and recovery behavior

The browser gate lasts four hours; the order cookie lasts thirty minutes. Both
are Secure, HttpOnly and SameSite=Lax. CSRF/origin checks protect mutations;
canonical origin and host checks reject forwarded-host poisoning. Access codes
are submitted in a POST body and are never placed in a URL. Global durable login,
session and webhook rate limits bound this owner-only QA service.

Only validated synthetic `.invalid` contact email is accepted. Testers must use
made-up names/addresses/phones too. Server pricing preserves free delivery,
$150 stacking, the six approved totals and the documented savings baseline.
There is no veterans checkbox or automatic reduction. A SQL session lease
coordinates payment creation across processes; the attempt commits before
Stripe is called. Retries use the original attempt/idempotency key. Changed
orders close and verify the old unpaid Session before replacement. Uncertain
creation older than 23 hours pauses for review instead of reusing an expired
idempotency key. A known Session ID is verified without needing its old browser
link, including after that window. Restoring a missing link uses GET requests
instead of creating a replacement payment. Session expiry/reset does not delete
payment recovery records.

Eight created payment attempts is a hard batch ceiling, including canceled or
expired attempts. This is intentionally stricter than eight paid orders. A fresh
QA batch/database is an operator decision after review, never an HTTP reset.
The hosted email schema allows sixteen owner-only copies; other existing
workers retain their ten-copy default. Sending remains off unless explicitly
enabled. The existing 23-hour email retry cutoff/frozen payloads remain intact.

The only public payment route is POST `/firewood/checkout/webhook`, outside the
browser access gate. It verifies raw signatures and test identity, then stores
minimal event/attempt/Session identifiers before acknowledging. No raw event or
customer data is logged. Worker verification checks the actual Stripe Session,
stored amount/reference and purpose before one paid order/two message jobs are
committed. Invalid/unrelated events cannot create orders. Unknown matching-app
events are retained for retry/review. A five-minute reconciliation job can
recover a paid order without either a browser return or webhook arrival.

Run the worker every five minutes with manual deployment enabled and automatic
deployments off. No schedule or provider configuration is installed by this
patch. A run stops claiming more work after its two-minute budget; an already
claimed operation can finish its bounded request. Up to sixteen email copies
can drain in that run, still subject to the fixed lifetime budget. Heartbeat/overdue/review status is available through the private operator
CLI; public `/health` only probes database access.
That exact GET route also accepts the provider's internal HTTP probe without
public browser proxy headers; checkout, login and webhook routes still require
the configured HTTPS host. Idle PostgreSQL disconnects are handled without
crashing the service; health checks and query failures still expose an outage.
Real monitoring/notification, public Stripe delivery/redelivery, provider TLS, mobile Safari and managed
Postgres restore are still hosted QA checks, not established by local tests.

After hosted QA, stop order creation/worker/sending and reconcile retained
events before disabling the sandbox endpoint. Live environment, terms, stock,
refund operations, privacy/tax review, backups and live-payment approval remain
separate release gates.
