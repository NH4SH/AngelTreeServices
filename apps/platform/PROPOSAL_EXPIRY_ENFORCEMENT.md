# Proposal-expiry enforcement

Verified October 22, 2026. Implemented on `codex/proposal-expiry-enforcement`, including main through `3fbc40a` and its concurrent public-site mobile improvements. The prior customer-branding work and production dashboard hotfix are preserved. This batch is local and unreleased: no push, application deployment, production query/write, email send, credential or hosted-setting change occurred.

## Behavior and transaction boundary

New staff and customer approvals now reject a non-null `quotes.expires_at` at or before database wall time. The plain rejection is: “This proposal has expired. Contact our office for an updated proposal.” Capability-token expiry remains a separate security condition.

Migration 117, `20261023015338_enforce_proposal_expiry.sql`, patches the existing locked approval core at two checked anchors. The first guard runs after the parent, quote and customer-token lock waits, existing authorization/token/version gates, and committed-result recovery. The second runs immediately before saving a new approval, so a deadline crossed during tentative work-order/material creation rolls back that work too. Both use `clock_timestamp()`, rather than transaction-start time. Rejected attempts retain the quote, linked work, token, audit history and durable source events.

The patch retains the function's identity, settings, grants, existing lock order and writes. It fails if either expected anchor has changed or only one guard is present; reapplication with both guards is harmless. It does not rewrite RLS, approval transactions, financial calculations, saved terms, source-event preparation or delivery deduplication.

An approval already committed remains recoverable after the proposal deadline, with the same work order, acceptance timestamp, audit and source event. Existing token expiry/revocation/party and staff effective-access checks still apply to recovery. Historical `approved` records missing their original approval revision retain their existing repair path. Future and undated proposals keep their existing behavior. No new 30-day deadline or end-of-day interpretation is inferred for records; the stored timestamp is authoritative.

## Customer page

Open proposals with a past stored expiry render “Proposal expired,” retain the document, amount, scope, valid-through date and print control, and offer current-document/office help without approval or change-request forms. Approved, declined and cancelled outcomes retain their existing meaning. A confirmed response saved before the deadline is not overwritten by the browser's later clock.

The existing customer document layout, branding, response confirmation, focus handling and recovery controls remain intact. The page evaluates expiry on load/render, without a new background timer. A page held open across its deadline is protected by the database command; an action result/rerender then shows the closed outcome. Browser clock presentation does not authorize acceptance. This batch does not rewrite the existing change-request transaction or its saved receipts.

## Verification

| Check | Result |
| --- | --- |
| Full CRM unit suite, Node 22.23.3 | 2,379 passed; zero failed/skipped |
| Focused expiry/approval/outcome checks | 37 passed |
| Native independent-connection concurrency suite | 4 passed; zero failed/skipped |
| Real installed-schema local rollback assertions | 30 passed |
| Real installed-schema staging rollback assertions | 30 passed |
| Isolated route type generation, TypeScript and optimized Next build | Passed |
| Final application-source parity and whitespace check | Passed |

Native concurrency checks held the linked job lock in one connection while customer approval waited in another. Proposal expiry during the actual wait rejected the approval without side effects. The existing token-expiry-after-wait rule also held. Two simultaneous customer approvals produced one work order, approval audit and source event. An installed-schema synthetic trigger delayed tentative job creation across the proposal deadline; the final guard rolled everything back.

Rollback verification exercised staff/customer approval for past, future and null deadlines; committed-result replay; legacy approved-record repair; stale revision; crew/disabled-owner access; expired, revoked and wrong-party tokens; and anonymous/authenticated RPC privilege boundaries. These tests used actual installed command definitions, Auth/effective-access data and synthetic actors. They do not constitute an exhaustive audit of every RLS policy.

The actual local customer pages were inspected at 1280px desktop and 390px mobile widths. Expired pages had no approval/change forms and no horizontal overflow; current-document and office phone links remained available, and keyboard Tab reached the phone link with visible focus. Future/undated pages retained both decisions; a saved approval with a past deadline remained approved. Browser error log was empty. No contractual browser confirmation was submitted, no provider was called, and full screen-reader/device certification is not claimed.

## Isolation and release status

Staging target: `gbyhdsuiqeslgjdnbqng`. The candidate migration and all synthetic verification writes were enclosed in one rollback transaction. Before/after staging fingerprints matched (`e488a14c913e077f8f3855c0ff25bea9`), including the original approval definition SHA-256 `36084c2a32e363ccc5d2fec8e6d2b2e0f25c0debcf7db18de619c155e827d2ef`. Staging remains at 116 migrations, latest `20261022194856`; migration 117 is listed as deferred, pending a separate targeted staging installation/reconciliation. No hosted staging app was deployed or exercised with the new UI.

Staging advisor findings are unchanged: 33 RLS-enabled/no-policy notices, 79 authenticated security-definer executable notices and one leaked-password protection warning. This batch does not resolve that baseline or broaden access.

Local acceptance reused only the retained `ats_docmail_30e1592cbeea` disposable stack (API 60421, isolated preview 3187). Its original approval routine was restored and the 116-entry ledger verified before stopping that stack. Task-created synthetic operator accounts were disabled. Its volumes, audit evidence and unrelated local services were preserved. The temporary browser tab and preview were closed.

## Files and evidence

Application changes: `src/lib/portal/customer-states.ts`, `src/lib/portal/proposal-response-outcome.ts`, `src/components/portal-quote-actions.tsx`, and `src/app/portal/quote/[token]/page.tsx`. SQL: migration 117 and `../../supabase/verification/proposal_expiry.sql`. Tests: the existing quote-approval suite, new `tests/proposal-expiry*` and the historical staging-candidate inventory assertion. `../../supabase/staging/deferred-migrations.json` records the candidate digest without changing earlier migration hashes. Machine-readable results: `staging/PROPOSAL_EXPIRY_VERIFICATION_20261022.json`.

Private evidence is in `/Users/noelsierra/Documents/Codex/2026-10-22/proposal-expiry/`: `unit-final.log`, `targeted.log`, `native-concurrency.private.log`, `local-native-proof.json`, `browser-proof.json`, `cleanup-proof.json`, build/typecheck logs and synthetic screenshots `expired-desktop.png`, `expired-mobile.png`, `approved-after-expiry.png`. Raw capabilities, local credentials, fixture indexes and detailed logs remain outside Git.

## Next step

Perform the targeted staging-only installation/reconciliation for migration 117, then verify the permanently installed command and ledger without deploying the app. The remaining customer wording work is still the existing terms-consistency follow-up: decide per-record payment/debris precedence, due dates, penalty/warranty wording and the meaning of missing proposal expiry before changing those defaults. No business policy decision or automatic email change is bundled here.
