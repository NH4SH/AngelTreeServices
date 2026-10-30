# MacBook public HTTPS sandbox

Supervised, temporary QA only. No live keys, customer data, sender, CRM integration,
startup schedules, paid subscription, DNS, router or production publication.

The existing private HTTP adapter is unchanged. This separate entry point binds
real TLS only on 127.0.0.1:56383. A temporary Cloudflare Quick Tunnel connects to
that TLS origin with certificate verification, a pinned origin server name and
an explicit CA certificate. Never use `--no-tls-verify`. Tunnel metrics bind to
loopback. Do not forward the database, private HTTP adapter or any other service.

Pin the assigned HTTPS `trycloudflare.com` origin in private configuration and
the new database marker before starting the web process. The temporary hostname
is for testing and has no uptime guarantee. It must not be used for live orders.
Both the Stripe-return origin and browser POST origin must match that exact pin.
TLS/Secure/HttpOnly/SameSite cookies, owner access, CSRF, no-store/noindex and raw
Stripe signature verification remain required. Webhooks require a valid sandbox
signature and are the sole unauthenticated write route.

The separate database `firewood_public_qa` uses the existing dedicated Firewood
PostgreSQL cluster's loopback port 56382. Only its own migrator and restricted
worker roles can connect. The original native database and its retained orders
are preserved. Immutable reviewed migrations are applied explicitly, with hashes
and runtime/origin/account markers. The eight-attempt ceiling remains.

Export using this directory's `prepare.mjs` into a new local folder. Private
environment, TLS key/certificate, endpoint signing secret and provider keys stay
outside the repository/export, owner-only. Verify the approved Mac hardware pin
and Stripe sandbox `acct_1UU9U8RAZXGe6tX0` before payment creation. Use only
synthetic `.invalid` contacts and Stripe's documented test card.

Run worker batches explicitly. Genuine HTTPS webhook receipt must persist before
HTTP 200. Close the payment browser before running the worker to prove browser-
independent confirmation. Exercise duplicate provider redelivery, temporary
database failure, restart and worker retry; do not substitute locally re-signed
events for provider delivery evidence. No confirmation email is sent here.

At QA completion disable/remove only the newly created Stripe test endpoint,
stop the owned tunnel and HTTPS web process, then stop the Firewood test database
if it was started by this check. Preserve test evidence and rows, and verify old
orders/configuration and shared services are unchanged. Leave schedules inactive.
