# Separate Firewood production profile — inactive candidate

Prepared October 29, 2026. This directory implements the separate live wire identity, immutable accepted order, CRM invoice handoff, observations, retries and held confirmation outbox. It is a locally tested implementation candidate. It is not an installed production service.

## Boundaries

- `live-contract.mjs`, `live-profile.mjs` and `live-terms.mjs` are byte-identical to the CRM's reviewed canonical modules. The new source is `website_firewood_invoice_live_v1`, environment `ats_firewood_live_v1`, contract `firewood-invoice-handoff-live-v1`. These code identifiers do not assign a database, signing credential, release certificate or recovery authority.
- `runtime.mjs` always returns 503/no-store/noindex. It cannot load environment variables or credentials, reuse the old v1 release, enable an order or send a message. All activation fields are false and actual release bindings remain null.
- `createIsolatedLiveClient` is an explicit in-process test seam, with fake HMAC material and `.invalid` contacts. It does not perform a network request. WeakMap branding rejects arbitrary/forged clients.
- `createIsolatedLiveDatabase` owns a disposable local test engine. Store installation and verification reject arbitrary database adapters or connection strings. This cannot point the review service at production or the old checkout database.
- `isolated-preview.mjs` is loopback-only test infrastructure. Its local cookie is not a production TLS/session implementation. Foreign Host/Origin, forwarded headers, oversized requests and stale displayed terms are rejected. Do not run it behind the permanent HTTPS route.
- The Website has no Stripe key, collector, webhook, refund creator or email sender. CRM remains the sole payment/receipt authority. No default or environment-only activation path exists.

## Implemented behavior

Server prices remain $300/$450/$840 delivered and $450/$600/$990 stacked. Delivery is free; stacking is $150 once. Household use and the full eight displayed clauses, their hash, the payment policy hash, customer details and quote are frozen at acceptance. Browser price, invoice and office-approval assertions cannot override the order. A stale form requires reloading the actual wording.

The separate `fwlive_*` store preserves a single immutable order/invoice mapping, append-only observations and original paid proof. Bounded lost-response retries and explicit same-invoice renewal do not create replacement debt. Processing bank payments, payment preferences and return pages do not establish payment. Pending refunds, refunds and reviews hold further payment/fulfillment actions.

On the first verified fully-paid observation, one transaction captures one confirmation and exactly two immutable **held** outbox records: customer and owner. An outbox failure rolls the whole confirmation transaction back; retry can capture it once. There is no dispatcher, transport or automatic send. Test contacts cannot be replayed to real recipients.

The inherited layout is retained in separate production assets. Full accepted terms are rendered from the canonical data. Test tools and payment simulators are absent from production assets. Analytics, consent, estimates/drafts and public shipping inputs are unchanged.

## Verification

Run from the repository root:

```sh
npm run test:firewood:live-profile
npm run test:firewood:handoff
npm run build:public
npm run validate:public
```

The October 29 run passed 16 new profile checks, 31 retained handoff checks and the 19-page public build/validation. The actual Website client also passed an in-process exchange with the actual CRM handler (one invoice, nine operations, zero network/provider/message calls). The CRM separately reports 685 focused checks, typecheck and production-version focused builds. These are local/in-process and compiled-code proofs; they do not certify a native production installation or new real provider payment.

The bounded browser review covered a filled desktop form, 320px mobile, multiline customer details, and the saved-order view at 200% text. Held collection, paid, pending-refund and fully-refunded fixture states were reviewed. No horizontal overflow was observed. The preview/database were stopped with one synthetic order, one confirmation and two held messages, and zero email sends.

## Remaining release work

1. Complete/review the CRM's authenticated office approval and coordinated cancellation/refund workflows. Website must consume genuine bound approval, never authorize it from browser data.
2. Prepare and rehearse the disabled installation on the exact focused CRM baseline, with actual owners/ACLs and native simultaneous-session tests. The new SQL must not enter production through an unrelated migration batch.
3. Implement/review the guarded Website runtime loader, real host-only secure sessions, actual database/service identity and authenticated HTTPS client. Connect the existing CRM collector/shared receiver and source-aware confirmation sender with reviewed credentials. Current null loaders deliberately cannot perform this work.
4. Enroll the new paired topology in the existing write/commit/recovery guards. Independently verify actual release/schema/permissions, live key custody and continuous off-device freshness within five minutes. Old certificates cannot admit this new source.
5. Only after a separate installation/activation approval, enable collection, sending, workers and the public link through the reviewed gates. Do not bypass recovery fencing or fall back to the old collector.

Evidence: `outputs/firewood-checkout/production-profile-implementation-20261029/REPORT.md` in the Website workspace. No commit, push, migration, production deployment, live credentials or subscriptions were added in this implementation round.
