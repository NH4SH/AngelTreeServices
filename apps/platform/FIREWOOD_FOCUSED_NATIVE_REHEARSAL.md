# Focused Firewood native rehearsal

> Follow-up: the reproduced financial defects below were subsequently fixed and tested locally. See [issuance and billing implementation](FIREWOOD_ISSUANCE_AND_BILLING_IMPLEMENTATION.md). This earlier rehearsal remains the original failure evidence.

October 30, 2026. Follow-up to the inactive live-profile and office-workflow reviews. **The rehearsal is complete; activation remains blocked by financial issuance/reporting and historical billing closure.** No production, staging, scanner, provider, customer-email, credential, deployment, commit or push changes were made.

## Measured result

| Check | Result |
| --- | --- |
| Native installation | PostgreSQL 17.11, fresh development-Mac cluster, private Unix socket only; zero copied customer records |
| Business baseline | All 102 original migration files match the preserved manifest. Business schema rebuilt from that exact history. Review units applied outside the ledger; ledger remains 102. |
| Original boundaries | 301 original functions and 138 original business tables read back. Only the independently pinned payment-receipt matching clause changes an original function. Original financial guards, owners, ACLs, RLS, policies, memberships, defaults and role settings remain unchanged. |
| Focused objects | 37 live-profile functions plus the terms helper; nine private tables with owner-only table rights and RLS. Eighteen public entry points have exact role-limited grants. Source row absent on base installation. |
| Native concurrency | 13 cases passed; nine actual lock waits observed, using independent PostgreSQL sessions and genuine Auth/profile/role/employee records. |
| Billing safety | Eleven native cases completed with 147 target/safety checks and 109 bounded committed operations. Clean void, retained money, late cancellation and original financial guards behave correctly; the suite deliberately reports the issuance/reporting blocker below. |
| Existing regressions | 43 office SQL, security and signed-handler/form/SQL integration checks passed. |
| Native recovery fence | Separate guard clone: 30 behavioral checks; all nine new tables enrolled with admission, deferred-commit and truncate guards. This is synthetic guard evidence, not live enrollment or a five-minute recovery certificate. |

Concurrency covers duplicate preparation, actual offboarding versus approval, both approval/revocation outcomes, delivery-window changes versus cancellation, checkout creation and late acknowledgement, late settlement both before and after final void, refund-snapshot conflicts, and atomic rollback after an acknowledgement failure. Exact retries preserve one invoice and one acknowledgement. No actual provider, refund or message transport runs.

## Billing decision

**Do not activate the new Firewood ordering, collection or sender profile yet.**

1. **Issuance/reporting defect confirmed.** The candidate prepares an accepted invoice with status `sent` and no recorded delivery. If a full payment is later fully or partially refunded, returned, or affected by a lost dispute, the unchanged actual102 resolver can restore status `draft`; actual receivables then excludes the still-positive balance. The native $600 full-return examples and $300 remaining-balance partial-refund/lost-dispute examples retain their money history and office review hold but disappear from ordinary AR. Repeated reconciliation preserves this defect. An explicitly recorded synthetic delivery control returns the correct partially-paid AR state; ordinary unsent prepayments remain drafts. This is a reporting defect, not a successful accounting cancellation.
2. **Historical billing closure remains missing.** Fully refunded or previously attempted invoices cannot use the clean, never-attempted cancellation path. Actual102 has no approved credit-note/debt-release command. Those orders remain held for billing review, including terminal checkout history and unpaid late non-refundable cancellation. A paid late non-refundable cancellation may finish while preserving the paid invoice and money.

The next implementation should establish truthful financial issuance for this new profile separately from document delivery, then provide an audited, atomic and idempotent cancellation accounting adjustment for invoices with collection history. Preserve the original invoice, refunds, surcharge evidence, reports and retry identities. Neither operation may create another charge, refund or email.

Do not set `sent_at` during preparation merely to make AR pass: actual102 uses it for recorded document delivery, including explicit manual delivery or accepted outbound delivery. Do not zero a balance, invent payment/credit evidence, relax a void guard, or reject real refund/return reconciliation. A trigger-only draft-to-sent normalization also leaves existing RPC return values inconsistent because the original resolver returns its precomputed status. Any proposed correction must test both stored state and returned receipts across every affected path.

## Rehearsal provenance and limits

The local binary bundle was read from the existing native synthetic tooling; no home service or database was started, stopped or altered. Auth/Storage platform shapes came from a retained **schema-only synthetic** native dump. Its `public`, `app_private` and `private` business schemas and retained storage policies were removed only in the fresh rehearsal database before exact102 reconstruction. No old test rows, production data, secrets or provider bindings were restored.

Only the minimal document-terms unit and correct pinned102 receipt backport preceded `supabase/review/firewood-live/boundary.sql` and `office-workflows.sql`. The older combined sandbox rehearsal file was not applied as a unit. The base postimage was cloned separately for billing, concurrency and fence tests to avoid aggregate contamination. Access predicates were never replaced with test stubs. Native fixture helpers were corrected to reuse the actual employee record created by the original lifecycle trigger and seed actual business-role lookup rows.

All tests use explicit database name, fresh cluster identifier and synthetic database marker. The new cluster listens on no TCP address; all nonoperator database roles remain NOLOGIN. Test sources are off at completion, temporary fault artifacts are removed, and evidence/history is retained. The cluster is stopped after final readback. Both application runtime loaders remain null/off; canonical review SQL and original102 files remain unchanged.

The fence clone uses the retained actual admission/commit/truncate functions with a clearly synthetic lease, tests stale five-minute capture, holder/postmaster mismatch and topology invalidation, then clears the lease. This proves guard behavior only. Production enrollment of the nine new private tables, fresh paired database/object cloud recovery evidence, actual provider closure/surcharge capability and inactive customer-route integration remain distinct release gates. No authority or recovery certificate is granted by this report.

## Parallel customer-flow proof

The separately authorized Website chat also completed its local customer route and browser flow over the actual CRM handlers, fixed SQL adapters and authenticated office command. Its measured path covered a genuine synthetic office approval, explicit $570 acceptance, one invoice, same-invoice renewal, controlled SQL paid state and a cancellation hold, with 38 CRM operations and no provider/message calls. Its 46 companion/HTTP/browser-code checks and public build are separate evidence, not additional native cases. The full browser proof used a new private PGlite instance with a disclosed validator exception only for `checkout.invalid`; `other.invalid` remained rejected, and canonical SQL/native proof databases were unchanged. Customer UI or a synthetic paid fixture grants no activation or Stripe certification. Evidence: `/Users/noelsierra/Documents/Codex/2026-10-16/files-pasted-by-the-user-you/outputs/firewood-checkout/customer-flow-20261030/CUSTOMER_SQL_E2E_PROOF.json`.

## Evidence and changed files

Evidence root: `/Users/noelsierra/Documents/Codex/2026-10-30/firewood-native-rehearsal/target-6186e960daa2/`.

- `BOOTSTRAP_PROOF.json`, `FOCUSED_INSTALL_PROOF.json`, `READBACK_PROOF.json` and `NATIVE_SECURITY_ISOLATION.json` pin the fresh target, source units and catalog boundaries.
- `CONCURRENCY_PROOF.json`, `BILLING_PROOF.json`, `BILLING_FINAL_FLAGS_PROOF.json` and `GUARD_PROOF.json` retain measured outcomes. Billing proof intentionally has `hasReleaseBlockers: true`.
- Parent evidence directory holds `REGRESSION_PROOF.json` and `SOURCE_PRESERVATION_PROOF.json`.
- Final cluster/flag and preserved-data proof is `FINAL_REHEARSAL_STATE.json` alongside these proofs. Private connection files and passwords stay outside the repository and must not be published.

New verification runners: `scripts/verification/firewood-native-concurrency.mjs`, `firewood-native-billing-checks.mjs`, `firewood-native-readback.mjs` ; the private fence harness is `native-guard-check.mjs` in the owned evidence target. Detailed conclusions are in [billing closure](FIREWOOD_BILLING_CLOSURE_REHEARSAL.md) and [native security](FIREWOOD_NATIVE_REHEARSAL_SECURITY_REVIEW.md). No application feature or business SQL changed in this check-only batch. Existing worktree changes remain preserved.
