# Firewood office companion — separate inactive implementation

Prepared October 29, 2026. The Website's separate office-price and cancellation-lifecycle companion is implemented and locally tested. It leaves every file in the earlier production-profile review unchanged. **Keep public ordering, collection, sending and actual runtime installation off.**

## Results

- **34/34 current checks passed:** 18 new office-companion checks and the 16 unchanged live-profile checks. The earlier 31 retained handoff checks remain preserved in their dated evidence; they were not rerun for this code-only companion.
- The actual Website client and order wrapper passed a controlled exchange with the actual CRM live and office handlers: pending request, genuine fixture-authorized 5% price, exact customer acceptance, same-invoice replay, paid proof and cancellation holds. One $570 approved invoice, 27 operations, zero network/provider/email calls. This uses an explicit CRM operation double, not native CRM SQL or a genuine payment.
- The 19-page public build and validation pass. The companion is excluded from public shipping output and adds no browser entry point or visual changes.
- All 22 files in the earlier Website source manifest remain byte-identical. The new office contract matches the CRM's current bytes; the three frozen canonical live modules and package commands remain unchanged. HEAD is still `7386a9d694fbf39df8cfa196014d1391871047cd`.

## Behavior and boundaries

The companion persists an exact signed draft before contacting the office. The CRM's authenticated office controls alone can issue approval. Customer acceptance requires a fresh matching approval, an exact displayed-price hash, the two current terms hashes and explicit household/terms acknowledgement. Customer input cannot provide prices, invoice identity or discount authority. Lost replies and restarts preserve one immutable accepted order and invoice. An already-consumed approval expiring later must not create replacement debt; the local recovery regression pins same-invoice held replay.

Every accepted order uses the combined financial/lifecycle status. Cached paid evidence, missing status, stale revisions, a cancellation hold or terminal-state regression cannot authorize a payment link or fulfillment. Explicit renewal is checked before and after the same invoice is renewed. Original paid proof survives holds and refunds. Cancellation is never inferred from a refund or preference, and a `cancelled` workflow state is not claimed as a payment refund or closed invoice balance.

The companion's default runtime returns 503. Only a branded in-process client, synthetic contacts and a factory-owned disposable local database can execute its wrapper. The separate `fwoffice_*` store creates no outbox, confirmation, refund or provider call. It cannot dispatch the earlier `fwlive_*` messages. Actual guarded installation must coordinate singular confirmations with fresh lifecycle holds; the old financial-only worker must not be used as a downgrade.

## Remaining before launch

1. Complete/review CRM office UI/actions and cancellation accounting. Historical refunded money with an outstanding balance must remain in cancellation/billing review until the original accounting rules permit closure. No automatic void/refund is introduced here.
2. Jointly verify the final SQL/handler changes and rehearse exact native installation/permissions/concurrency. The Website-controlled handler test is not that proof.
3. Connect the actual customer-facing office request/price-review route and browser controls, guarded HTTPS/session/database/runtime bindings and source-aware confirmation outbox. These internal companion methods are not yet a public customer flow.
4. Verify genuine live provider/shared-receiver/sender bindings, surcharge support, key custody and fresh paired recovery before admission. Obtain review of the concrete installation/activation package.

No commit, push, deployment, migration, live key loading, real payment, subscription or outgoing email occurred. Public content, SEO, photos, estimates/drafts, analytics and consent are unchanged.

Implementation: `scripts/firewood-checkout/office/README.md`. Dated complete diff, test logs, joint proof and preservation manifest: `/Users/noelsierra/Documents/Codex/2026-10-16/files-pasted-by-the-user-you/outputs/firewood-checkout/office-workflow-companion-20261029/REPORT.md`.
