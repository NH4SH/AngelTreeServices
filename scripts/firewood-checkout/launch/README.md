# Firewood invoice-before-payment candidate

This opt-in flow is restricted to the isolated Angel Stripe sandbox and explicit
native or staging QA identities. The installed checkout and frozen paid-only v1 contract
do not import these modules. This folder cannot activate live ordering.

The Website saves an accepted household order and queues a signed v2 prepare
request before payment. CRM creates one unpaid invoice and owns payment-method
selection, card verification, surcharge reporting, settlement and payment
receipts. Website owns the delivery details and order confirmation. No payment
collector or Stripe credential is copied into the Website runtime.

Accepted quantity, price, contact details, household terms and payment policy are
immutable. An expired access link renews the same invoice; it does not cancel
the debt or create another collectible invoice. Changes require office review.
Unknown payment results, bank verification, refunds and disputes cannot be
treated as a paid order or silently replaced by a new payment.

Preparation retries have durable leases and bounded backoff. Observations use
monotonic CRM revisions, preserve original paid evidence and append history.
Test order confirmations are captured once in the isolated database; this
runtime contains no sending path. Customer order access uses an HttpOnly
session cookie, with exact-origin checks, CSRF protection and bounded requests.

The default `handoffClient` remains native/loopback-only. The separate
`handoffStagingClient` requires every reviewed site/project/environment/account
pin in `staging-profile.mjs` and a staging-specific key identity. Its database
namespace must be fresh; it cannot repoint or retrofit the native namespace.
The staging HMAC secret must encode 32 bytes as canonical base64url or lowercase
hex. Its exact text is signed without reencoding; native credentials remain
lowercase hex only.
The native runtime wrapper still rejects hosted origins and unrelated databases.
No staging runtime, public Website route or production mode is activated here.

Staging's existing visitor gate remains in front of every API and webhook path.
For an authorized server-to-server QA request, pass its short-lived gate cookie
only through the backend transport; never put its password, cookie or HMAC
credential in the Website frontend. The transport sends it solely to the three
exact handoff API paths on the pinned HTTPS origin, forbids redirects and holds
expired access for review. The perimeter still verifies the cookie and the API
still verifies HMAC. Do not add a gate bypass or invent a Website return URL.

An unpaid prepared order saved while the collector is held offers an explicit
“Check payment options” action. It renews that same invoice before checking
collection readiness again. Status reads never rotate access; processing, paid,
refunded or review-held orders cannot restart payment. Identity-review failures
show an office-review message without exposing customer-matching details.

Run `npm run test:firewood:handoff` at the repository root. Native QA uses the
reviewed private configuration file with `native.mjs` and an explicit role:
`install`, `web`, `worker`, `status` or `open-test`. Installation starts paused.
The wrapper verifies the database role, schema, loopback port and pinned HMAC
identity; it refuses live mode and email sending. Its foreground worker stops
at the existing owner-approved battery threshold. No schedule is installed.

Before any production implementation, review genuine provider payment,
refund/dispute and bank-settlement evidence; office-price handoff; operational
delivery/cancellation controls; confirmation ownership; restricted production
permissions; separate production storage and recovery; and permanent HTTPS
routing. The sandbox-only parser, keys, records and endpoints must not be
reused as a production release. Preserve the existing estimate form and draft
recovery, public SEO, analytics/consent settings and unrelated CRM work.
