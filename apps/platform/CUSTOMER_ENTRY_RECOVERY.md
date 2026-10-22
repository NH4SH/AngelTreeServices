# Customer entry and secure-link recovery — October 22, 2026

The verified customer print/save commits `fe021b9` and `fa62bd3` are pushed to `origin/main`, with deployment skipped. This follow-up continues the customer-entry/recovery priority in `CUSTOMER_EXPERIENCE_REVIEW.md` and `ACTIONABLE_REMINDER_EMAILS.md`. It is saved locally on `codex/customer-entry-recovery`; it has not been pushed or deployed.

## Decision and behavior

Keep secure emailed document links as the primary customer workflow, as selected by the owner. Replace misleading feature promises and technical placeholders with useful guidance; preserve the current account and document access boundaries.

- The signed-in customer landing page explains how to find the latest document email, open its secure link, and obtain help. It retains the signed-in account identity. Non-working photo-upload/feedback cards and outdated “billing later” wording are removed from this guidance; no working upload, feedback, billing or document capability is removed.
- The organization destination gives the same practical guidance for separate property/document links. It does not consume the URL token as authorization, infer an organization, enumerate documents, or expose records. Its existing middleware sign-in requirement remains intact.
- The login page explains that emailed document links can be opened without an account sign-in. Existing account fields, employee access requests, role-dependent redirects, pending-access handling, privacy links and login actions are unchanged.
- Unavailable quote, invoice and change-order pages offer a native **Can’t find or open your link?** disclosure. It explains inbox/spam recovery and asking the office for a current link, with the existing office phone number. It never claims that an unauthorized document exists.
- All new help controls have 44px targets, visible keyboard focus and readable 16px body text. Recovery does not require another form or any new client request. Normal valid-document contact blocks remain compact.

No anonymous document search, automated replacement-link sender, account hub, new API or new environment variable was introduced. The office still uses its existing authorized link-management and email workflows. This batch cannot send a duplicate customer email because it introduces no send or retry command.

## Preservation

Existing authentication, middleware, effective access, token validation, expiry/revocation/customer binding, RLS/grants, approval versions, retry receipts, financial calculations, payment actions, notification planning and delivery history are unchanged. The print stylesheet and document components from `fa62bd3` are unchanged. No migration, persistent database setting or credential change is required.

The small rendering correction on the native disclosure is limited to `suppressHydrationWarning` on the `<details>` element: its browser-managed `open` attribute can change before React hydrates. Children and the rest of the page remain subject to normal hydration checks. This preserves a disclosure that works immediately instead of replacing it with a JavaScript-dependent control. The initial warning and the clean final browser run are retained privately. [React’s single-element hydration guidance](https://react.dev/reference/react-dom/client/hydrateRoot#suppressing-unavoidable-hydration-mismatch-errors).

## Verification

| Check | Result |
|---|---|
| Full CRM regression runner | **2,328 passed**, zero failed/skipped |
| Final isolated typecheck and optimized build | Passed; source matches verified preview/build |
| Local installed-SQL recovery cases | **18 passed**: active, expired, revoked, unknown, wrong-document and reassigned customer for each document family |
| Staging installed-SQL recovery cases | The same **18 passed**, with anonymous row/RPC denials; all fixtures rolled back |
| Actual local HTTP acceptance | **18 document cases plus unsigned entry/login checks**, 20 TAP results passed; correct authorized records, no protected details/actions for invalid capabilities, no-referrer and private/no-store behavior preserved |
| Final browser acceptance | **27 views** at 1280/768/390px; no horizontal overflow; all checked help targets at least 44px; four keyboard Enter/Space and visible-focus checks passed; zero warnings/errors |
| Mechanical design check / whitespace | No findings; `git diff --check` passed |

The local/staging installed-SQL tests export synthetic rows from real databases, run the existing capability loaders through controlled data adapters, and render the actual React pages/components. They do **not** claim a deployed staging UI or hosted staging Auth/HTTP test. Local HTTP/browser tests use a separate retained disposable stack and committed synthetic fixtures. No production records were test inputs.

Before/after staging fingerprints match for business/financial records, document capabilities, Auth/roles, audit/delivery history, settings and the principal routine. The ledger remains **116**. Staging automatic sending and appointment notices remain OFF. No payment, approval, real email, SMS, telephone call or provider transaction was submitted.

Staging security-advisor findings match the previous print batch after excluding observation timestamps: **33** [RLS-without-policy info findings](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), **79** [authenticated security-definer warnings](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), and **one** [leaked-password-protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). This presentation change adds none and does not claim to resolve the existing findings.

Published production/staging Netlify deploy IDs and settings match the starting snapshots. Production was not changed. The temporary browser viewport was reset and only the owned test tab closed. Synthetic local actors were disabled and the owned `3147` preview/API60421/DB60422 stack stopped, with volumes retained. The existing development app, primary database and Lima VM were preserved.

## Files and evidence

Application: `src/components/customer-document-entry.tsx`, `portal-contact.tsx`, `portal-recovery.css`; `src/app/login/page.tsx`; the customer landing/organization pages; and the three document unavailable-page contact calls. No server action or middleware file changed.

Tests: the new `tests/customer-entry-recovery*` fixture/regression/installed-SQL/local-HTTP suites, two existing test fixture injection points, and `supabase/verification/customer_entry_recovery.sql`. The checked-in SQL always rolls back; committed browser fixtures were created only by a private local-only guarded wrapper.

Machine-readable result: `staging/CUSTOMER_ENTRY_RECOVERY_VERIFICATION_20261022.json`.

Private evidence: `/Users/noelsierra/Documents/Codex/2026-10-22/customer-entry-recovery/`. Representative screenshots: `before-entry.png`, `before-organization.png`, `before-login.png`, `final-entry-collapsed-1280.png`, `final-entry-collapsed-390.png`, `final-organization-390.png`, `final-quote-unavailable-390.png`, and `final-login-390.png`. Raw synthetic capabilities, credentials, exported receipts and private logs stay outside Git.

## Remaining work within the existing roadmap

Continue customer response acceptance, beginning with additional-work request/decline outcomes and accessibility while preserving the existing atomic commands and retry identities. A scoped account hub remains a separate product decision. Contract/payment/debris wording still needs authoritative owner confirmation before changing legal terms. Real mailbox clients, screen readers, physical devices and telephone handoff were not tested by this batch.

Impeccable reports that the older `PRODUCT.md` schema could be refreshed with `init`. That optional documentation task was not used to expand this implementation or rewrite confirmed business facts.
