# Inactive Firewood office-workflow companion

Prepared October 29, 2026. This is a separate, local Website companion for the CRM's proposed office approval and cancellation workflow. The reviewed `../live/` source, its canonical contract/profile/terms, test evidence and package commands remain unchanged. No existing order database is repointed or upgraded.

## What it does

- Copies the exact CRM `office-contract.mjs` and resolves its canonical dependency through the frozen live contract. The new domain is `ATS-FIREWOOD-OFFICE-LIVE-V1`, contract `firewood-office-live-v1`, with separate price-request, price-status and order-status paths.
- Saves an immutable, server-numbered draft before sending a signed office request. Quantity, stacking and normalized customer details form its hash; changing them creates a new request rather than reusing an approval. A draft is not an accepted order or a price approval.
- Requires a fresh CRM-issued approval with exact draft binding, current revision and valid expiry. The customer accepts the exact price-review hash and full current terms. Browser-supplied prices, approval IDs, invoice IDs and unconfirmed terms are rejected. Only the CRM's authenticated office commands can authorize the price.
- Freezes the selected approval, accepted customer details, quantity, prices, terms and request. Durable leases/backoff and exact replays preserve one order/invoice, including lost replies and restart. A consumed approval expiring later must not force a new invoice; the counterpart's exact idempotent preparation replay remains authoritative.
- Requires fresh combined financial and lifecycle status. `cancellation_requested` and `cancelled` hold payment links and fulfillment while preserving original paid proof. Missing/stale lifecycle, a terminal regression, conflicting revisions or unavailable verification fail closed. Cached paid evidence is historical information and cannot authorize delivery or messages.
- Rechecks lifecycle after explicit same-invoice renewal. The CRM's atomic collector remains responsible for cancellation racing after the final Website check. No automatic renewal occurs just to render a page.

## Isolation and limits

`client.mjs` exports a closed default client and an explicit branded in-process fixture client. It opens no socket and loads no environment or credentials. The fixture accepts `.invalid` contacts only. `runtime.mjs` always returns 503/no-store/noindex, regardless of environment flags.

`orders.mjs` requires a factory-owned disposable database and isolated branded clients. It uses a separate `fwoffice_*` namespace, immutable accepted requests/history and monotonic observations. It does not read, migrate, dispatch or change `fwlive_*` confirmations. It creates **no** confirmation/outbox, sends no message, creates no refund and calls no payment provider. Do not combine it with the old financial-only worker: that worker does not carry cancellation lifecycle. A future guarded installation must supply the real session/CSRF/HTTPS service boundary and coordinate the existing singular confirmation outbox with fresh office holds.

The wrapper exposes internal session/cookie and CSRF methods for isolated contract testing, not an installed public API or office UI. Its session handling is not a replacement for reviewed production secure cookie/routing controls. No public entry point, asset, menu, estimate, analytics or consent behavior is changed by these files.

`cancelled` is an order-workflow state, not proof that a payment was refunded or invoice debt was closed. Pending bank events, refunds, fees and invoice accounting remain governed by the CRM's financial ledger and deliberate office actions. Unresolved cancellation accounting remains a release hold.

## APIs and testing

`installOfficeOrderStore(db, live, office)` installs only the owned local review database. `officeOrders({db,live,office,now})` returns `session`, `requestPrice`, `reviewPrice`, `acceptPrice`, `start`, `state`, `resume` and `work`. New orders and office requests start paused. `session(null,true)` yields a local fixture cookie and CSRF token; other methods take the cookie, not a browser-supplied order/invoice ID.

`reviewPrice` returns the current customer-facing prices and `quoteReviewHash`, not authority to issue a discount. `acceptPrice` takes only CSRF, that hash, the two displayed policy hashes and explicit acceptance/household booleans. Standard-price `start` still uses the unchanged six server prices and also uses the combined office lifecycle for status.

Run from the repository root:

```sh
node --test scripts/firewood-checkout/office/test-office.mjs scripts/firewood-checkout/live/test-live.mjs
```

The tests use controlled isolated fixtures. A separately saved helper exercises the actual Website client/wrapper and actual CRM handlers with an explicit CRM operation double; that does not certify native SQL, real concurrency, provider behavior or an installed runtime. There are no UI changes in this companion and no new visual/QA upload is required for its code-only checks.

## Still before launch

Complete the CRM office UI/actions and cancellation accounting review; jointly test the final SQL and handler protocol; rehearse exact native installation/permissions/concurrency; connect the guarded runtime and genuine provider/sender; certify fresh paired recovery/key custody; then review the concrete activation package. No production credential, migration, service, schedule, commit, push or deployment is authorized by importing this companion.
