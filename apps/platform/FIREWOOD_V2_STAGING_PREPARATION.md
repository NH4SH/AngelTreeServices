# Firewood v2: payment-risk checks and staging preparation

2026-10-29. **Production Firewood v2 remains inactive. Actual prepare-only staging installation and HTTPS acceptance now pass.** This continues the existing invoice-before-payment implementation. Managed staging received its reviewed v2 migration and a protected deployment; collection, provider credentials, customer sending and scheduled workers remain off there. No production deployment, source activation, financial change, DNS change, key rotation, commit, push or merge was performed by this feature verification. The separate current-release production backup incident is tracked outside this staging operation.

## Decision and verified change

Keep the CRM as sole collector. Keep the accepted order and original paid proof immutable; preserve one invoice, reservation identities, receipt history and Website confirmation. A failed debit, refund, dispute or link expiry must not create a new invoice or automatically retry a charge.

The remaining review reproduced one real local defect: a paid order with a pending/requires-action refund could still have `fulfillment_ready=true`. Three regression failures demonstrated the omission before the fix. The private refund observations now participate in the same complete-ledger hash and comparison as payments/reservations. Refund ID, payment binding, currency, amount, uniqueness, supported status and combined active-refund exposure are validated. Missing refund evidence fails closed.

While a refund is pending or requires action, the existing response says processing, pending and office review; fulfillment is held. Collected principal, card fee and returned amounts do not change prematurely. Original paid proof is retained. The collector's review check also includes these observations. No new response fields or provider write operation were introduced, and the shared refund transactions/RLS remain unchanged.

A verified failed/canceled refund request leaves captured money paid if no completed refund or dispute exists. Releasing that financial uncertainty does not dispatch, deliver, cancel or reinstate an order. Operational cancellation/refund intent remains a separate office workflow. Actual completed refunds and all dispute states continue to require review and block repayment/fulfillment. Website regression coverage confirms its existing review message takes priority and that these observations do not create another captured confirmation.

## Earlier isolated risk-batch verification

- **135 local financial/collector/webhook assertions passed**: 125 focused assertions including 40 handoff cases, plus 10 bank-failure/current-dispute-state cases. No failures/skips. The latter use provider fixtures; they are not claimed as genuine Stripe bank-return lifecycle proof.
- **12 full-schema loopback database case groups passed**, including stale-observation rejection when only refund status changes, unchanged balances while refunding, original-proof retention, terminal unsuccessful refund observations, and existing atomic prepare/replay/renew/revocation checks.
- Read-only local catalog verification found four private RLS tables and six service-role-only commands. Client roles retain no direct table access.
- Optimized QA build passed. The runtime still deliberately accepts only the isolated sandbox and loopback backend; it is not a staging/live adapter.
- Typecheck and 46 existing document, refresh and security-preservation assertions passed. Combined local assertions in this batch: **181 passed, zero failures/skips**. Final isolated development evidence shows zero active payment attempts, zero sent customer emails and collection disabled; the owned development stack was stopped with data retained after checking.
- The Website follow-up independently reports 19 passing order-flow tests. Its original export, confirmations and older v1 fixtures remain preserved.

### Genuine provider follow-through after power was restored

The updated compiled QA artifact and two refund-aware read functions were installed **only in the existing isolated native environment**. The original four genuine financial cases passed before and after that update and again after the new cases. No build or workload was run against production or the scanner.

| New sandbox case | Principal | Fee | Genuine outcome and CRM result |
| --- | ---: | ---: | --- |
| Asynchronous card dispute | $450.00 | $13.50 | One $463.50 capture, then dispute and terminal lost outcome. Historical gross/original paid proof retained, outstanding principal $450.00, office review and no fulfillment or repayment. One payment and one prepared receipt. |
| Closed bank account | $450.00 | $0.00 | Real hosted bank entry and fictional microdeposit verification; processing then `account_closed`. Zero captured money, one failed payment and failed attempt, no original paid proof or fulfillment. |
| Bank return/dispute | $450.00 | $0.00 | Real hosted bank entry; processing then succeeded, then a genuine terminal lost ACH dispute. The observed first-paid proof and historical $450.00 gross remain intact; outstanding principal $450.00, office review and no fulfillment or repayment. |

The card dispute was closed only through the sandbox Dashboard for the new dispute. The bank dispute reached its terminal outcome through Stripe's documented fictional account. Both terminal outcomes were independently re-read with the existing restricted key. The two older Website v1 disputes were preserved.

Two superseded failed webhook receipts recovered through the actual receiver. The original captured raw event signatures were authenticated; fresh **local operator test signatures** were used for expired captures. This is distinguished from fresh external Stripe delivery. No financial row or completion marker was forced through SQL. Four additional duplicate completion deliveries left one payment, one receipt and unchanged activity per disputed invoice; neither lost dispute was reversed.

With test collection temporarily enabled, the normal failed/unpaid control remained eligible for a deliberate customer choice, while both disputes stayed review-blocked. An actual bank portal checkout request returned **409 office review** without creating another reservation. Collection was held again immediately afterward. The rendered customer page refreshed from bank processing to Office review and contained no pay-again controls; the synthetic screenshot is archived as `risk-bank-return-office-review.jpg`.

**Earlier risk-round reconciliation:** seven financial rows (four prior cases plus three new cases), zero active payment attempts, zero unresolved webhook receipts and zero customer emails sent. Only Next 3228, PostgREST 3229, gateway 3230 and PostgreSQL 56396 were stopped, with data retained and new collection held. The live CRM, scanner and original 56388 database were not stopped or modified.

Final cleanup independently confirms that the retained older sandbox webhook was restored to its exact saved configuration; the owned listener, development relays and isolated Website worker were stopped. Seven protected files, 148 original sandbox/prepared-production source hashes, the original two orders/four confirmations/queues and both old disputes remain unchanged. The new Website candidate retains its 91 source hashes, nine accepted order snapshots and four captured confirmations. These references to prepared production describe the inactive Firewood setup, not a stopped live CRM. Website evidence is under `outputs/firewood-checkout/provider-risk-checks-20261029/`, including `final-cleanup-proof.json`, `webhook-guard-proof.json`, `final-verification.json` and `card-history-preservation.json`.

### Genuine pending bank-refund follow-through

The later fresh normal ACH case completed genuinely in the isolated Stripe account. Its immutable actual CRM/Website history records original paid revision **4**, paid-plus-pending-refund revision **5**, and terminal refunded revision **6**. The original paid proof remains identical, with one payment, one completed attempt, four duplicate genuine-event replays, zero newly created attempts and zero customer emails. No financial row, completion marker or provider event was manufactured. The consolidated proof is `/Users/noelsierra/Documents/Codex/2026-10-29/firewood-finalization/refund/bank-refund-final-proof.json`.

A labeled standalone `pm_card_bypassPending` test transaction supplied fictional available funds so the pre-existing negative sandbox balance did not turn this into an insufficient-funds refund test. It has no customer/invoice binding or receipt request and remains an intentionally retained test fixture. Existing restricted-key scopes were not broadened and no real money was used. The earlier unpaid/expired refund preparation was preserved and was not revived or misrepresented as a completed payment.

A narrowly bound refund arriving before the ACH debit succeeds is now retryable only after actual Charge, PaymentIntent, Checkout Session and local invoice/reservation/mode/amount checks. It produces no financial evidence or email planning while unpaid. The unchanged original-paid SQL trigger was independently tested with a pending refund already present: later actual success still captures original paid evidence once, and a full refund cannot overwrite it. **141 focused webhook/receipt/retry/SQL assertions and a full TypeScript check passed.** These local regressions remain distinct from the genuine paid/pending/refunded history above.

Safe native evidence copied privately to the development directory includes `risk-native-update-proof.json`, `risk-native-canary-proof.json`, `risk-card-dispute-proof.json`, `risk-bank-failure-proof.json`, `risk-bank-return-proof.json`, `risk-event-recovery-1793319186581.json`, `risk-duplicate-events-proof.json`, `risk-repayment-proof.json`, `risk-unused-refund-case-cleanup-proof.json`, `risk-final-native-proof.json` and `risk-stop-proof.json`.

Private proof/log directory: `/Users/noelsierra/Documents/Codex/2026-10-29/firewood-handoff-v2/`. Relevant files: `risk-financial-regression.private.log`, `risk-webhook-regression.private.log`, `risk-full-schema.private.log`, `risk-local-catalog-proof.json`, `risk-staging-preparation-proof.json`. Never publish runtime credentials, capabilities or raw provider payloads with this package.

## Actual managed staging reconciliation

**CRM Staging `gbyhdsuiqeslgjdnbqng` now has the reviewed v2 installation `20261030005152`.** Its full history is **129 original application entries + 15 existing recovery-maintenance entries + 1 staging-v2 entry**. All original version strings and statement hashes remain preserved; the original application ledger digest is `42b9556b3e7f31050aa8a8c070cc8814`. No ledger repair, reset, renumbering or production migration was performed.

The four private v2 RLS tables and six service-role-only public commands are installed, with 13 related routines independently compared. Anonymous/authenticated/user-subject access and direct service-role private-table reads remain denied. Shared invoice collectors, financial transactions, terms and existing permission boundaries are preserved. The one isolated staging source enables preparation only; collector and surcharge-reporting flags remain false.

The strict native profile and explicit staging profile remain separate. Staging binds the exact assigned project, site, HTTPS origin, isolated Stripe account and source/environment. Contacts remain synthetic `.invalid` addresses. Existing staging backend, portal, gate and scanner credentials were reused privately; the prepared internal HMAC and two existing-key aliases are secret in the dedicated site's production context, with builds/functions/runtime scopes and no post-processing. Nonsecret identity/flag fields use the free plan's required public scopes. No Stripe, Resend, SMTP, worker or hosted Website-caller credential was installed.

## Actual hosted prepare-only acceptance

Dedicated site `d81d923d-6ccf-4c1e-87cc-263f3d51555d` now publishes staging deploy **`6ae3f7d8dbd1c2f51425e1a6`** at `https://angel-tree-admin-staging.netlify.app`. Next 16.4.2 / React 19.2.9 / Node 22.23.4 and the modern Next adapter 5.16.3 were verified. The unchanged first-position gate covers every path, fails closed, has no post-cache/public exception, and rejects immutable aliases even when supplied a canonical session. No scheduled workers are selected.

The actual-value build passed with zero outbound compilation requests and zero private-value matches in 200 browser files. Packaging review inspected 201 published static files and 2,460 decompressed Function members, with no private values or forbidden credential/test files. The published Function uses Node 22. An actual acceptance check caught an incorrect manual static publish directory; it was fixed forward to the adapter's reviewed `.netlify/static` directory. Real JavaScript assets now return 200 only behind the private gate. Anonymous access returns 401; server-source paths return404 to authorized users, and the earlier immutable deploy remains 421. No production deploy was involved.

Actual hosted HMAC prepare/status/renew behavior and the Website's real HTTPS client were exercised on the **same synthetic invoice and order**. Duplicate preparation retained the invoice. Replaying the original expected renewal version retained two tokens. The genuinely expired link was renewed normally to version 3; the independently coordinated Website client then performed one normal version 3→4 renewal. All four capability rows and revocations were preserved, without editing expiry dates or creating a second invoice. The final check performed no further normal renewal.

Thirteen final HTTPS checks passed, alongside retained earlier renewal and Website transport proofs: correct private invoice/payment-hold rendering, actual static assets, HMAC and anonymous denial, current alias GET/POST denial, direct Function/framework/worker protection, expired/revoked links unavailable, and bank Checkout 503 before provider use. The final source remains unpaid/not fulfillable with **zero payments, attempts, refunds and customer communications**, one active version 4 token and three revoked tokens. Collection/provider credentials/schedules remain off.

Fresh independent scanner checks classify clean/EICAR bytes correctly and deny missing/wrong tokens; staging and production credentials/endpoints differ. Managed Auth retains exact staging redirects/templates, no SMTP, and the exact reviewed no-send guard with auth-admin-only permissions. The old standalone hosted key probe is absent; actual backend and HMAC binding are instead proven by the new real hosted integration round.

The operating maintainer assignment is limited to this authorized synthetic verification session: **Codex — current authorized verification session; accountable system owner Noel Sierra/ATS**. It does not promise human 24/7 coverage or a production SLA. The private export has cited flags for this scope; the shared repository `staging/targets.json` remains unchanged/false.

## Actual version 4 stage-pair recovery

Pair **`ca46ea2e-9b75-483b-968f-a1684aa6e84e`** captures the actual managed-stage synthetic handoff and was restored into a fresh, isolated native database. One customer/location/invoice/line/activity/source/handoff/observation, all four portal-token rows, and zero payment/attempt/document/event rows match exactly. **17 actual non-null foreign-key references** close without fabricated rows. All 13 routine definitions/owners/rights and four private RLS boundaries match. Five immutable-history/principal/line guards still reject mutations after restore. Normal service commands work, while anonymous/authenticated/user-subject/private-table bypasses remain denied; the restored Auth guard returns 503.

All four encrypted capabilities were decrypted and compared in memory using the existing private portal key: receipt/hash/hint/expiry identity, three revocations, the single active version 4 token and exact staging origin survive. No key was copied to the home recovery host; no decrypted token, cookie or capability URL appears in this document.

The first schema-only rehearsal correctly exposed an omitted dependency: a Storage policy calls `private.can_access_job_photo_object`. Capture was corrected to include the real `private` schema. No stub, policy omission or permission bypass was accepted. The source schema SHA256 is `7e81668c23d397aa0fa2ee3df13700ea27ac4dafd4b0f46cb9bd81b336f1ca75`; the final synthetic data SHA256 is `e14220aff51929e9ba4c58cb3d7a8c2e8dc3a3f4787cfd041e91d549dd8c6234`.

**This is a closed-subset stage recovery proof, not a full staging/customer/file backup claim.** The new handoff has no documents or uploaded source files and carries an explicit empty file manifest. The 289 unrelated staged Storage objects were preserved and excluded. The original two-token recovery pair and intermediate version 3 HTTP evidence remain archived. The owned stage recovery cluster was stopped and its port explicitly released to the independent final native recovery rehearsal; every database was retained.

Aggregate private evidence: `/Users/noelsierra/Documents/Codex/2026-10-29/firewood-finalization/staging/STAGING_PREPARE_ONLY_ACCEPTANCE.private.json`. Detailed HTTP, artifact, environment-metadata, scanner/Auth, scoped capture/restore, capability and stop proofs are adjacent. No raw credential, session, customer payload or capability belongs in shared reports.

## Remaining rollout sequence

1. Retain all genuine financial and immutable-history evidence, including paid/pending/refunded revisions 4/5/6. Future processor tests still require coordinated ownership of the isolated receiver and preservation of the older v1 history; fixture tests must not be relabeled as provider delivery.
2. Keep this hosted staging deployment **prepare-only**. Enabling its payment collector would require a separately reviewed sandbox-only provider configuration and acceptance round; no provider or automatic email activation is implied here.
3. Review the targeted production 102 dependencies/backport and the independently run new-topology backup/fencing certificate. The managed closed-subset restore above does not itself certify whole-stage backup coverage, continuous five-minute RPO or production failover.
4. Prepare any production feature activation separately: accepted live terms, dedicated surcharge availability, scoped keys, one writable collector, receipt ownership, recovery and operational responsibility must be verified against the actual deployed release. Do not copy the synthetic schema export or publish the whole unreleased 129 baseline.

For recovery, hold new preparation/collection first and retain status/history plus all existing payment attempts. Never delete mappings, erase paid proof, automatically refund, reopen a competing writer, resurrect a void/revoked link or issue replacement charges.## Power and remaining release boundary

The owner connected AC power after the earlier low-battery stop. The original human instruction permits battery operation only above 10%; AC operation was already approved. The initial restart gate applied that limit too broadly and was corrected to the existing rule. Read-only checks confirmed a 20W adapter and a rising charge; light native checks then ran under the existing battery-loss stop, plus an owned-QA-only stop for declining charge while on AC. No global power settings changed. Heavy builds/regressions had already run on the development Mac.

The genuine pending bank-refund scenario and actual managed/hosted prepare-only staging checks are complete as recorded above. Production backport, full operational backup/fencing certification and live feature activation remain separate release boundaries. This evidence does not authorize production Firewood v2 collection or customer sending.

References: [Stripe ACH test scenarios and post-success disputes](https://docs.stripe.com/payments/ach-direct-debit/accept-a-payment?payment-ui=checkout), [ACH refunds and late returns](https://docs.stripe.com/payments/ach-direct-debit), [Stripe webhook verification](https://docs.stripe.com/webhooks).
