# Firewood issuance and historical billing repair rehearsal

October 30, 2026. **The focused local repair passed its native financial checks. It is not activated or deployed.** The earlier eleven-case baseline, its reproduced reporting failures, original runner and evidence remain preserved. This report records the subsequent repair; it does not rewrite those findings.

## Financial result

Accepted Firewood invoices now have immutable candidate-owned issuance evidence separate from document delivery. Preparation and financial reconciliation leave `sent_at` empty and create no email or delivery history. When money is partially or fully reversed, the actual reconciliation RPC, stored invoice, office accounting snapshot, integration accounting snapshot and receivables agree. The ordinary unsent-draft prepayment rule remains unchanged.

Cancellation credit is a separate accounting record. It is not a refund, payment, void or edit to the original sale. After a full-eligible cancellation's refundable money has actually been represented as fully returned in the synthetic ledger, an authorized office review can append one full-principal credit. The invoice's accepted amounts and payment/refund evidence remain intact. The resulting invoice is `credited`, collectible balance is zero, real paid principal remains zero and `paid_at` remains empty. Final cancellation is a separate reviewed operation.

The invoice report retains its positive gross row at the original creation timestamp and adds a distinct negative credit row at the credit's posting timestamp. That row does not count as another issued or paid invoice. Existing payment reporting is unchanged. No delivery timestamp is used as a workaround for financial issuance, and no fake payment or unexplained zero-balance patch closes the debt.

## Native verification

The final suite completed **13 cases, 205 committed bounded operations and 228 explicit target checks** on PostgreSQL **17.11**, using a fresh development-only cluster and the separate database `fw_office_native_28956add6ba1_billing`. Every transaction verified the exact database, actual cluster system identifier, synthetic marker, Unix-socket connection and reviewed PostgreSQL version. Genuine Auth/profile/role rows and effective-access functions were used; native access predicates were never replaced by test helpers.

The accepted fixture was a full cord plus stacking, totaling **60,000 cents**. All entries were fictional, retained local fixtures. The Stripe-shaped dispute, pending-refund and accepted-email records are expressly synthetic controls, not evidence of real provider activity. No real charges, refunds, customer emails or provider requests occurred.

| Case | Verified behavior |
| --- | --- |
| Issuance and ordinary drafts | Accepted invoice: `sent`, balance 60,000, paid principal zero, immutable `issued_at`, no `sent_at`, `paid_at`, email or delivery event. Ordinary unsent draft with 30,000 prepayment stayed a draft. The original five-argument resolver matrix was unchanged. |
| Full refund after full payment | Actual RPC and row remained `sent`, balance 60,000, paid principal zero; ordinary AR retained the debt. Office held billing closure. Original fully-paid proof remained unchanged. |
| Partial refund after full payment | Actual RPC and row became `partially_paid`, balance 30,000 and retained paid principal 30,000; ordinary AR retained the balance. Repeated reconciliation was stable; office required refund review. |
| Returned previously collected payment | Actual RPC and row remained `sent`, balance 60,000 and paid principal zero; ordinary AR retained the debt. Office required payment review and denied accounting credit. |
| Valid partial lost dispute | The original dispute allocator produced `partially_paid`, balance 30,000 and net paid principal 30,000. Ordinary AR retained the balance; payment review and immutable original-paid proof remained. No unsupported partial bank-return state was invented. |
| Fully refunded historical cancellation credit | One immutable 60,000 credit closed the collectible balance. Original invoice amounts, payment/refund rows, original-paid proof and delivery/email history were unchanged. Exact retry returned the same acknowledgement; changed payload, changed actor, stale/duplicate credit and fresh manual collection were denied. Cancellation could then be confirmed separately. |
| Actual outbound-repair control after credit | The actual no-send delivery-review command repaired one explicitly fictional accepted outbound record. It retained `credited`, zero collectible debt, zero real paid principal and empty `paid_at`; it did not restore gross debt. Repeating repair retained one email-history record and unchanged money/credit history. This is not a claim that a real message was sent or delivered. |
| Partial payment fully refunded | A 30,000 receipt refunded in full could receive the full 60,000 cancelled-sale credit. No fully-paid proof was invented. A separate late non-refundable cancellation could not receive a credit. |
| Refund change invalidates review | Completing the remaining partial refund changed the financial hash without changing workflow revision. The old review was denied; a fresh review could record exactly one credit. |
| Pending settlement | Pending payment could not authorize credit or final cancellation. No pending money was treated as received or returned. |
| Pending refund | Pending refund could not authorize credit or final cancellation. No pending refund was treated as completed. |
| Unverified expired checkout | A local expired status without reviewed remote closure could not authorize credit. No checkout reconciliation stamp was fabricated. |
| Source disabled | After every source/collector/surcharge/sender flag was off, existing issuance and credit remained financially authoritative. Staff reconciliation and accounting reads stayed correct; integration reads remained source-gated. |

The successful historical-credit case checked the actual dashboard before and after credit: both net billed and outstanding declined by exactly 60,000 cents; collected-money totals did not change. Its actual invoice-report rows were one +60,000 original and one -60,000 posting, with matching customer/source/service attribution. The credit row had `creditCents = 60000`, `issued = 0` and `paid = 0`; the stored original creation timestamp and credit posting timestamp were both checked.

Two initial driver failures were retained. The first compared equivalent Eastern/UTC representations of the same raw issuance instant; the test was corrected to compare instants while keeping accounting DTO equality strict. The second rejected a safe `P0002` denial for trying to credit an active order without a cancellation workflow; the matcher was corrected to accept explicit expected denial codes. Neither required a business-SQL change. The completed native pass followed these fixture corrections.

## Report security verification

Independent readback found that replacing the invoice-report view had reset its original invoker option. The root task corrected the candidate source and only the owned native clones. Financial data and report definitions were otherwise unchanged.

A subsequent **read-only** check used an actual authenticated owner with the restored `security_invoker = true` settings on both `report_invoices` and `report_ar`. Report queries passed under that security mode. The retained fixture's dashboard net billed was **600,000 cents**, outstanding was **480,000 cents**, and three -60,000 credit rows were visible with `paid = 0`. These matched independently calculated retained invoice/credit balances. All credited invoices were absent from ordinary AR. The root task separately owns catalog/security and concurrent transaction verification; this financial suite does not substitute for those reviews.

## Separate in-memory integration fixture

`tests/fixtures/firewood-accounting-db.mjs` exports `accountingReadyDb`; the original `readyDb` remains unchanged. The new wrapper loads exact retained 102 preimages for paid-principal calculation, the five-argument status resolver, invoice reconciliation and outbound-delivery repair, then installs the canonical accounting candidate. Their source-body hashes are recorded in `firewood-accounting-102.sql` and satisfy the candidate's preimage checks.

Its two smoke checks passed: accepted issuance without delivery, and a fully refunded historical cancellation producing one credit and becoming ready for separate confirmation. This in-memory helper retains the original fixture's disclosed `test.uid`/`test.admin` authority and adds a matching fixture-only staff delegate. It is not evidence of genuine native Auth/RLS or provider delivery. It contains no provider-acceptance or successful-transport stubs and does not install the reporting patch.

## Evidence and final state

Evidence directory: `/Users/noelsierra/Documents/Codex/2026-10-30/firewood-accounting-repair/target-28956add6ba1/`.

- `BILLING_REPAIR_PROOF.json`: completed 13-case native financial suite.
- `BILLING_REPAIR_FINAL_FLAGS_PROOF.json`: final target/flags and retained fixture counts.
- `BILLING_REPAIR_REPORT_SECURITY_PROOF.json`: actual-role reporting after the invoker-option repair.
- `BILLING_REPAIR_ATTEMPT1_FIXTURE_FAILURE.json` and `BILLING_REPAIR_ATTEMPT2_FAILURE.json`: retained initial driver failures.

Executed native runner SHA-256: `61c4fe6a6a3d9d0a16ed13c4cca9b41dbbeca358165ecbb6a9bd37995ab04424`.

Native financial proof SHA-256: `c257e6cd07d75cbfe0296bb9b9a185293d250e2b79db00425f71608282fead32`.

Reporting-security proof SHA-256: `402a181d385453eba05ab0d3661e47cf0e62d8715b0c8fe20d30c738d361b802`.

At completion all four source flags were off, pools were closed and the database was released for shutdown. Thirteen synthetic handoffs, three credit records, fifteen office events, ten payment records and one synthetic accepted-outbound control were retained, including data from the initial driver attempts. No financial history or evidence was deleted. The original baseline cluster was not restarted or changed.

No production or staging changes, scanner changes, credential changes, commits, pushes, merges, deployments or runtime activation were performed by this verification. The new accounting table has no live recovery authority. Deployment still requires the root task's full security/concurrency/build review, source-aware customer integration and enrollment of the complete new topology in the actual guarded backup/recovery boundary.
