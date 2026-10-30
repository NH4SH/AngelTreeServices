# Firewood customer flow — inactive local candidate

## Current office-v2 integration — October 30, 2026

The reviewed CRM candidate's financial issuance and cancellation-credit fixes are ready locally. This customer layer now deliberately imports the separate `office-v2/` connection and requires its versioned customer response. Original `office/` v1, `live/` financial contract/store and prior evidence remain frozen. The earlier recovery fixes remain: edited details survive failed resends, interrupted requests give recovery guidance, unknown failures make no persistence claim and stale replies cannot overwrite newer state.

**108 checkout regression checks pass**, as do 239 public Node checks, nine public style checks and the 19-page build/validation. Fresh actual-CRM-handler/SQL tests cover all six prices, genuine office approval, exact acceptance, truthful issuance through full refund, authenticated idempotent credit, separate final cancellation, clean unpaid void, retained payment history, wrapper recovery and lost preparation acknowledgements. Desktop/320px/200% text browser checks show refunds and cancellation credits separately with no repayment action.

**Launch remains blocked by actual installation and admission.** The production handler remains 503 with no bindings or activation loader. No real provider/sender, keys, production database, migration, schedules or HTTPS routing changed. This local PGlite proof uses synthetic financial observations and disclosed test authority; it does not certify installed production, native permissions or genuine Stripe settlement.

Current decision: `FIREWOOD_CUSTOMER_RELEASE_REVIEW.md`. Full dated proof: Website workspace `outputs/firewood-checkout/office-v2-connection-20261030/REPORT.md`. Earlier office-v1 reports remain historical evidence only.

## Customer experience

The existing Poppins/green/cream checkout retains quantities, free delivery, optional stacking, household confirmation, full accepted terms and payment-method/credit-fee disclosures. Standard orders use server prices. An optional disclosure lets customers send their quantity and delivery details for office review without placing an order or issuing themselves a discount. There is no veterans checkbox, automatic discount or extra delivery eligibility gate.

The customer can wait/check, edit and send a new bound request, or explicitly use standard pricing. Pending/unknown/revoked approval cannot be accepted. A current approval shows its exact wood/stacking amounts throughout the form, expiry and reference. Acceptance acknowledges the exact displayed quote and terms; changed approvals require another review. Customer details remain locked to that request until explicitly edited and are preserved through errors and reloads of the saved request.

The saved-order view uses only current combined financial/lifecycle evidence for payment actions. Pending bank/refund, partial/returned money, cancellation, uncertain status and office review do not offer duplicate payment. It never equates cancellation with a refund or closed debt. The mandatory accounting receipt separately supplies the actual full-principal credit and collectible amount. The saved view labels Cancellation credit and Amount owed, with an explanation that a credit closes debt while any refund is shown separately. It does not expose credit IDs or issuance metadata to the browser. An explicit payment check renews the same invoice through the reviewed wrapper; it cannot change payment authority. The browser validates the CRM origin/path before navigating to a returned capability. CRM remains the sole collector and receipt authority.

## Code and routes

- `assets.mjs`, `browser.js`, `customer.css`: separate inherited assets, native controls, errors/pending/retry states, consistent approved prices, 320px/200% text wrapping and protection against stale asynchronous responses. No analytics or consent script is added.
- `service.mjs`: branded isolated adapter over `officeOrders`, owned-session lookup, bounded status-read rate, minimal customer DTOs and fresh lifecycle decisions. It does not serialize source/account bindings, signing material, approval IDs, invoice IDs or payment IDs to the browser. Customer contact/amounts are returned only to the owning session.
- `server.mjs`: loopback-only QA host. GET `api/state`; JSON POST `api/start`, `api/office-request`, `api/office-accept`, `api/resume`. Exact Host/Origin, CSRF in the underlying wrapper, bounded bodies/deadline, unknown-action rejection, HttpOnly path-limited SameSite cookie, no-store/noindex/CSP and no fixture-control endpoint. It cannot bind permanent HTTPS or an arbitrary unbranded service.
- `runtime.mjs`: the default production handler remains 503. There is no environment/key loader or flag-only activation path.

The QA cookie is intentionally local HTTP-only and is **not** the production secure-cookie implementation. The actual guarded MacBook HTTPS/runtime/session installation remains a release gate. Do not mount this loopback server behind the permanent route or substitute the old financial-only worker.

## Tests

```sh
node --test scripts/firewood-checkout/customer/test-customer.mjs scripts/firewood-checkout/customer/test-browser.mjs scripts/firewood-checkout/office-v2/test-office.mjs scripts/firewood-checkout/office/test-office.mjs scripts/firewood-checkout/live/test-live.mjs scripts/firewood-checkout/launch/test-handoff.mjs scripts/firewood-checkout/launch/test-staging.mjs
npm run test:public
```

The OUT-only joint factory exercises browser/Website HTTP/service → actual CRM handlers/fixed RPC adapters → reviewed accounting SQL and authenticated office commands in newly owned private PGlite fixtures. Only the fixture validator permits exactly `checkout.invalid`; `other.invalid` still fails the live-contact check. Canonical CRM files and its stopped native rehearsal are untouched. SQL payment/refund rows are controlled fixtures; no genuine Stripe or email event is claimed.

The two-cord prices remain $840 delivered and $990 stacked. All other prices, free delivery, payment options, card-fee disclosures, terms, estimates, drafts, SEO, photos, analytics and consent are unchanged.

## Release holds

The CRM's separate native candidate now verifies truthful issuance/receivables and an audited cancellation-credit closure; the Website's new v2 joint tests verify compatibility with that reviewed source. These resolve the previous local accounting/contract blockers. They do not install or approve the candidate on existing records.

Actual runtime/session/HTTPS bindings, source-aware singular confirmation outbox/sender, live provider/shared receiver, key custody and paired recovery/admission remain uninstalled. This customer layer creates no confirmation/outbox, sends no email and initiates no refund. Installation and activation require the concrete reviewed package; importing these assets is not permission to launch.

Evidence, screenshots, source hashes and full incremental diff: `outputs/firewood-checkout/office-v2-connection-20261030/REPORT.md` in the Website workspace.
