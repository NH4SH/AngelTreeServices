# Atomic change-order editing

Verified customer approval changes were pushed to `main` as `2ee726a13be7ca7b7630130a30ec47e48c0ade97`, with skip-build markers. This follow-up implements the atomic editor recommended in `CHANGE_ORDER_PORTAL_APPROVAL_SAFETY.md`. It is saved locally for review; neither application was deployed and production was not changed.

## Behavior

Creating or editing additional work now saves the header, all lines, derived totals, audit entry, private request receipt and any crew-closeout link in one database transaction. A late line or audit failure rolls everything back. The old editor's sequence of header/line requests and compensating creation delete has been removed from these two save actions.

Every save has a request ID. Exact retries return the original receipt without creating another draft, audit entry or scope line. Receipts remain bound to the original actor and payload. A recovered acknowledgement does not claim to have applied new edits or replace a later saved version.

The editor keeps a loaded revision. Header updates, normal line writers and trusted maintenance line changes advance that revision. The command locks the job before the change order, checks the version after waiting, and rechecks active staff access. A competing edit or approval cannot be overwritten. Approved, closed or billed additions remain locked. The existing customer approval, work-scope, projected-value, invoice and notification commands are retained.

The browser keeps unsaved entries after a rejected or unconfirmed save. A conflict offers the current record in another tab; it does not automatically reload or overwrite the form. Unknown outcomes retain their request ID and original revision, and changed input cannot silently become another request. Successful consecutive saves adopt the acknowledged revision and newly assigned line IDs. Creation and save-and-close navigate only after a positive receipt, with repeat submissions blocked while navigation is pending.

Only opaque request identities, revisions and digests are stored in browser session storage. Full descriptions, prices, notes and customer data are not stored there. When storage is unavailable, the current page still retains its request identity. This is safe request recovery, not a new offline/full-form backup feature.

## Preserved behavior and focused corrections

- The full editor, inline work-item creation, save-for-review, save-and-close, customer link continuity, multiline descriptions, contacts, tax, fees, expiry and coordination options remain available.
- The database derives ownership, service location and original quoted amount from authoritative work-order/source records. Client input cannot replace approval, billing, source or authorizer fields. A closeout link and its existing private supporting notes are saved atomically; an already-linked closeout cannot create another addition through this editor.
- Office users without financial access preserve existing hidden cost estimates. Their requests omit those fields, and the database rejects forged cost input. Financial users retain cost editing. Existing RLS policies and effective-access predicates are unchanged.
- Retained line IDs survive edits. Removal or material changes cannot silently detach work scope, invoice lines or material plans.
- Fractional quantity rounding now uses integer cents and quantity hundredths before the existing nearest-cent rounding. This fixes a floating-point edge where `0.29 × $0.50` could display/save `$0.14`; the correct `$0.15` now agrees between browser, action and database. Pricing policy, tax, fees and discounts were not changed.
- The normal form submission is intercepted so React cannot reset uncontrolled fields after an error. Native browser validation, keyboard controls, focus and status/alert announcements remain in place.

## Implementation

| Files | Purpose |
| --- | --- |
| `supabase/migrations/20261022124200_atomic_change_order_drafts.sql` | Revision tracking, private idempotency receipts and authorized atomic draft command |
| `src/lib/actions/change-orders.ts` | Existing create/update actions call one command, validate positive acknowledgements, preserve uncertain outcomes and return safe navigation destinations |
| `src/lib/change-orders/draft-attempt.ts` | Digest-only pending request recovery and changed-input protection |
| `src/components/change-order-forms.tsx`, `src/lib/action-states/change-orders.ts` | Consecutive-save identity updates, retained form entries, conflict review and acknowledged navigation |
| Database types, RPC nullability and schema manifest | Contract generated from a fresh native migration replay |
| `tests/change-order-draft-save*.mjs`, `supabase/verification/change_order_draft_saves.sql` | Action/recovery boundaries, real authenticated API concurrency and rollback verification |
| Deferred migration inventory and historic candidate test | Source inventory advances to 107; the historic staging candidate remains at its original 93 migrations |

## Verification

The safe result record is `staging/ATOMIC_CHANGE_ORDER_EDITING_VERIFICATION_20261022.json`.

A separate loopback-only Supabase project was replayed from all **107 migrations**, without seeds or resetting the primary CRM database. Its generated schema matches the source contract. **2,216 CRM regression checks** passed with no failures or skips. Typecheck and an isolated optimized build passed; the package has no standalone lint script.

**39 new rollback-only SQL assertions** passed both locally and in staging. They cover creation/edit receipts, complete totals, formatting, audit counts, request collisions, cross-actor recovery, stale versions, late failure rollback, maintenance writers, hidden costs, closed records, malformed/forged input, offboarding, organization contacts, closeout linkage/notes and fractional rounding. The previous **34 customer approval** and **36 appointment notice** assertions also passed locally with the new migration.

**Six actual authenticated API concurrency scenarios** passed locally: simultaneous creation retries, competing edits, offboarding during a parent-lock wait, approval racing an edit, old receipt recovery after a later edit, and a late invalid line. Tests used a separate synthetic account and loopback database. No real provider credential or customer email was used.

The rendered editor was exercised at **1280px desktop and 390px mobile**, with no measured horizontal overflow. Two successive browser saves retained new line IDs and produced exactly two edit audits. A stale mobile form kept its unsaved title and notes and disabled unsafe resubmission. Inline creation navigated back to the correct work order. A final inline/editor save showed and stored `0.29 × $0.50 = $0.15`. Keyboard Tab moved from Title to Reason. Browser fixtures were independently checked in the database and the synthetic account was disabled afterward. The mechanical UI detector reported no findings.

Staging's native dry run admitted only migration 107, with no seeds or role scripts. Existing rows were fingerprinted before/after, excluding only the newly added revision column, whose initial values were verified as zero. Payments, invoices, quotes, jobs, appointments, schedule events, communications, email history, Auth users, change orders, lines, applied scope and token rows were preserved. Existing routine bodies/grants and communication settings were unchanged. All staging synthetic fixtures rolled back. Automated sending and appointment-change notices remain off there. Hosted UI verification still requires a separately authorized app deployment; this batch verified the new UI locally and the transaction layer in staging.

Supabase's advisor adds one expected authenticated `SECURITY DEFINER` finding for the new office command (62 → 63). This command needs access to its denied private receipt table; it requires active staff access before and after waits and cannot execute as anon or service_role. Its private helpers have no client execution grants. The existing 33 RLS informational findings and one Auth password-protection warning are unchanged. See [function privilege guidance](https://supabase.com/docs/guides/database/functions), [intentional authenticated commands](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Private evidence is under `/Users/noelsierra/Documents/Codex/2026-10-22/atomic-change-order-editing/`, including `editor-final-saved-top.png`, `editor-conflict-mobile.png`, `editor-conflict-mobile-viewport.png`, native proofs and build/regression logs. Screenshots contain synthetic records only. Credentials, token/session files, full fixture indexes and private staging fingerprints remain outside Git.

## Remaining boundaries

Production remains on migration 102 and the original published deploy. Staging is on migration 107 with its original hosted app. Existing production scanning and automatic email settings were not changed. A release still needs the pending migrations and matching app code; this work does not activate appointment notices or send customer communications.

The separate **Duplicate change order** operation still uses its older compensated writes. The next transaction-safety follow-up is atomic copying with request recovery; this batch deliberately preserves that existing capability. Workflow transitions and manual approval continue through their existing commands.

The existing native inline disclosure emitted one development hydration warning when opened before hydration completed. Saving and navigation succeeded; no production defect is inferred. Its early-interaction behavior belongs in a focused UI follow-up. Physical devices, screen readers, mailbox/PDF acceptance and full offline form restoration were not claimed here.
