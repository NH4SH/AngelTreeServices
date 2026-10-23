# Review-request draft readiness

October 23, 2026. Local follow-through to the existing P2 review-request finding in `CUSTOMER_EXPERIENCE_REVIEW.md`, based on current main `cad55f1`. The framework security update is now pushed to main. This batch is committed locally for a later push; no application deployment or production change occurred.

## Finding and change

The original completed-job workspace copied `[Add Google review link]` into a customer email body when no review URL was configured, then displayed **Body copied**. This was reproduced using the real component and clipboard in an isolated local preview before editing the source.

The public review destination now passes the same validation at configuration read and draft generation. Missing, blank, malformed, insecure HTTP, credential-bearing, control-character and oversized values produce no email/text body. The workspace shows **Review link needed**, with a short instruction to contact the CRM administrator, and withholds review copy controls until the destination is valid. It does not echo malformed settings or technical environment-variable names into the everyday UI.

Configured HTTPS Google links and existing company redirects remain supported. This is syntax validation, not verification that the URL belongs to ATS or reaches the correct Google listing. No link was invented, installed, visited or sent. Existing configured email and text wording remains exactly the same. The controls remain copy-only; no automatic sender, queue, delivery record or provider call was added. Copy feedback resets if the employee switches to a different job or destination.

The existing post drafts, public-safe text filtering, photo selection, customer-permission planning and unsaved completion notes remain available. The shared copy/email cards, page routing, completed-job query, employment UI, dashboard, financial commands, authorization, RLS and all migrations are unchanged. No CSS, package, lockfile, business terms, provider settings or credentials changed.

## Verification

| Check | Result |
| --- | --- |
| Full CRM suite using the patched locked dependencies | **2,418 passed**, no failures/skips |
| New readiness tests included above | Seven tests, including independently captured pre-change wording |
| Route types, TypeScript and optimized build | Passed on Node 22.23.4, Next 16.4.2, React/DOM 19.2.9 |
| External application requests during the isolated build | Zero; no environment files or provider credentials copied |
| Actual component browser checks | Missing, invalid, ready and long-name states at 390, 768 and 1280px; no horizontal overflow |
| Actual clipboard/keyboard checks | Subject, body, full email and text match the original fixture; Enter, Tab, visible focus and copy feedback work |
| Browser error console on the final preview | No errors |
| Focused Impeccable detector | No findings |
| Staging database fixture assertions | Five passed; synthetic transaction rolled back |
| Actual components/helpers using four staging-produced jobs | 32 assertions passed; original configured wording and inputs retained |
| Exact staging preservation contract | Passed before/after: 118 migrations, 5,110 catalog objects, 49 protected sets, settings and Auth no-send guard |
| Source-copy parity and whitespace checks | Passed |

The staging fixture covers completed, ready-to-invoice, invoiced and paid jobs; unfinished and archived jobs stay outside the existing follow-up filter. The owner can read the eligible synthetic jobs and an unassigned crew member cannot. The test-only SQL file is `supabase/verification/review_request_draft_inputs.sql`; it adds no permanent function, policy, grant, table or migration. Fixtures, including synthetic Auth users, were fully rolled back. Automatic sending, appointment notices and recurring generation remain OFF in staging.

Browser acceptance used an isolated route containing the actual workspace, shared components and application CSS with synthetic inputs, without database or provider credentials. Staging acceptance used the installed database and passed its returned synthetic records through the actual helper/component adapters. The changed app was not deployed to hosted staging. This is not a new hosted end-to-end, mailbox, physical-device or assistive-technology certification. Shared clipboard-failure behavior was unchanged; no new simulated clipboard-permission denial is claimed.

## Follow-through and boundaries

This closes the existing unfinished-review-draft finding without introducing a new communications system. Remaining customer work continues in the existing roadmap: actual mailbox/assistive-technology/device acceptance and the unresolved policy/override decisions in `CUSTOMER_TERMS_REVIEW.md`. Configuring and checking ATS's actual review destination remains an administrator task before customer use; no existing service configuration was inspected or changed here.

The separate runtime security branch remains at `06580f6`. Netlify support ticket #1151908 remains awaiting a response in the existing record; this batch made no additional support contact and does not verify production's actual Node patch. Framework security and customer feature readiness do not imply production activation readiness.

At the owner's subsequent request, this verified draft-safety batch was pushed normally to `origin/main` as `0a2d14806bf723c9b450f6ab5228ed179d878358`. The sanitized verification receipt remains the historical pre-push receipt. No application deployment, production change or customer send accompanied the push. The next existing customer finding is addressed locally in `CUSTOMER_PAYMENT_RECEIPT_CLARITY.md`.

Sanitized receipt: `staging/REVIEW_REQUEST_READINESS_VERIFICATION_20261023.json`. Private evidence, screenshots, clean build copy, before/after staging snapshots and raw logs: `/Users/noelsierra/Documents/Codex/2026-10-23/review-request-readiness/`. The private preview route and raw snapshots are excluded from Git. Before/after images are `before-desktop.png`, `before-mobile.png`, `after-desktop.png`, `after-mobile.png`, `ready-desktop.png` and `ready-mobile.png`. Clipboard and viewport were restored and the owned preview was stopped after acceptance.
