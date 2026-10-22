# Customer change-order response outcomes and accessibility

Verified October 22, 2026. Customer entry recovery (`72b2c21`) was pushed to main through merge `d3d30da`, preserving the concurrent public-site layout update `f99530e`. This follow-up is local, based on that main, pending a separate push/release request.

## Result

Customers receive clear approval, requested-change and decline confirmations with the next step. A successful response cannot display an error from an earlier approval attempt. Copy describes a saved response rather than promising that an email was delivered.

The action area retains the existing green-and-neutral document design. Approval remains primary; the alternative response form explains the required change-request message and optional decline reason. Visible fields have explicit labels, associated help/error descriptions, 16px text, and decision buttons at least 48px high. Error and outcome regions receive keyboard focus after an interaction and announce their contents. Fresh closed-page arrival does not steal focus.

Both forms share an immediate submission guard. Saving disables all decision buttons, announces progress and names the active action. Explicit submit handlers capture the correct submitter and dispatch outside React's form transition so pending feedback renders immediately. Controlled fields also capture submitted values, retaining wording/name on errors, including a submission replayed during hydration. Intentional page refresh starts a fresh review; this is not a new persistent message-draft feature.

Known business rejections offer **Refresh and review this addition**. Unconfirmed results explain that a previous click may have saved, preserve the existing retry identity and offer **Check current status**. Non-business transport errors use customer-readable recovery copy. A thrown transport error cannot retain a previous rejection flag.

The client confirmation stays mounted during server revalidation, fixing lost keyboard focus when the saved status replaces the form. Fresh server closure takes precedence over an older action receipt, including cancellation. Closed records remain non-interactive.

## Preserved boundaries

No database migration, policy, grant, approval transaction, financial behavior, link generation/revocation or permission boundary changed. The same server actions and installed capability/version/review-digest commands authorize every response. The only added action-state field is optional presentation metadata, `responseOutcome`, returned after receipt validation and durable event handoff.

Original request UUIDs, payload hashes, reviewed timestamps, approval review hashes, rejection cleanup and replay semantics remain intact. Session storage still contains only hashed/opaque attempt metadata, never raw capabilities, names or messages. Messages/names are kept in page memory, not newly persisted. The shared reliable-action hook is unchanged.

Email deduplication, source-event recovery, audit retention and scope application are unchanged. Verification used synthetic `example.invalid` records with automated sending disabled and no real provider credentials. No production data, credentials, service configuration or deploy was changed.

## Verification

- **2,342 CRM checks:** zero failed/skipped. Includes 14 new outcome/interaction/action tests and existing approval, source-event, link and retry regressions.
- Final `npm run typecheck` and isolated optimized `next build` passed. The preview and build match the final application source digest in the accompanying verification JSON. This repository has no separate lint command; `git diff --check` passed.
- Nine installed-command scenarios ran in both the owned disposable local database and staging `gbyhdsuiqeslgjdnbqng`: approval, changes, decline without a reason, stale review, revoked token, expired token, cancellation, short message and wrong-party token. Each confirmed case was replayed using its original request and returned the same source receipt. Rejections created no audit, note, scope or source event. Approval created one scope item; requested changes created one note; each saved decision created one audit and one event.
- Anonymous record access and anonymous/authenticated execution of the service-only commands remain denied. Existing business, financial, Auth/session, role, receipt, note, scope, communication and history rows, settings, command definitions, principal routine and migration ledger were identical before/after each rollback. Both targets remain at 116 migrations, latest `20261022194856`.
- Staging command receipts were fed through the actual action mapping and React rendering with controlled adapters (10 TAP checks per target). **This does not claim a deployed staging browser test**: the app was not deployed. Actual browser interactions ran only on the isolated local preview.
- Real local browser: keyboard approval and change request; invalid-message recovery; decline without a reason; fresh closed-page arrival; stale-review refresh; temporary failure/retry; lost reply after commit/retry; visible pending/disabled state and focused confirmations. A guarded loopback proxy discarded a successful response after commit, then held the retry to inspect pending controls. Both requests retained the same UUID, reviewed version and payload; database inspection found one final audit/event/note.
- Sizes 1280, 768, 390 and 320px: no horizontal overflow; visible response fields at least 44px high and buttons at least 48px. Input/help text is 16px, high-contrast incumbent foreground colors are retained, keyboard outlines are visible, browser warning/error logs were empty. Mechanical design scan: zero findings.
- Staging advisor output is unchanged: 33 existing [RLS policy notices](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), 79 existing [authenticated function warnings](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), and one existing [leaked-password protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). These baseline findings were not changed or resolved by this UI work.

## Files

- `src/components/portal-change-order-actions.tsx` and scoped CSS: forms, pending/recovery/confirmation behavior and accessibility.
- `src/app/portal/change-order/[token]/page.tsx`: stable response boundary across closed-state revalidation.
- `src/lib/portal/change-order-response-outcome.ts`: confirmed-result presentation selection.
- `src/lib/action-states/change-orders.ts`, `src/lib/actions/change-orders.ts`: receipt-confirmed outcome metadata and recovery wording.
- `tests/change-order-response-outcomes*`: structural/action tests, rollback receipt adapter and React integration acceptance.
- `../../supabase/verification/change_order_response_outcomes.sql`: rollback-only synthetic installed-command verification, not a migration.
- This report, `CUSTOMER_EXPERIENCE_REVIEW.md` and `staging/CHANGE_ORDER_RESPONSE_OUTCOMES_VERIFICATION_20261022.json`.

## Evidence and remaining work

Private evidence: `/Users/noelsierra/Documents/Codex/2026-10-22/change-order-customer-responses/`. Capabilities, synthetic fixture indexes and logs remain outside Git. Representative screenshots: `before.png`, `after-open-desktop.png`, `approved-desktop.png`, `changes-mobile.png`, `declined-mobile.png`, `stale-mobile.png`, `lost-response-tablet.png`, `pending-tablet.png`, `retry-success-tablet.png`, `open-320.png`.

The test preview/proxy and owned database were stopped after verification; volumes and evidence were retained. The existing development app and unrelated work were preserved.

Next customer priority: apply the same response acceptance and accessibility checks to proposal approval/change requests. The historical review's small document metadata/amount hierarchy, business wording reconciliation, real screen-reader/device acceptance and mailbox-client acceptance remain separate follow-ups. This pass is not a full accessibility certification, payment/provider test or production release.
