# Firewood issuance and historical billing closure

October 30, 2026. **Implemented and verified locally with synthetic data. No deployment or production changes.** This continues the focused native rehearsal; it does not replace or erase its reproduced failures. The new profile remains inactive.

## Result

Accepted Firewood invoices now have immutable financial issuance evidence distinct from document delivery. After full/partial refunds, returned money or lost disputes, the actual invoice status, reconciliation RPC result, office accounting and receivables agree. No `sent_at`, provider acceptance, customer email or payment is fabricated. Ordinary unsent prepayments retain their original draft behavior.

An active owner/admin can explicitly **release the cancelled balance** for an eligible fully refundable cancellation after money/refund and checkout-closure review. This posts one immutable full-principal cancellation credit, with reason, actor, request identity, financial snapshot and workflow revision. It preserves the original invoice total, lines, payments, refunds, dispute history and original paid proof. The invoice becomes `credited`, collectible balance becomes zero, and `paid_at` remains empty. Credit is separate from final cancellation; the refreshed cancellation review must still be confirmed.

Pending/processing money, incomplete refunds, retained refundable money, unresolved disputes/returns, unverified checkout closure, stale review, changed actor/payload, clean never-attempted cancellations and late non-refundable debt are denied this credit path. Clean cancellation retains its original guarded void path; paid late non-refundable cancellation retains the original paid invoice. Historical provider review is not waived.

## Implementation boundaries

- `supabase/review/firewood-live/accounting.sql` installs the isolated candidate accounting layer. It asserts an empty existing handoff set; a future installer cannot silently backfill old records. New issuance is server-generated and immutable. A composite foreign key binds each credit to the exact source, order, invoice and full accepted principal. API roles cannot write the private ledger.
- Two source-pinned original routines receive narrow managed-Firewood dispatches: `public.reconcile_invoice_balance` and the accepted-invoice branch of `app_private.reconcile_outbound_delivery`. Ordinary branches remain exact. The shared five-argument payment-state resolver, original void/collection transactions and all 102 migration source files are preserved. Owners, grants and RLS remain unchanged.
- The scoped reconciliation derives collectible balance from original total minus real net principal minus the audited credit. Credits never count as payment, payment date or paid-invoice count. Reminder cancellation uses an explicit accounting-credit reason. Genuine late payment evidence remains recorded, credited debt cannot reopen collection, and office refund review prevents premature final cancellation.
- `reporting-accounting.sql` retains the original gross invoice in its original period and posts a separate negative credit row on the credit creation date. It does not rewrite an earlier reporting period. AR uses the correctly derived collectible balance. Payment/refund reports stay separate. Its gated read helper reveals no private table rights.
- The office UI shows issuance, actual money/refunds, credit and amount owed separately. Credit requires a reason and explicit confirmation. Customer credited state requests no further payment and explains that the credit is separate from any refund.
- The new lifecycle/accounting wire is explicitly **`firewood-office-live-v2`**, with `/api/integrations/firewood/live/v2/office/{price-request,price-status,order-status}` and a distinct signing namespace. It carries a strict accounting object beside the original cash-settlement facts. Frozen live-v1 financial contract/profile/terms, shared settlement reducer and sandbox-v2 sources stay unchanged. Old office-v1 clients are not silently accepted as accounting-aware clients.

The accounting object contains exactly `issued_at`, `original_principal_cents`, `raw_balance_due_cents`, `credited_principal_cents`, `collectible_balance_cents`, `credit_id`. Raw debt describes the cash ledger; collectible debt includes the actual credit. A signed status cannot mislabel a credit as paid money or fulfillment-ready. Both runtime dependency loaders still return null; collection, surcharge reporting, sending and public workflow bindings remain off.

## Verification

| Check | Result |
| --- | --- |
| Native repair acceptance | 13 cases, 205 committed bounded operations, 228 identity checks on fresh local PostgreSQL17.11 with genuine Auth/profile/role predicates |
| Financial outcomes | Full/partial refunds, return, partial lost dispute, repeated reconcile, ordinary-draft control, eligible credit, exact retry, stale financial review, changed actor/payload, pending settlement/refund, unverified checkout denial, source-off history and actual authenticated reporting passed |
| Accepted outbound recovery | Actual no-send delivery-review repair after credit, repeated once, records one explicitly synthetic accepted delivery while retaining credited balance/status and empty paid date |
| Existing native concurrency | 13 scenarios and nine observed independent-session lock waits passed against the repaired schema |
| New accounting races | Three scenarios and two observed lock waits passed: same identity posts one credit/ack; late synthetic settlement stays recorded and held; late acknowledgement failure rolls back invoice, credit, workflow, event, audit and receipt effects, then exact retry posts once |
| Catalog security | Strict independent comparison passed:301→348 functions,138→148 tables; exactly ten protected private live tables and19 restricted public entry points; only explicit source-derived original deltas accepted |
| Recovery fence | 32 native fence checks with30 enrollment triggers across ten private tables; three report-helper access denials passed; no actual admission/certificate |
| Application | Strict accounting DTO/form/status tests and four canonical signed bridge→authenticated form→SQL cases passed; TypeScript noEmit passed |
| Broader regressions | Firewood/portal run passed444 checks initially; six server-only route cases required the correct react-server test condition, then the separate payment/outbound/manual/portal group passed296 with zero failures. Two/three explicit skips remain in their respective groups. These are overlapping groups, not an invented aggregate count. |
| Focused build | Node22.23.4/Next16.4.3 build and framework floor passed;17 exact allowlisted source updates,192 browser assets, zero private canaries and zero outbound attempts; worktree package and previous build proofs unchanged |
| UI | Desktop1324px and320px fixture-frame checks: no horizontal overflow, readable credited result and44px action targets; keyboard confirmation/action and retained error input/focus verified |
| Final lifecycle | All five owned test databases read back with source flags off, NOLOGIN nonoperator roles and ledger102; temporary probes removed. Final strict source/catalog check passed; cluster stopped, synthetic rows/evidence retained. |

Native records are fictional ledger fixtures, including refund/dispute/provider-receipt controls. No Stripe request, real refund, customer message, actual service credential, home scanner mutation, staging change, push or deployment was part of this work.

Two implementation issues were caught and fixed before completion: accounting timestamps needed canonical UTC inside SQL, and CREATE OR REPLACE VIEW needed explicit `security_invoker=true` to retain the original mode. The independent verifier rejected the latter; its protection was not relaxed. Initial fixture-driver failures and the original11-case failed-reporting proof remain preserved.

## Files and evidence

Core review SQL: `supabase/review/firewood-live/accounting.sql`, `reporting-accounting.sql`. Application changes are limited to new office accounting/contract/handler/form/projection/components and unavailable v2 routes, plus credited-status recognition/presentation in shared invoice/payment/customer types. No package or original migration edits.

Reusable tests: `scripts/verification/firewood-native-billing-repair-checks.mjs`, `firewood-native-accounting-concurrency.mjs`, extended source-bound `firewood-native-readback.mjs`, accounting fixture and focused application tests. Independent details: [native repair verification](FIREWOOD_ISSUANCE_BILLING_REPAIR_REHEARSAL.md), [accounting security](FIREWOOD_ACCOUNTING_SECURITY_REVIEW.md).

Evidence root: `/Users/noelsierra/Documents/Codex/2026-10-30/firewood-accounting-repair/`, with native target `target-28956add6ba1/`, focused-build source/proof, regression logs and final result manifest. UI evidence: `/Users/noelsierra/Documents/Codex/2026-10-30/firewood-accounting-ui/`. Private connection/password files remain outside the repository and must not be published.

## Remaining release work

The two financial blockers are resolved in the isolated candidate. **This is not approval to activate it.** Next, adapt and jointly retest the Website companion/customer flow against the verified office-v2 accounting contract; its frozen office-v1 customer proofs do not certify the new wire. Then reconcile/install only the reviewed inactive package, enroll all ten private tables in the actual write/schema/commit/truncate guards and paired off-device backups, obtain fresh five-minute recovery evidence, and verify real provider closure and surcharge capability before a separately authorized activation. Existing live CRM, scanner and production services remain unchanged.
