# Firewood office approval and cancellation workflows

Implementation and review, October 29–30, 2026. **The office workflows are implemented and verified locally. Activation remains off.** Production, the scanner, existing credentials, customer delivery history and backup operations were not changed. No hosted migration, commit, push, merge or deployment was performed.

## Office experience

The new `/admin/firewood/office` page follows the existing green-and-neutral CRM and is linked from Firewood for owners and administrators. It contains a paged list of website price requests and accepted orders, with one selected record. It does not display raw contract JSON, database roles, provider internals or test orders in the application.

- **Price approval:** read the customer's stored request, review quantity/stacking/contact/address, adjust wood and stacking prices, preview the total and record a reason. The 5% veterans helper applies once to wood plus stacking before taxes/fees and requires office eligibility confirmation. An unaccepted approval can be revoked; expiry and acceptance remain authoritative.
- **Delivery:** record an agreed start/end and the evidence of the customer's agreement. Inputs use Eastern time; missing and repeated daylight-saving times are rejected. A cancellation request freezes the window used for its policy decision.
- **Cancellation:** first request cancellation and place new collection and delivery on hold. Review the actual payment/refund status and accepted terms, then confirm only when the financial and accounting boundaries permit. The interface never implies that a local hold canceled an external Checkout or returned money.
- **History and recovery:** accepted prices/contact/terms remain immutable. Recent office events are shown in order; all events remain stored. Failed replies preserve form values and the same request identity. Pending state is immediate and duplicate submission is blocked.

The current runtime is deliberately unbound. The real page shows an honest inactive notice rather than fictional data or operational controls. Existing manual Firewood invoices remain available. Owners/admins are checked before any new office data is fetched or serialized; other internal roles do not receive these records.

## Genuine authority and atomic commands

Website submits a signed immutable draft containing only quantity, stacking and contact/address. It cannot supply its own price approval, actor, paid status or sending instruction. The office action rereads the trusted draft and uses the actual authenticated session, never an integration/service credential.

Database commands acquire the existing role-management lock before checking effective owner/admin access. Price approval binds the exact stored draft, prices, terms, actor, reason, expiry and one eventual invoice. Approval/revocation, delivery recording and cancellation use actor/operation/payload-bound request receipts. Exact retry returns the original result; another actor or changed payload cannot reuse the request.

The four new private office tables hold requests, lifecycle, immutable events and command receipts. They have RLS and no direct API-role rights. Source activation is not inserted or changed. The SQL remains in the separate review directory, outside both migration ledgers.

## Cancellation and billing decisions

| Case | Behavior |
| --- | --- |
| No delivery scheduled; early cancellation; Angel cancellation/cannot fulfill; declined Angel-requested reschedule | Full-refund eligibility under the accepted policy. Request time is recorded by the server, not backdated by the browser. |
| Customer cancellation less than 48 hours before the agreed window | Non-refundable under the accepted policy. The decision uses the recorded window and absolute 48-hour cutoff. |
| Open/creating/processing checkout, pending bank payment/refund, dispute, bank return or inconsistent ledger | Keep cancellation requested and collection/delivery held. Preserve late provider references, settlement and refund evidence. No assumed zero, automatic retry, provider cancellation or refund. |
| Full-eligible, never-collected order with **zero payment rows and zero checkout rows** | In the same cancellation transaction, use the **original 102-baseline `begin_invoice_void` and `finalize_invoice_void` commands**, then finalize the cancellation and acknowledgement. No provider closure is invented. The invoice's original amount and balance are retained, while void status removes ordinary collectible-debt treatment. |
| Any payment/checkout history with a positive invoice balance, including a fully refunded historical payment | **Billing closure required.** Keep the request held; do not weaken the original void restrictions, zero the balance, invent a credit or claim accounting closure. A proper accounting adjustment remains a separate release requirement. |
| Fully paid late non-refundable cancellation with zero outstanding balance | May finalize cancellation while retaining the paid invoice and all money/history. No refund or financial rewrite. |

The only new live-specific void permission requires a full-eligible cancellation request, empty money/attempt history and the matching owned, active, finalizing original void lease. The original financial guard functions remain unchanged and still run. Missing prerequisites stop installation/confirmation. A failure after the real void rolls back invoice status, pending-reminder cancellation, leases, activity, workflow history and acknowledgement together.

No workflow sends a customer email, initiates a Stripe refund, fabricates checkout reconciliation stamps or creates replacement debt. Refund and accounting cases remain deliberate office work.

## Customer-system coordination

The previously reviewed live contract/profile/customer-terms modules and frozen sandbox/staging v2 files remain unchanged. The new extension is explicitly `firewood-office-live-v1`, with a separate HMAC domain and three default-closed paths under `/api/integrations/firewood/live/v1/office/`:

- `price-request`: immutable draft registration; no price/actor/payment authority.
- `price-status`: minimal bound approval and price outcome, with expiry/revocation.
- `order-status`: financial truth plus mandatory order state and workflow revision.

The complete financial snapshot hash includes lifecycle state/revision. The observation version advances when a hold changes, including when payment remains paid. A held order cannot fulfill or reopen payment. The old financial-only status path refuses workflow-managed ledgers, preventing a silent protocol downgrade.

The separate Website companion preserves its prior reviewed implementation. It requires fresh lifecycle evidence before payment/fulfillment, rejects stale/backward observations and retains same-invoice recovery after an uncertain preparation reply. Its current scope is internal adapters/store methods; customer browser routes, session/UI entry and confirmation/outbox wiring are **not installed or enabled** by this work.

## Verification

- **743/743 focused checks passed across 28 files**, with source hashes stable during the final run. This includes existing card/bank/portal/terms/Firewood regressions, 14 owned office SQL tests, 26 independent security checks, 15 UI tests and three root integration checks.
- The root integration executes the actual signed bridge/handler, fixed native adapter, authenticated form command and SQL against in-memory PostgreSQL. It proves genuine 5% approval, one invoice/replay, office read models, cancellation holds, truthful paid money and pending-refund handling. Positive SQL contacts are fictional company-domain addresses in memory; ordinary live contact guards are not relaxed. `.invalid` contacts remain in explicit parser/UI fixtures.
- Seven original financial/collection guard definitions match the retained actual 102 definitions. Tests cover clean voiding, missing prerequisites, unchanged money/amounts, late provider evidence, full-refund billing holds and atomic rollback after a late acknowledgement failure.
- Actual desktop and 320-pixel mobile checks covered keyboard, error, pending, empty/inactive and cancellation-hold states. They found and fixed delayed React pending feedback, form auto-reset after an error and a mobile action overlap. The final invoice-void wording branch received a targeted unit check after the bounded browser review. Preview servers/tabs were stopped/closed.
- Typecheck and isolated app builds passed without real credentials, outbound requests or private browser canaries. The worktree uses its existing Next 16.4.2; a separate focused-source check uses Next 16.4.3, preserving the production framework version and excluding unrelated main changes. The focused office page uses the existing invoice navigation/back link rather than importing main's entire manual Firewood module.
- Compiled local HTTP checks keep both the existing live and new office paths unavailable with no-store responses, including with activation-looking environment flags. No runtime admission was installed and the temporary server was stopped.
- The Website reports **34/34 new-companion and retained-live checks**, plus its public build. Its actual companion wrapper/client → actual CRM handler proof uses a disclosed in-process CRM operation double, one $570 accepted invoice, 27 operations and zero network/provider/message calls. It is not a claim of actual CRM SQL, native concurrency or hosted customer-flow verification.
- Main and the local base remain aligned at `f79f875004bca20bb9a1cd0432871d4c0dbe1853`. No earlier worktree/capsule was reset or replaced.

Evidence: `/Users/noelsierra/Documents/Codex/2026-10-29/firewood-office-workflows/`, including `TEST_PROOF.json`, `BUILD_PROOF.json`, `FOCUSED_BUILD_PROOF.json`, `OFFICE_WIRE_PROOF.json`, `PRESERVED_LIVE_WIRE_PROOF.json` and `ui/UI_PROOF.json`. Independent findings are in [the security review](FIREWOOD_OFFICE_WORKFLOW_SECURITY_REVIEW.md). The Website companion report is under `outputs/firewood-checkout/office-workflow-companion-20261029/REPORT.md` in its existing workspace.

## Remaining release gates

The October 30 [focused native rehearsal](FIREWOOD_FOCUSED_NATIVE_REHEARSAL.md) completed the exact102 schema/permission comparison, 13 concurrent-session cases with nine observed lock waits, and 30 isolated write-fence checks. It found an issuance/reporting release blocker; this replaces the earlier unverified native-rehearsal gate.

1. Correct the new profile's financial issuance contract separately from actual document delivery. After returned/refunded payment, actual102 can classify its positive-balance invoice as draft and omit it from AR. Do not fabricate `sent_at`, weaken the original resolver, or normalize only the stored status while returning a conflicting RPC receipt.
2. Reconcile historical refund/credit accounting before permitting public cases that require it. Do not activate a workflow that claims fully refunded positive debt is closed. Preserve original void restrictions and retained financial evidence.
3. Install only reviewed inactive dependencies and complete customer-side Website route/session/UI and source-aware outbox wiring. Bind only the new lifecycle-aware companion/worker; no old-client or cached-paid fallback. Verify actual provider closure, permissions and surcharge support separately.
4. Enroll **all nine new live private tables** (five prior live profile plus four office tables) in actual schema/write/commit/truncate guards and paired off-device backups. Derive a new source/schema seal and fresh five-minute recovery certificate before any runtime admission. Old certificates cannot cover the new topology.

Recommended next step: truthful issuance/reporting for the new profile, followed by retained-money accounting closure and continued customer-route integration. Rehearse both changes against the same exact102 native baseline before any release. Public ordering, collection and sending remain off.

Design tooling reported an existing stale metadata sidecar. It was left untouched; `/impeccable document` can refresh that separate design reference later.

## October30 accounting follow-up

The [issuance and historical billing closure implementation](FIREWOOD_ISSUANCE_AND_BILLING_IMPLEMENTATION.md) resolves the first two financial gates locally. The remaining work is Website office-v2 adaptation/joint verification and inactive installation with actual ten-table guard/recovery enrollment. Previous native failures and proofs are retained; production/runtime admission remains off.
