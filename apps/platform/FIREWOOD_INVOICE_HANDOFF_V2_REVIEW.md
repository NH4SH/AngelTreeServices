# Firewood invoice-before-payment: isolated engineering review

Status: **isolated financial behavior and actual prepare-only staging verified; no production Firewood v2 activation or deployment**. Prepared on 2026-10-29 from `origin/main` `f79f875004bca20bb9a1cd0432871d4c0dbe1853`, in the separate `AngelTreeServices-firewood-payments` worktree. No commit, push or merge is part of this batch. The existing production CRM, scanner, older paid-order importer and its nine verified mappings remain separate.

## Engineering decision

Use the CRM as the payment collector. The Website submits an immutable accepted order before taking payment; the CRM atomically prepares one unpaid invoice and a short-lived payment link. The customer uses the existing invoice payment chooser. The Website reads the CRM's versioned ledger status to determine payment progress. A browser redirect, saved check preference, pending debit or expired link never proves payment or completes delivery.

Keep the older zero-surcharge, paid-order v1 contract unchanged. New v2 is deliberately a different source and contract. Financial collection remains in the isolated native database/Stripe sandbox `acct_1UU9U8RAZXGe6tX0`; the separate managed staging profile is prepare-only. Both require synthetic `.invalid` contacts and exact account/source/environment bindings. Missing or mismatched configuration disables the feature. The native SQL prototype stays outside the production migration chain; managed staging has its separately reviewed installation `20261030005152`.

## Implemented boundary

- `POST /api/integrations/firewood/v2/prepare`: validate the accepted Virginia household order, canonical snapshot, price components and payment policy; prepare one invoice/customer/location/token/source mapping in one transaction. A retry returns the same invoice and capability. A changed accepted snapshot conflicts.
- `POST /api/integrations/firewood/v2/status`: read the complete invoice/payment/reservation ledger, then record a monotonic observation only if the whole ledger hash still matches. It performs no provider charge or delivery operation. Missing or contradictory evidence fails closed.
- `POST /api/integrations/firewood/v2/renew`: explicitly renew an expired capability on the same invoice, using a version comparison. Office revocation cannot be bypassed. Failed payment or expiry never creates a replacement invoice.
- Requests bind timestamp, HTTP method, exact path and raw body with HMAC. Bodies are bounded. Links and responses are private/no-store. Tokens use the existing hashed/encrypted portal format; raw tokens are not stored in the mapping or logs.
- Public source commands are service-role-only and reject user subjects. Internal tables have RLS and revoked direct access. Existing invoice, token, customer and financial authorization checks remain in place.
- The source invoice's customer, principal, line items, terms and reminder setting are frozen. Payment history and original paid evidence remain durable after later refunds, disputes or bank returns.

Order identity and payment attempts are distinct. Principal, surcharge, gross capture, principal/fee refunds and balance remain separate amounts. Status includes payment pending/review flags, original paid proof, observation revision, and a fulfillment gate. Receipt validators reject inconsistent amounts, stale revisions, changed same-revision content and loss of original paid proof.

## Reused collector and focused changes

The existing ConfirmationToken review/confirm, bank Checkout, payment reservations, idempotency, webhook receipts, invoice reconciliation and notification recovery are reused.

For this new source only:

- Eligible US credit cards can have a 3% fee. Debit, prepaid, unknown-funding and non-US cards are not surcharged. The exact total is reviewed before confirmation.
- Card requests use Stripe's dedicated `amount_details.surcharge`, with enforcement and acknowledgment checks, rather than a duplicate generic fee line. The manually verified preview API is pinned per request. A funding or amount mismatch is held.
- Optional Stripe card receipt email is omitted. The CRM owns payment receipts; the Website owns the separate order/delivery confirmation. Mandatory bank mandate or verification notices are a separate category, not a second business receipt.
- ACH uses a dynamic bank-only allowlist, a stable integration identifier derived from the random reservation, and a per-request current API version. Existing generic ACH/card payloads retain their prior configuration.
- The payment page has a fixed QA-only Return to Firewood order link, without order/session identifiers. Optional Link enrollment is disabled for v2, and both Elements and the API use matching dynamic card allowlists. Other payment choices remain available. The v2 refresh action is an accessible 44-pixel native button that actually reloads server state; a same-query/fragment anchor had left stale confirmation text. A real browser navigation check passed. Office-review summaries say Original Firewood order amount instead of implying a refunded amount must be paid again. Generic portal behavior is preserved.
- A separate test terms family records the accepted Website policy and payment choices. Existing thirteen-clause legacy and six-clause Firewood wording/digests are preserved.

### Necessary shared bug fix discovered by the real bank test

A genuine completed-but-unpaid bank Checkout returned a PaymentIntent awaiting microdeposit verification. The existing webhook normalizer returned retryable `checkout_state_unresolved`, leaving the receipt failed and the reservation open. The focused fix recognizes **pending**, never paid, only after all existing provider/local bindings and these additional facts: completed/unpaid session, `requires_action`, zero received, `verify_with_microdeposits`, and bank-only method type. Contradictory or unrelated action states remain held. This changes no RLS, charge amount, approval boundary or transaction implementation.

The new regression tests cover this exact state and negative cases. The failed genuine bank event was recovered through the actual receiver and replayed twice: one pending payment and one processing guard, no paid principal or fulfillment. After verification with Stripe’s fictional values, the genuine asynchronous event settled that same payment once. A return-page message was never accepted as proof.

## Verification and evidence

The isolated development database replayed all 129 migrations. The separate home-native database restored schema and ACLs only: 121 public tables, initially zero invoices/payments/handoffs. Neither was populated from production customer data. Native services bind to loopback; the scanner and production services are not reused or reconfigured.

Passed evidence:

- **561 financial/source/webhook assertions and 46 document/security/refresh assertions passed**, with no skips or failures. Typecheck, optimized QA builds and the installed framework security-floor check passed. The framework check does not declare this artifact production-ready. No lint command is configured in the package.
- Ten full-schema case groups: lost replies, exact replay, frozen request, encrypted token compatibility, expiry/renewal comparison, offline pending, simulated capture/refund allocation, original paid history, office revocation, frozen principal/lines and stale complete-ledger observations. These ledger fixtures are **not** claimed as real Stripe capture tests.
- Actual native HTTP and database checks: final audit-write failure rolls back customer/invoice/token/mapping together; anonymous/authenticated/user-subject calls are denied; link renewal and revocation work; MD/NY orders are rejected before preparation.
- Ten concurrent prepare requests create one invoice and one capability; ten simultaneous status reads retain one observation revision. Changed accepted content and future known revisions conflict.
- Cash/check pickup and mailed-check choices remain unpaid and cannot release fulfillment.
- The actual shared ACH API creates one unpaid $450 session with $0 surcharge, and retry returns that same session. The updated dynamic-allowlist request and integration identifier were accepted by Stripe in the isolated sandbox.
- A real Stripe-hosted fictional bank submission produced complete/unpaid Checkout and microdeposit verification required. The CRM did not mark it paid or permit fulfillment.
- A scan of 200 compiled client files found no private credential values. Private evidence, credentials, capabilities and raw provider payloads are outside the repository.

A QA launcher issue was diagnosed and fixed: PostgreSQL's library path had been inherited by Next.js, causing TLS issuer verification failures to Stripe. The path is now scoped to PostgREST only. Certificate verification was never disabled.

Private evidence directory on development Mac: `/Users/noelsierra/Documents/Codex/2026-10-29/firewood-handoff-v2/`. Native isolated evidence: `~/.local/share/ats-firewood-v2-full-qa-20261029/`. Do not publish private JSON files, raw provider payloads, portal capabilities or credential bundles.

## Genuine sandbox financial results

All amounts below are dollars. These are processor sandbox transactions, not real customer charges.

| Case | Principal | Card fee | Captured gross | Verified outcome |
| --- | ---: | ---: | ---: | --- |
| US credit | 990.00 | 29.70 | 1,019.70 | Partial refund 100.00 principal + 3.00 fee, then remaining refund; full 1,019.70 returned. Original paid proof retained. |
| Debit | 840.00 | 0.00 | 840.00 | Actual provider funding was debit; one payment and one prepared CRM receipt. Paid baseline preserved. |
| Bank account | 450.00 | 0.00 | 450.00 | Required fictional microdeposit verification; remained pending/unpaid until genuine asynchronous settlement. Same payment updated to succeeded. Paid baseline preserved. |
| 3D Secure | 300.00 | 9.00 | 309.00 | Genuine US-card challenge authenticated; no fulfillment before completion. One capture, then full 309.00 refund with original proof retained. |

The three Website financial cases each retained one captured order confirmation and one prepared CRM payment-receipt row. No receipt was dispatched. The native bank fixture began before the isolated planning settings were seeded and was not treated as historical receipt backfill. Pickup and mailed-check Website cases remained `offline_pending`, with zero captured money, no confirmation or fulfillment release.

A duplicate captured payment event did not create another payment or receipt. Replaying its old paid event after full refund left the order refunded. Six concurrent-refund observations were safely rejected as superseded; all were replayed sequentially through the actual receiver to completion, without forced financial writes. Local operator re-signing of genuine saved event data is explicitly distinguished from external provider retry delivery in the proof files.

### Diagnosed test setup issues

- Missing configuration rows in the schema-only restore correctly blocked the communication checkpoint. A synthetic configuration enables payment-receipt planning only; sender credentials and workers remain absent. The same receipt resumed without reapplying money.
- The initial v2 card form used static method collection while the server used dynamic methods. Stripe rejected the request before execution. The rejected attempt was preserved as failed with an audit entry only after verifying the actual token was unused, the provider returned the specific validation rejection and a complete provider listing showed no intent for that reservation. The corrected flow uses matching dynamic allowlists and a fresh genuine token on the same invoice. No general retry/security rule was relaxed.
- Both original sandbox keys lacked ConfirmationToken read access. The owner approved a new seven-scope restricted test key. Its account and genuine token reads were verified independently. Existing keys were retained; no full-access or live key was substituted.

## Cleanup and preservation

Original four-case cleanup proof: **zero active payment attempts, zero unresolved webhook receipts, four financial rows, zero customer emails sent**. Paid bank/debit baselines and refunded credit/3DS history remain intact. All four known unused Checkout sessions were expired; the three bound guards closed through the existing closure routine. The earlier lost-response guard was attached to its verified same-idempotency provider session with an audit entry before closure. No history was deleted.

New collection is held in the isolated source configuration. Only owned Next 3228, PostgREST 3229, gateway 3230 and PostgreSQL 56396 were stopped; data was retained. The original 56388 database, live CRM and scanner were not stopped. The test listener/relays and Website worker were stopped, and the retained older sandbox webhook was restored to its exact saved configuration.

Website preservation verification passed: 74 original sandbox + 74 original production source files, seven protected files, original two orders/four confirmations and queues unchanged. New v2 preserved its 91 source hashes, nine order/request snapshots and three immutable captured confirmations across a controlled restart. Production checkout activation and customer sending remain off for this new feature.

Safe final proof files are archived privately under the evidence directory, including `stop-proof.json`, `final-native-proof.json`, `provider-cleanup-proof.json`, `credit-capture-proof.json`, `credit-refund-proof.json`, `debit-capture-proof.json`, `bank-settlement-proof.json`, `threeds-capture-proof.json`, `threeds-refund-proof.json` and both failed-event recovery proofs. Raw provider events, credentials and portal capabilities must remain private.

## Final financial and staging follow-through

The earlier four genuine financial cases and the additional card-dispute, bank-failure and post-success ACH-return cases remain preserved historical evidence. A further fresh normal ACH payment/refund now also passed genuinely: immutable CRM/Website history records original paid revision **4**, paid-plus-pending-refund revision **5**, and terminal refunded revision **6**, retaining original paid proof. One payment, one completed attempt, four duplicate genuine-event replays, zero new attempts and zero customer emails are verified; no money or completion state was forced. Consolidated private proof: `/Users/noelsierra/Documents/Codex/2026-10-29/firewood-finalization/refund/bank-refund-final-proof.json`.

The early-refund ordering fix is narrow: an unpaid processing ACH refund remains retryable only after exact current Charge/PaymentIntent/Checkout/local invoice binding checks. It does not manufacture paid/refund evidence or email planning. The original-paid SQL trigger required no change and now has a regression proving a prior pending refund does not prevent later original-success capture. The focused webhook/receipt/retry/SQL run passed 141 assertions and the full TypeScript check.

### Final actual staging summary

- Managed staging `gbyhdsuiqeslgjdnbqng` has **129 original application entries + 15 preserved recovery-maintenance entries + installation `20261030005152`**. All original version strings and statement hashes are retained, with no migration reset, repair or production apply. Four private RLS tables, six service-only commands and 13 related routine boundaries are verified.
- Existing staging site `d81d923d-6ccf-4c1e-87cc-263f3d51555d` publishes prepare-only deploy **`6ae3f7d8dbd1c2f51425e1a6`** at `https://angel-tree-admin-staging.netlify.app`. Actual HMAC/API/backend binding, private invoice hold, real static assets, first-gate ordering, anonymous denial and immutable/direct-path protection pass. Final runtime has no Stripe/Resend/SMTP/worker credentials and no schedules; collector and surcharge flags remain off. The public free-plan scope adjustment never widened a secret's scope.
- The same synthetic invoice retained its identity through duplicate prepare, old renewal replay and two coordinated ordinary capability renewals after genuine expiry. Final version 4 has four retained token rows, three revoked and one active. No second invoice, payment, attempt, refund or customer communication was created by this staging round. The Website's actual HTTPS client passed independently.
- Actual managed pair **`ca46ea2e-9b75-483b-968f-a1684aa6e84e`** was captured/restored with the same scoped invoice/customer/location/line/activity, immutable observation, four tokens and 17 real FK references. The v2 routine/owner/grant/RLS hashes and five frozen-history/principal/line guards match. All four capabilities privately decrypt and match their actual receipts, expiries and revocations; the portal key never moved to the home recovery host.
- The corrected schema capture includes the real `private` Storage-policy dependency. The handoff's file manifest is explicitly empty; **289 unrelated staging Storage objects were preserved and excluded**. This proves the new synthetic v2 closed subset, not full staging customer/file recovery, continuous RPO or production failover. Original two-token recovery and intermediate version 3 HTTP proofs remain retained.
- Scanner clean/EICAR/credential-denial and exact managed Auth no-send isolation pass. The repository's shared global target flags remain false; only the private candidate used scoped, cited flags. Operating maintenance was assigned to the current authorized Codex verification session with Noel Sierra/ATS as accountable owner, without inventing a human 24/7 SLA.

Private aggregate: `/Users/noelsierra/Documents/Codex/2026-10-29/firewood-finalization/staging/STAGING_PREPARE_ONLY_ACCEPTANCE.private.json`. See [the detailed staging record](FIREWOOD_V2_STAGING_PREPARATION.md) for build/artifact checks, the static-publication correction, current scope and proof locations. No raw keys, capabilities, HMACs or session cookies are included in shared documents.

## Next integration step and remaining gates

**Keep the CRM as the sole collector and continue the existing Firewood roadmap. Do not revive or extend the paid-only v1 importer.** Genuine financial-risk coverage and prepare-only staging are now verified. They do not enable live payments or production sending.

1. Keep the current hosted stage prepare-only unless an explicitly reviewed sandbox collector round is requested. Preserve all financial, receipt, mapping and old-v1 history; do not repeat provider mutations merely to recreate existing proof.
2. Review the exact targeted production 102 dependencies/backport and independent final new-topology backup/write-fencing results. Do not deploy the whole unreleased 129 baseline or treat this scoped managed-stage restore as a five-minute production failover certificate.
3. Before production feature activation, independently verify accepted live terms, dedicated surcharge availability, scoped key permissions, one writable collector, receipt ownership, full recovery coverage and named ongoing operating responsibility. Long-term operating review is separate from the scoped staging verification session.

Technical references: [Stripe manual surcharge reporting](https://docs.stripe.com/payments/cards/surcharge), [Stripe sandbox test values](https://docs.stripe.com/testing).

No production payment, invoice, customer email, migration, account setting, feature deployment, DNS, key rotation or scanner change was made by this feature verification. Actual staging installation/deployment is recorded above. No commit, push or merge occurred; production enablement remains a separate reviewed action.
