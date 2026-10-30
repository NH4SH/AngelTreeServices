# Firewood office-v2 connection — inactive review candidate

October 30, 2026. This is a separate, accounting-aware companion over the CRM's verified local candidate. The frozen `office/` v1 and `live/` financial contract/store remain unchanged. `customer/` now imports this companion deliberately; an old client, old store, missing accounting receipt or old signature cannot fall back to v1.

## Contract and storage

- Contract: `firewood-office-live-v2`.
- Paths: `/api/integrations/firewood/live/v2/office/{price-request,price-status,order-status}`.
- Signing domain: `ATS-FIREWOOD-OFFICE-LIVE-V2`; the signature prefix remains `v1=`.
- `office-contract.mjs` and `office-accounting.mjs` are exact copies of the CRM's reviewed canonical modules. SHA-256: `aa51cbc9f92f67facef074e1bb0b87972061b7f5f1f249a64ec390cf09127a89` and `402593b46b4b199ccb048dacbab803c06308feb9abdb988415a725633e7245c7` respectively.
- The separate `fwofficev2_` namespace, client brand and identity reject v1 data/clients. There is no automatic migration or historical backfill.
- The mandatory accounting object has exactly six fields: `issued_at`, `original_principal_cents`, `raw_balance_due_cents`, `credited_principal_cents`, `collectible_balance_cents`, `credit_id`. Issuance and original principal are immutable; a full-principal credit cannot disappear or change identity. A new credit must advance workflow revision, including under the locked persistence check and SQL update guard.

Cash, accounting credit and cancellation remain distinct. Original price/payment proof/refund totals are retained. A cancellation credit does not create paid money, a refund, a delivery/email receipt or fulfillment permission. Fresh combined evidence is required before returning any payment capability. Unknown, stale or terminal-regressing responses stay held.

## Closed runtime

`profile.mjs` is metadata only. All ordering, collection and sending gates are false; database, transport, credential, provider, sender and migration bindings are null. `runtime.mjs` always returns 503. The only constructor accepts branded, owned disposable test storage and an in-process synthetic-contact transport. It opens no provider socket and cannot load environment credentials.

The inherited order/approval/retry/session protections remain: server prices, immutable accepted details, exact displayed approval/terms acknowledgement, office authority, one invoice, bounded durable retries, original paid evidence, fresh lifecycle checks before/after renewal and no confirmation/refund dispatch.

## Verification and limits

The combined Website regression run passes 108 checks: 23 office-v2, 12 customer HTTP, eight browser-code, 18 frozen office-v1, 16 frozen live-profile and 31 retained handoff/staging. Public tests pass 239 Node checks plus nine style checks and a 19-page build/validation. Local browser checks cover desktop, 320px and 200% text.

The dated OUT-only joint proof uses actual CRM handlers, fixed native RPC adapters, authenticated office-command validation and reviewed accounting SQL in a new private PGlite database. It allows exactly `checkout.invalid` in that fixture only; `other.invalid` is rejected. Synthetic SQL payment/refund observations are explicitly not Stripe events. CRM's separate native Auth/RLS/concurrency/reporting proofs remain their own evidence. No actual CRM source/runtime/database or native rehearsal was modified.

See `FIREWOOD_CUSTOMER_RELEASE_REVIEW.md` and Website workspace `outputs/firewood-checkout/office-v2-connection-20261030/REPORT.md`. Actual production dependencies, singular confirmations/sender, genuine provider/receiver and final paired recovery/admission remain separate release gates. No installation or activation is authorized by this candidate.
