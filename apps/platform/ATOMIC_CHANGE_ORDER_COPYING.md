# Atomic change-order copying and retry recovery

Verified locally and against the separate staging database on October 22, 2026. No application deployment or production change.

The previously verified editing commit `92bb19b` is pushed to `main`. Merge `05e8e90` preserves the concurrent website mobile tap-target update `cf38c2a`. This copying batch is a separate local commit awaiting the next push request.

## Behavior

`Duplicate` creates a new draft with the source's complete line set, prices, taxes, fees, original approved amount, notes, and coordination choices. It retains the existing `Copy of …` title convention, source quote, work order, contracting party, and property. Active organization contacts carry forward; inactive contacts are cleared. Closed and approved sources remain copyable. Empty legacy quote-only drafts remain supported.

Fresh IDs and timestamps are generated. Approval authority, approval/delivery dates, customer tokens, invoice references, applied work scope, material-plan links, closeout ownership, and the old approval expiry do not carry forward. Hidden cost estimates are copied inside the database without taking cost values from the client or exposing them in the receipt. An estimator's ability to copy does not grant permission to edit those costs.

Inconsistent source totals or mismatched work-order/party/property relationships require review rather than propagating a bad record. Copying never prepares or sends a customer message.

## Transaction and access boundaries

Migration `20261022132724_atomic_change_order_copies.sql` adds `copy_change_order_draft(request, source, expected_revision)` and a private request ledger. It performs the source read, header insert, all line inserts, duplication audit, and immutable request receipt in one transaction. A late failure rolls everything back; there is no separate cleanup delete.

The command serializes identical requests and uses the same work-order-before-change-order lock order as editing, approval and invoicing. It rechecks source revision/parent and live office access after waits. Header and ordinary/trusted line edits invalidate the revision through the preceding editing migration. A competing edit either follows the complete copied snapshot or causes a conflict; it cannot produce mixed header and line versions.

Only authenticated, active office roles may execute it. Anonymous and service-role execution are explicitly revoked. The private ledger has RLS, an explicit restrictive deny policy, and no client grants. Request ID reuse with a different actor, source, or revision is rejected. A deleted target retains a request tombstone, preventing a retry from resurrecting a removed draft. Recovery still works if the original source was later edited or deleted.

The browser retains only opaque request/source IDs and the original revision in session storage. An uncertain result keeps that identity across a reload. Retrying returns the original copy before checking the source's newer revision. Positive acknowledgements are validated before navigation; recovered copies open their current detail page. A definite conflict disables the stale copy action and offers a full reload of the current record. Duplicate submissions are blocked while pending and while confirmed navigation is in progress.

## Verification

- Fresh, seed-free native Supabase replay of all **108 migrations**, isolated from the existing development database.
- **144 rollback assertions:** 35 copying, 39 draft editing, 34 customer approval, 36 appointment notices.
- **Six authenticated API scenarios:** simultaneous retries; lost acknowledgement followed by source/target changes; offboarding while waiting; copying versus atomic editing; source reparenting while waiting; recovery after source deletion.
- **2,222 CRM checks passed**, zero failed/skipped; typecheck and isolated optimized Next.js build passed. The first isolated build attempt used a dependency symlink outside Turbopack's root; cloning dependencies into that private build root resolved the harness issue without changing application configuration.
- Real local browser: keyboard duplication opened the full editor; mobile stale-source conflict blocked copying and reloaded correctly; no horizontal overflow at 390/1280 pixels; no captured browser warnings/errors.
- Real lost-response test: a loopback-only proxy withheld a successful RPC response after commit. The browser displayed `Check / retry copy`; after reload and a source change, retry opened the original target, with exactly one request receipt and one duplication audit. The proxy is test infrastructure outside the repository, not application code.
- Impeccable detector: no findings in the changed UI files.
- Exact runtime source fingerprints match the files tested and built.

Staging's native dry run selected **only migration 108**, with no seeds or role scripts. The migration was installed there, followed by all **35 rollback-only synthetic assertions**. Selected business-record, Auth-user, communication-setting and unrelated-routine fingerprints matched before/after. Automatic sending and appointment-change notices remain OFF in staging. No app was deployed and no provider was called.

Security advisors report one intentional new warning for the authenticated SECURITY DEFINER copy command (63 → 64). This follows the existing guarded command boundary because a client must not write its private receipts. Explicit execute revocations, live office checks before/after locks, strict scalar inputs and an empty search path are tested. No other advisory was added or removed. See the [Supabase advisory explanation](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Files

- New migration and `supabase/verification/change_order_copies.sql`.
- `src/lib/actions/change-orders.ts`: replace the compensated copy sequence with one checked RPC.
- `src/lib/change-orders/copy-attempt.ts`: opaque retry identity across page reloads.
- `src/components/change-order-forms.tsx` and the change-order detail page: reviewed source revision, pending/conflict/recovery behavior and acknowledged navigation.
- `tests/change-order-copy.test.mjs`, `tests/change-order-copy.integration.test.mjs`.
- Generated schema/manifest and deferred migration inventory updated to 108/15; the historic 93-migration staging candidate is unchanged.
- `staging/ATOMIC_CHANGE_ORDER_COPYING_VERIFICATION_20261022.json`: safe verification record.

## Limits and next release step

The new UI ran against a fresh local stack. Staging database commands were exercised with synthetic rolled-back data; hosted staging UI was not changed. No production customer, email, payment, scanner setting, migration or deploy was modified. Production remains at migration 102 and its existing published build.

Session storage supports same-tab reload recovery. Clearing storage, closing a non-restored tab, or switching devices loses that browser identity; private receipts and audit history remain available for staff review. When storage is disabled, recovery is limited to the current page's in-memory identity. This change does not promise cross-device draft recovery or change the existing copy permissions.

The next release must coordinate the already-pending production migrations and application build through the established staging/release process. Do not deploy the app without the prerequisite editing and copying migrations. Internal workflow/manual approval actions remain separate existing commands and were not redesigned in this batch.

The disposable browser actor was disabled and the task's local stack stopped with data preserved after verification. The primary development app/database were not reset.
