# Firewood production configuration and launch review

## Current implementation follow-up — October 29, 2026

The separate Website and CRM live profiles are now implemented as **inactive local candidates**. Website passed 16 new profile checks and 31 retained handoff checks; the 19-page public build/validation also passed. CRM reports 685 focused checks and isolated builds. The actual Website client and actual CRM handler passed an in-process same-invoice exchange. Customer wording, price snapshots, signing domain and source/environment code identities are assigned in matching canonical modules. Actual database/release/key/recovery bindings remain null, runtime loaders remain unavailable and all activation flags remain false.

See [the current implementation review](FIREWOOD_LIVE_PROFILE_IMPLEMENTATION_REVIEW.md) for the scoped results and remaining guarded installation, office workflow, provider/sender and recovery work. The CRM chat has started the office workflows separately; this report does not certify their later edits. No credentials, production changes, commit, push or deployment occurred. The proposal below and its frozen review JSON record the earlier planning snapshot: their statement that logical code identities were unassigned is historical. They must not be used as an executable configuration or new recovery certificate.

## Earlier launch proposal — retained for review history

Prepared October 29, 2026 for Noel Sierra and Angel Tree Services. **Review only; ordering, live payments and customer sending remain off.** The configuration records confirmed prices and operating rules. It is deliberately not a runtime configuration: production contract, database, credential and release bindings remain unassigned until their implementation and verification are approved.

## Release status

The genuine payment, refund, dispute, bank-failure, CRM handoff and paired recovery tests pass. The Website has 31 passing handoff tests and completed mobile recovery checks. Hosted staging passes its protected preparation flow with collection disabled.

The final CRM release fix is frozen and verified: **15 checks passed and nine actual rolled-back database-structure/permission changes were rejected**. Website independently matched the six frozen operations-file hashes to that proof. The final inactive archive is sealed; Website independently verified its hash, manifest and all 1,222 archived files. This fix protects a future installer; the existing contract still accepts only test/staging orders. Its production profile and live terms remain a separate implementation/review step.

## Customer prices and terms

| Quantity | Delivered | Delivered and stacked | Eligible credit fee without stacking | Eligible credit total without stacking |
| --- | ---: | ---: | ---: | ---: |
| Half cord | $300.00 | $450.00 | $9.00 | $309.00 |
| Full cord | $450.00 | $600.00 | $13.50 | $463.50 |
| Two cords | $840.00 | $990.00 | $25.20 | $865.20 |

Delivery is free. Optional stacking is $150 once per delivery, with wheelbarrow access and a reasonable carry from the truck. With stacking, eligible credit totals are **$463.50, $618.00 and $1,019.70**, respectively. Debit, prepaid, bank and offline choices have no surcharge. A verified eligible US credit card receives the exact 3% fee review before authorization; the fee stays separate from the order principal and uses Stripe's dedicated surcharge field. This is the customer surcharge, not a change to Stripe's processing prices. Live-account support and final eligibility rules remain a launch check.

The 25% full-cord and 30% two-cord savings compare the wood price with the same volume at the delivered half-cord rate, before stacking. Online ordering offers only half, full or two cords.

Online orders are for qualifying personal household use. Business purchases go through the office. The intended household tax rate is 0%, with the accepted use/address retained under the reviewed policy. Delivery coverage is Fredericksburg, Spotsylvania, Stafford, Caroline and King George; the owner declined an extra delivery-eligibility gate.

Angel contacts the customer with a delivery date within one week; this is not a promise to complete delivery within that week. Cancellation at least 48 hours before the agreed delivery window starts receives a full refund; later customer cancellation is non-refundable. Before scheduling, if Angel cancels/cannot fulfill, or if the customer declines an Angel-initiated reschedule, the confirmed outcome is a full refund. Refunds require the existing office workflow rather than an automatic timer.

Veterans notify the office **before purchase** for a residential, office-approved price on wood plus stacking before taxes/other fees. One discount applies. There is no checkout checkbox, ID upload or automatic discount combination.

## Production configuration

Use the existing MacBook, private connection and HTTPS route at **https://checkout.angeltreeservices.org/firewood/checkout/**. The public information page remains **https://angeltreeservices.org/firewood/**, with its SEO preserved. Checkout stays out of the sitemap and is marked noindex. No new subscription, router rule or DNS change is planned.

CRM at **https://admin.angeltreeservices.org** remains the only payment collector and payment-receipt authority. Website saves an immutable accepted order, prepares one CRM invoice, receives signed ledger status and owns the order/delivery confirmation. Reloads, bank processing, saved preferences and a successful return page cannot mark an order paid. Expired links renew that invoice. Unknown money, refunds and disputes hold fulfillment and repayment.

The intended existing live merchant is **acct_1Tv92EI7tY6VHUvU**. The separate test account, test keys, synthetic rows, capability links and test terms must never be used for live orders. Live contract/source/environment identifiers, HMAC identity and document terms are **unassigned**. The Website will hold no Stripe secret key or payment webhook; the CRM owner verifies the actual existing shared live receiver and minimum necessary provider permissions. Prepared legacy keys remain unloaded.

Prepare fresh isolated v2 Website storage without dropping, repointing or importing the older checkout. Freeze accepted details, terms and pricing; preserve one invoice, original paid proof and singular confirmations across retries and recovery. Customer access requires secure host-only HttpOnly sessions, exact-origin/CSRF protection and bounded requests. Private keys stay outside code, frontend assets, logs and review documents.

Website's paid-order confirmation and owner notice go through a durable idempotent outbox using **orders@firewood.angeltreeservice.org**, with replies/owner notifications to **info@angeltreeservice.org**. CRM retains its distinct payment receipt. Existing account-wide Stripe receipt settings remain unchanged. An email failure cannot erase or reapply money. Test outboxes must never be replayed to real recipients.

## Controlled launch sequence

| Stage | Work and required evidence | Stop before |
| --- | --- | --- |
| 1. Finish implementation review | Use the frozen passing CRM release packet. Implement/review the separate live Website and CRM profiles, production terms, office-approved price handoff, delivery/cancellation controls, fee eligibility and singular messages. Keep the test guards strict. | Loading live credentials or changing production |
| 2. Bind the actual release | Re-read current Git/production versions. Preserve newer changes. Compare the focused current 102-base CRM backport and its three reviewed SQL units; do not deploy unrelated 129-baseline work. Assign exact actual identities and scope after review. | A migration or maintenance window |
| 3. Prepare disabled production | During a separately approved window, hold the appropriate writers/workers, install the reviewed disabled migration/app/profile and fresh v2 storage. Preserve all existing payments, invoices, tokens and delivery history. | New write admission or collection |
| 4. Certify recovery and custody | Capture the actual new schema, ledger, permissions, app/code and system identities. Restore the new topology, including Website accepted/pending orders, CRM invoice/payment/receipt history, capabilities and required files. Authenticate off-device copies; verify live key custody separately. Enroll a fresh source only after old permits expire. | A writer without a fresh certificate |
| 5. Verify private production readiness | Verify least-privilege live permissions, dedicated surcharge support, exact authenticated HTTPS routing, shared live webhook/event ownership, closed gates and fixed-recipient owner delivery. Keep customers and collection off. Use read-only provider checks; any real payment requires separate explicit authorization. | Enabling money or customer sending |
| 6. Controlled activation | After approval, start only the assigned v2 services/monitors, admit the single verified writer, enable the reviewed collector/sender and open owner-managed availability. Verify all method disclosures and final totals without submitting a lead/payment. | Public promotion until the checkout is healthy |
| 7. Public publication and observation | Publish only the reviewed public Firewood checkout link, preserving photos, SEO, estimates/drafts and analytics/consent. Reconcile newer repository changes and shared Netlify build behavior so CRM cannot deploy accidentally. Monitor the first genuine orders, bank events and notifications. | Unmonitored or duplicate fulfillment |

The intended joint recovery freshness limit is **five minutes**. The old Website hourly backup is not proof of this limit. The actual v2 backup/admission schedule and measured off-device freshness must be reviewed and demonstrated; an isolated one-time restore does not certify continuous production RPO or live key custody. Keep the existing backup-incident repairs and single-writer guard intact.

## Pause and recovery

If preparation, money, recovery freshness or ownership becomes uncertain, pause **new orders and new collection**. Preserve accepted orders, invoice mappings, attempts, webhook events, tokens and original paid evidence. Keep the verified receiver/status/reconciliation path available when permitted by the write guard so in-flight bank/refund events can finish. Never bypass backup fencing, restore an old writable database over accepted live orders, switch back to the v1 collector, delete history, automatically replace invoices/charges or issue automatic refunds.

Before any accepted production order, route rollback can return to maintenance. After an order exists, use a reviewed forward recovery or compatible application rollback that retains its data and event processing. Pause/restart must not release the same confirmation twice. The owner remains responsible for inventory pause, delivery scheduling and office review; no human 24/7 coverage is promised.

## Review decision

This package authorizes no production change. The next approval should cover the concrete live-profile implementation and its review, followed by the exact migration/recovery/activation window. No further pricing or scheduling clarification is presently needed. The unresolved items are technical implementation and release evidence, not another test purchase.

Configuration: [review settings](/Users/noelsierra/Documents/Codex/2026-10-16/files-pasted-by-the-user-you/outputs/firewood-checkout/production-launch-review-20261029/FIREWOOD_PRODUCTION_CONFIGURATION.review.json). [Validation and source-preservation results](/Users/noelsierra/Documents/Codex/2026-10-16/files-pasted-by-the-user-you/outputs/firewood-checkout/production-launch-review-20261029/CHECKS.json) accompany it. The older `settings.review.json` and prepared v1 release are historical inputs, not a v2 launch configuration.

The sealed inactive CRM archive is pinned by SHA256 `a7a6a9f933af08d8842d45c57b75803fe8e4c26f4bc5444a68f6e7107fe6d1e2`; its manifest is `285f53b3f48cf374c83bb5593014d2cf752e7a84ed816177d9c000dbaf558399`. The reference postimage is an isolated rehearsal, not the actual future production schema or migration ledger. No future runtime identity, authority or credential has been assigned.

Technical references: [Stripe go live checklist](https://docs.stripe.com/get-started/checklist/go-live), [restricted key security](https://docs.stripe.com/keys-best-practices), [webhook verification](https://docs.stripe.com/webhooks), [card surcharge reporting](https://docs.stripe.com/payments/cards/surcharge).
