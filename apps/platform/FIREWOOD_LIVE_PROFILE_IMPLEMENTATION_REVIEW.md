# Firewood live profile: implementation and review

Follow-up: the inactive office approval/cancellation implementation is now documented in [the office workflow review](FIREWOOD_OFFICE_WORKFLOWS_REVIEW.md). Its guarded clean-invoice void and explicit historical-balance holds supersede the earlier office-workflow TODO below. The original phase evidence and activation restrictions remain intact.

Reviewed October 29, 2026. **Accept the separate inactive implementation. Do not activate it yet.** The CRM and Website now share an executable live wire contract, immutable customer wording and a tested invoice handoff. The current production release, scanner, credentials, workers, financial history and recovery system were not changed. No migration, deployment, commit, push or key rotation was performed.

This completes the local live-profile implementation/review scope. It does **not** complete a production installation, provider activation, office workflow or new recovery certification. The runtime dependency factory deliberately returns null; all three compiled live routes return `503 handoff_unavailable`, even when environment flags are set. The source creates no Stripe client or email transport.

## What is implemented

| Area | Result |
| --- | --- |
| Separate identity | New `firewood-invoice-handoff-live-v1` contract, `website_firewood_invoice_live_v1` source, `ats_firewood_live_v1` logical environment, live merchant pin, signing domain and `/api/integrations/firewood/live/v1/{prepare,status,renew}` paths. Actual database, release, credential and recovery bindings remain null. |
| Prices and acceptance | Half/full/two cords at $300/$450/$840; delivery included; stacking $150 once per delivery. All six totals are tested. Accepted household use, address, contact, quantities, prices, complete terms and payment policy are immutable. Ordinary HTTP rejects sandbox contacts. |
| Real office authority | A signed Website assertion cannot authorize a changed price. Separate authenticated effective owner/admin approval and revocation commands bind the exact proposed order, actor, reason, expiry and single invoice. They serialize with employee access changes before authorization. Service integration credentials cannot issue approvals. |
| Atomic preparation | One accepted order produces one invoice, lines, capability, mapping and audit entry in one transaction. Contact/address ambiguity requires review; existing records are not overwritten. Exact replay returns the same invoice. Numbering is `INV-FW-<complete uppercase order UUID>`. |
| Link recovery | Short-lived encrypted capabilities renew on the same invoice with versioned idempotency. Revocation requires review. A retry does not create replacement debt. |
| Financial status | Complete ledger reads and compare-and-set observations include payments, attempts and pending refunds. Original paid evidence is retained through refunds/disputes/returns. Browser returns, preferences and processing bank payments cannot authorize fulfillment. |
| Payment boundary | Live markers cannot fall through to ordinary invoice collection. The candidate validates exact source/account/mode/invoice/terms and fee arithmetic; actual collection remains unavailable. Existing Stripe receipt/apply/recovery transactions and sender ownership are preserved. |
| Customer wording | Full displayed clauses are included in the acceptance hash. Delivery timing, stacking access, 48-hour cancellation exceptions, household use and office-approved veterans pricing use the reviewed wording. Existing invoice/proposal terms are preserved. |
| Database boundary | Five independent private tables, RLS and revoked direct API rights; six service-only integration commands and two authenticated office commands. SQL remains outside both migration ledgers and requires an explicit isolated-review opt-in. |

The final terms hash is `b58eaaea481bfd1aecf509ef940a8f0bc135f7db4446784533cb3b588c6ac482`; the payment-policy hash is `201c6523787fd3e2289843f51e63b1726b85a5fc2978cbae15acf870e79cdad3`. The Website's contract, profile and displayed-terms modules matched the CRM bytes in the joint check. There is no new recovery permit or authority format.

## Review corrections

The independent review found an office-authorization race: checking access before waiting could allow an offboarded actor to continue. Approval/revocation now take the existing role-management lock first. Preparation and approval also follow the same order-lock-before-approval-row-lock sequence to avoid an inversion. Native simultaneous-session confirmation remains required.

The first proposed terms hash covered structured policy but not all displayed wording. It now covers the full frozen clauses, and the renderer imports that same data. Notes permit ordinary line breaks/tabs without permitting control characters in names or addresses. Strict receipt schemas reject contact, token-storage and provider metadata leakage.

Accepted live invoices cannot be changed or generically voided independently of their Website order. This prevents divergence, but it also means a coordinated cancellation/refund office workflow must be supplied before public launch. Existing legacy and sandbox behavior is unchanged.

## Verification

- **685/685 focused checks passed** across 24 files, including the existing card, bank, portal, terms and Firewood suites. Final source hashes stayed stable throughout the run. No provider credentials were supplied.
- The SQL suite executes the candidate in in-memory PostgreSQL. It tests authorization/ACL/RLS, trusted approval/revocation/expiry, rollback, the six principals, same-invoice replay/renewal, pending-refund CAS and immutable paid evidence. A real signed handler → native adapter → SQL test covers unpaid → paid → pending-refund outcomes.
- Coexistence tests preserve all 13 frozen v2 routine definitions/ACLs, old constraints and source rows. Four frozen contract/config/handler/staging-profile modules also match the previous sealed capsule byte-for-byte.
- Typecheck and isolated builds passed. The worktree build used its existing Next 16.4.2; a separate focused source build used **Next 16.4.3 / Node 22.23.4**, matching the production framework version. The focused overlay adds only the new candidate and narrow terms/collector guards, preserving the old focused source rather than copying main's broader terms rewrite. Both builds made zero outbound requests and exposed zero private canaries in browser files.
- The actual Website isolated client → actual CRM handler check passed preparation/replay/renewal/status with one invoice, synthetic contacts and no sockets/providers/messages.
- The Website reviewer subsequently reported **47/47 checks passed**: 16 new live-profile integration checks and 31 retained sandbox/staging checks. Its bounded screen review covered desktop, 320-pixel mobile, 200% text scaling, multiline instructions, held collection and paid/pending-refund/full-refund outcomes. It retained one confirmation and two held customer/owner outbox items, with zero sends. The reviewer closed its preview and ephemeral database. These are Website-owned results; the CRM independently verified the shared wire compatibility above.
- Compiled focused-source HTTP checks confirmed all three new live paths return 503/no-store, including with activation-looking environment flags. The temporary loopback server was stopped.
- Read-only service checks observed the existing hosted staging gate returning 401/no-store and current production health returning 200. **The new profile was not deployed to hosted staging**, and these observations do not certify a hosted live installation.
- Base HEAD and remote main both remained `f79f875004bca20bb9a1cd0432871d4c0dbe1853`. Prior local work remains intact; no branch was reset or merged.

Evidence is under `/Users/noelsierra/Documents/Codex/2026-10-29/firewood-live-profile-review/`: `TEST_PROOF.json`, `BUILD_PROOF.json`, `FOCUSED_SOURCE_PROOF.json`, `FOCUSED_BUILD_PROOF.json`, `JOINT_CONTRACT_PROOF.json` and `HTTP_PROOF.json`. They contain no credentials. The old sealed capsule was preserved separately and was not relabeled as live-ready.

## Required next implementation and release checks

1. **Complete the office workflows while still inactive:** wire the genuine price approval/revocation commands to the existing authenticated office boundary; provide coordinated cancellation/order-state/refund review. Keep refunds deliberate and preserve delivery/payment history. The SQL entrypoints alone are not a customer-facing workflow.
2. **Rehearse a disabled installation on the exact focused 102 baseline:** apply only the reviewed terms prerequisite, narrow payment-ID receipt repair and new live boundary; verify actual owners/ACLs, legacy records, financial guards and concurrent offboarding/prepare/revoke/renew/refund sessions. The current PGlite fixture is not this proof. Do not run all 129 main migrations or change the production framework version.
3. **Bind the real live transport and provider boundary:** verify account/key ownership, required permissions, dedicated surcharge support/eligibility, existing single Stripe receiver, source-aware office/customer messages and Website session/CSRF/outbox recovery. The new sender flag is metadata for the inactive source, not an independent enforcement layer already wired into existing email workers. Do not enable collection based only on these arithmetic tests or flags; never fall back to omitting surcharge validation or using another collector.
4. **Derive and verify the new paired recovery topology:** enroll the five new private tables in the existing write/commit/truncate guards, read back actual schema/source/permissions, assign real private bindings and obtain fresh independent off-device Website/CRM evidence within five minutes. Old certificates cannot admit this new topology. Only a later reviewed installation/activation should replace the null loader.

Recommended next step: implement the office approval and coordinated cancellation adapters, then run the focused disabled native rehearsal with the Website. Public ordering, collection and sending remain off until the actual release gates pass.

Related: [independent security review](FIREWOOD_LIVE_SECURITY_REVIEW.md), [102 compatibility review](FIREWOOD_LIVE_102_COMPATIBILITY_REVIEW.md), [SQL boundary and rollout notes](../../supabase/review/firewood-live/README.md).
