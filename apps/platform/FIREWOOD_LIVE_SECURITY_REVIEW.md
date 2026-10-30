# Firewood live-profile independent security review

Reviewed October 29, 2026. **Accept the separate, inactive implementation for further release preparation. Do not activate it or replace the current production release.** This review covers local source and synthetic tests, not a live merchant, customer order, production installation, or recovery certificate.

The inputs were the final v2 verification report, the Website production launch review, frozen sandbox/staging contract and SQL, existing collector/webhook commands, the new live contract/profile/handler/adapters/collector candidate, and the separate review SQL. No credentials, real provider calls, production or managed-staging changes were used.

## Decisions and corrections

| Boundary | Decision and evidence |
| --- | --- |
| Sandbox/live isolation | Keep the frozen v2 contract strict. Live has distinct contract, source, environment, HMAC domain, paths, terms/payment-policy versions and private tables. Both parsers reject the other profile. The live SQL pins the existing live merchant; it does not widen sandbox checks. |
| Office price authority | A signed Website request and arbitrary approval UUID are insufficient. The new SQL requires an actual CRM-issued approval by an effective owner/admin, bound to the complete order/contact/price/terms, with generated identity/time, expiry, revocation and one-invoice consumption. Service callers cannot issue approvals or directly write private authority. |
| Offboarding concurrency | The initial approval/revocation commands checked permission before potentially blocking. Review identified the stale-authorization window. Both now acquire the existing `platform-role-management` lock before the effective-access check, preserving the employee lifecycle serialization boundary. A native simultaneous-session test remains a release check; single-session PGlite cannot certify that race. |
| Actor and financial authority | Request schemas reject actor IDs, send switches, provider IDs and paid assertions. Ordinary prices cannot be reduced without office authority. Preference and return-page fields cannot authorize payment or fulfillment. Original paid proof and same-revision observations cannot be replaced. |
| API privacy and authentication | Exact binding, raw-body HMAC, path domain separation, key identity, clock bounds, host checking, UTF-8 validation and byte limits precede database work. The handler now includes a finite body deadline and bounded database adapters. Public receipts whitelist fields at every nested level, omit raw encrypted capabilities/customer/provider metadata, and sanitize internal failures. |
| Singular collector and messages | Preserve the existing owned Stripe receipt/apply/recovery transaction. There is no new live provider client or second receiver. Live invoice markers fail closed instead of falling through as ordinary invoices. CRM remains the payment-receipt authority; Website remains the distinct order-confirmation authority. No send work is created by these tests. |
| Surcharge | Keep exact 3% eligible-credit arithmetic separate from principal and require dedicated provider validation. Debit/prepaid/unknown/non-US classifications cannot be surcharged. The pure helper is arithmetic validation, **not proof of processor eligibility or live-account support**. Do not retry a failed live provider request by dropping surcharge validation or changing collectors. |
| Immutable customer policy | The accepted hash includes the actual displayed clauses, not merely a version label. Recomputing a hash over altered wording/prices/payment rules still fails the fixed policy comparison. Parsed acceptance is detached and deeply frozen. |
| Activation authority | The review profile is non-loadable, every activation switch is false, and all actual release/schema/key/recovery bindings are null. The shipped runtime factory returns null and all three live routes return 503. Code identity or live-key syntax does not establish a current write permit. |

## Verification

Independent adversarial coverage is in `tests/firewood-live-security-review.test.mjs`: **24 tests passed** on Node 22.23.4. These include cross-protocol replay, malicious recomputed snapshots, actor/send/paid field injection, contact/control-character injection, host/forwarded-host attacks, pre-auth database denial, oversize/invalid bodies, source swaps, receipt leakage, wrong-invoice collector context, refund/dispute holds, immutable paid evidence and default-closed routes.

An independent combined run of the live contract, SQL and security suites passed **47 tests**. SQL behavior used an isolated in-memory PostgreSQL implementation and intentionally fictional data. It verifies transaction rollback, permissions/RLS and trusted approval behavior against its fixture; it does not replace the actual focused-production schema/ACL readback or concurrent native PostgreSQL tests.

## Required before any live admission

1. Reconcile the new live candidate with the focused current-production release and its backup repairs. Do not deploy the unrelated 129-migration main branch or mutate the previously sealed sandbox capsule. Read back actual DDL, permissions, write guards, code and ledger after a separately approved disabled installation.
2. Verify the real shared Stripe receiver, exact account/key/permissions, dedicated surcharge support and processor eligibility using the assigned live bindings. Keep new collection off until those checks pass. This review made no live provider request and created no new credential.
3. Review the Website customer session/CSRF/exact-origin boundary and office-approved price handoff together with this CRM contract. Machine HMAC authentication does not replace browser CSRF protection. Demonstrate singular Website confirmations and CRM receipts across uncertain acknowledgements and restarts; never replay a test outbox to live recipients.
4. Certify the actual paired Website/CRM topology under the five-minute off-device recovery bound, including accepted but unprepared orders, invoice mappings, capabilities, financial history and message ownership. Assign fresh recovery authority; flags must never bypass the production write fence.

These are concrete release gates. The simplest correct next step is joint disabled-profile integration review and a socket-only native concurrency rehearsal, followed by a separately approved production preparation window. Public ordering, collection and sending remain unavailable throughout this implementation review.

References: [Supabase function privileges](https://supabase.com/docs/guides/database/functions), [Stripe surcharge validation](https://docs.stripe.com/payments/cards/surcharge), [Stripe webhook delivery and verification](https://docs.stripe.com/webhooks), [Stripe key protection](https://docs.stripe.com/keys-best-practices).
