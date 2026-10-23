# Proposal response outcomes and accessibility

Verified October 22, 2026. The previous change-order response batch, `946ae0b`, is pushed to main. This follow-up includes that main and remains local, pending a separate push/release request.

## Customer behavior

Proposal approval and requested changes now have clear saved outcomes and recovery links. Requested-change copy confirms a saved request; it does not promise email delivery or imply approval. Current closed status wins over an older action receipt, including a change request replayed after approval. Cancelled, declined, expired, approved and unknown closed states have no decision forms. A change-requested proposal still offers the existing ability to review and approve its current version through a native disclosure.

The interface keeps the existing document design, amount, status, validity, work summary, full-scope anchor, printing and office help. Both decisions share an immediate submission guard. Saving names the active action, disables both buttons and announces progress. Direct submit handlers dispatch outside the React form transition so the saving state appears immediately.

The message field has an explicit label, visible 3–1,000 character guidance, associated error/help descriptions and controlled wording retained after failures. Submissions also capture their wording before asynchronous work, preserving replayed input. The change form now has a React function action: early submissions use React's replay path rather than a plain POST that can reload the page and lose the request before hydration. Required/minimum/maximum validation and authoritative server validation remain in place.

One focused error region describes the current attempt, avoiding competing old approval and change-request errors. Known business rejections offer **Refresh and review this proposal**. Unconfirmed outcomes preserve the existing attempt and offer an exact retry or **Check current proposal status**. Thrown transport errors clear stale rejection presentation flags without claiming a rollback.

Error and outcome regions are announced and receive keyboard focus after interaction. Fresh closed-page arrival does not steal focus. Form controls/help are 16px; buttons measure about 51.6px high and disclosure summaries about 45.6px. The scoped forest focus outline has 13.91:1 contrast against its surface; helper text has 6.75:1, calculated from computed browser colors.

## Preserved safeguards and narrow functional changes

The installed approval/change-request transactions, RLS, service-only RPC grants, party/token/revision checks, financial calculations, work-order creation, audit history and durable source-event/delivery deduplication are unchanged. No migration or schema change is required. No new customer response capability was added.

Approval continues to send the token hash and the version actually reviewed. The existing change-request UUID, message digest, original revision, replay rules and storage cleanup remain intact. Session storage contains opaque retry metadata, not the capability or message. The shared reliable-action hook is unchanged.

The shared approval workflow adds optional **rejected** presentation metadata for known transaction errors and uses generic recovery copy for unconfirmed backend errors. The portal action passes this flag to its UI. It does not fetch a newer revision, retry automatically, change authorization, broaden grants or perform additional mutations. Existing staff approval tests remain green. Success and source-event handoff still require the original validated receipt.

## Verification

- **2,359 CRM checks**, zero failed/skipped, including 17 new outcome/form/action tests and all existing approval, retry, link, source-event and payment regressions.
- Final `npm run typecheck` and isolated optimized `next build` passed. Preview/build application source digests match the final source. No separate lint command is configured; `git diff --check` passed. Mechanical design scan: zero findings.
- **14 installed-command scenarios on local and staging**: approval, changes, a change-request replay after later approval, stale approval/changes, revoked-token approval/changes, expired-token approval/changes, cancelled approval/changes, wrong-party approval/changes and a short message. Exact approval retries retain one work order; exact change retries retain one note and source event. The later-approval case retains approval and does not reopen the quote or duplicate its earlier request.
- Anonymous document enumeration and anonymous/authenticated direct command execution remain denied. Real notes are joined to their receipts for acceptance counts. Rejected commands create no relevant history, note, event or work order.
- Staging `gbyhdsuiqeslgjdnbqng` and local stay at 116 migrations, latest `20261022194856`. All writes from the 14-case command transactions rolled back. Browser fixtures were committed only in the owned disposable local database and retained there for evidence. Before/after fingerprints match for business/financial records, notes/material plans/work orders, Auth/session and role rows, communications, settings, command definitions, principal routine and ledger. Both staging email switches remain disabled.
- The installed local/staging receipts passed through actual action/workflow mapping and React rendering with controlled adapters (15 TAP checks per target). **No staging app was deployed.** These are staging database/command checks plus adapted renderer acceptance, not a claim of hosted staging browser verification.
- Actual isolated local browser: keyboard approval/change requests, focused confirmations/errors, native disclosure keyboard operation, whitespace validation, retained 922-character wording, temporary failure/retry, stale approval/change rejection, refresh recovery and fresh cancelled-page arrival. Both lost-response paths discarded a successful RPC reply after commit, held the retry to inspect loading/disabled controls, then recovered the original result. Repeated changes retained UUID/revision/message; repeated approvals retained the reviewed revision and work order. Final database inspection found one relevant audit/source event per saved decision.
- Widths 1280, 768, 390 and 320px: no horizontal overflow. Browser warning/error log was empty. These checks do not constitute full screen-reader, zoom, physical-device or accessibility certification.
- Production/staging published Netlify deploy IDs and production build linkage are unchanged. No real email/provider calls, production writes, deployment, key/configuration changes or scanner changes were made.

Staging advisors remain the existing baseline: 33 [RLS policy notices](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), 79 [authenticated function warnings](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), and one [leaked-password protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). This UI batch does not alter or resolve that baseline.

## Files and evidence

Changed application files: `src/components/portal-quote-actions.tsx`, its scoped CSS, `src/lib/portal/proposal-response-outcome.ts`, `src/lib/actions/portal-tokens.ts` and `src/lib/quotes/workflow.ts`. Tests are in `tests/proposal-response-outcomes*`; rollback verification is `../../supabase/verification/proposal_response_outcomes.sql`. The machine-readable summary is `staging/PROPOSAL_RESPONSE_OUTCOMES_VERIFICATION_20261022.json`.

Private evidence: `/Users/noelsierra/Documents/Codex/2026-10-22/proposal-response-accessibility/`. Capabilities, fixture indexes and detailed logs remain outside Git. Representative screenshots: `before-desktop.png`, `before-mobile.png`, `after-desktop.png`, `after-mobile.png`, `changes-desktop.png`, `verified-approved-desktop.png`, `retained-error-mobile.png`, `lostChanges-pending.png`, `lostApproval-pending.png`, `stale-tablet.png`, `current-options-tablet.png`, `response-320.png`, `closed-desktop.png`.

The owned preview, loopback proxy and disposable stack were stopped after acceptance; volumes/evidence and unrelated development services were preserved.

## Next customer priority

Continue the existing customer-experience roadmap with document branding/contact consistency. The rendered proposal still contains the historical lawn-care tagline despite the owner's confirmed public-service change; reconcile factual branding and contact sources across documents/emails without inventing offerings or changing contractual/financial terms. Authoritative business wording, real mailbox-client and screen-reader/device acceptance remain separate follow-ups. No further feature was implemented in this batch.
