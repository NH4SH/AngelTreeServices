# Reviewed change-order sending and recovery

Verified October 22, 2026. Review/cancellation commit `9ee37ca` is pushed to `main`. This sending batch is a separate local commit. No app was deployed and production was not changed.

## Result

The approval-email button previously loaded the latest server contents rather than checking the version on the office's screen. Its request key used the latest `updated_at`. The new change-order revision field was also included in the existing semantic email snapshot, so marking an accepted email as sent could make an unchanged retry look like a new business email.

The button now submits its loaded revision and an opaque request ID. A server-only source command reads the email fields, canonical recipient and expected snapshot under the established work-order-before-addition locks. Preparation checks that revision and snapshot again, verifies active office access after waits, and binds the selected customer link to the current addition, customer/organization and approval contact. A stale or expired link is rejected with regeneration guidance; it is not silently revoked or replaced. Related customer/organization names and the selected contact's name/email are included in the binding.

`prepare_change_order_send` atomically saves the existing outbox request, a reviewed-action audit and a private request-to-delivery receipt. A late receipt failure rolls back the new outbox and its aliases too. The actor comes from the authenticated server action, not a browser field. The three public preparation/source/recovery commands are service-role-only, reject a user-bearing service session, and independently check live office access. The private receipt table has RLS, an explicit restrictive deny policy and no client grants.

The existing durable dispatcher, frozen sender/recipient/body, provider idempotency key, receipt reconciliation, webhook recovery and delivery-review tools are reused. There is no parallel email transport or new automatic sender.

## Retry and additional-email policy

Recovery looks up the original receipt before reading current contents, composing another body or generating another link. An accepted result is confirmed without dispatch. Unknown or already-dispatching results go to Delivery review. A prepared request, or a rejected request with existing retry authority, can dispatch only its original frozen delivery. Clearing browser storage never grants authority to bypass an uncertain outbox record.

The private browser attempt contains only request/source IDs, reviewed revision and the additional-copy flag. It survives reload and retains the original intent even if the record becomes sent or closed. “Check saved email” remains available for recovery. Disabled storage limits recovery to the current page; durable database history remains available. A confirmed action disables its email control until a fresh record is loaded, reducing accidental repeat clicks.

Already-sent edits continue to update the existing secure link and retain the sent status. They do not automatically email the customer or introduce a new internal-review state machine. Resending explicitly confirms an additional approval email for the currently reviewed page version. That copy has its own durable request, so retrying it does not create another copy. Initial pre-send edits still require fresh internal review under migration 110.

New requests are held while any delivery for the same addition is dispatching, unknown, or accepted with unreconciled history. A second check at claim time protects requests prepared before the uncertainty arose. It preserves the held prepared intent with zero attempts so an operator can resolve the first delivery without losing the second request. Source changes, cancellation and access revocation are still checked by the existing dispatcher. An in-flight provider request cannot be recalled after cancellation; accepted history is retained without reopening a closed source.

## Compatibility and migrations

- `20261022153445_reviewed_change_order_sending.sql`: reviewed source/preparation/recovery and private receipts. New contexts opt into a semantic snapshot that ignores bookkeeping `edit_revision` and includes the selected contact's greeting data. Existing saved contexts retain their exact snapshot shape and provider keys. Ordinary matching sends can reuse existing legacy outbox evidence without rewriting it; explicit additional-email intent remains separate.
- `20261022162956_guard_pending_change_order_sends.sql`: adds the final claim-time family hold for the new marked requests, including copies made through the established delivery-review path. This was a separate additive migration because the earlier migration had already been installed and verified in staging. It changes no function signature, grant or other document kind's dispatch rules.

No historical delivery was bulk rewritten, retried or sent. Legacy unmarked requests retain their established rules. No change-order scope, invoice, payment, scheduling, employee or scanning logic was changed. The original 93-migration staging candidate is unchanged; the inventory now has 112 migrations and 19 deferred entries.

## Verification

- Fresh, seed-free native replay of all **112 migrations**, schema generation and schema drift check on a dedicated loopback stack. Existing development databases were not reset.
- **259 rollback assertions**: 36 sending, 39 review/cancellation, 40 manual approval, 35 copying, 39 editing, 34 customer approval and 36 appointment notices. Sending tests cover grants/RLS, stale and related-party changes, token ownership/expiry, late rollback, accepted-send deduplication, explicit copies, uncertain outcomes, cancellation/review invalidation, live access and legacy compatibility.
- **Nine actual Auth/API concurrency scenarios**, including identical and distinct initial requests, offboarding and source changes during lock waits, accepted response recovery, family holds, explicit copy retries, and racing two prepared copy claims. Only one competing copy was admitted; after its synthetic unknown outcome the other retained its prepared intent and zero attempts.
- **2,246 CRM checks passed**, zero failed/skipped. Typecheck and isolated optimized Next.js build passed. The final 112-migration replay generated the same application types as that build; final application-source hashes match the browser preview and build. UI detector: no findings.
- Desktop/mobile browser checks at 1280/390 pixels: keyboard submission, pending/error recovery, no mobile horizontal overflow, and no captured warnings/errors. A local-only proxy withheld a successful preparation response after commit. A synthetic database acceptance then reconciled the original email; a subsequent source edit and page reload did not lose its identity. “Check saved email” confirmed it without rebuilding or dispatching: **one receipt, one delivery, one attempt and one sent-history entry**, with the original payload hash unchanged. No provider credentials or transport were used. Additional-copy transaction behavior is covered by SQL/API tests; native confirmation dismissal was not separately automated.

Staging preflights selected only the next targeted migration each time, with no seeds or role scripts. Migration 111 passed 35 synthetic rollback assertions; migration 112 then passed the final 36. Selected existing business rows, Auth users, communication settings and unrelated routine seals matched before/after. Automatic sending and appointment-change notices remain OFF in staging. Security advisors added or removed no findings. No hosted staging app was deployed, so this is database verification rather than hosted UI acceptance.

Production remains on migration 102 and its existing published app. Production and staging deploy IDs and hosting settings are unchanged. No real customer email, provider call, production write, credential change, scanner change or sending-switch change occurred. Task test accounts were disabled before stopping the browser test stack; final synthetic actors were disabled and the final task stack was stopped with volumes preserved. The user's existing local app was left alone.

## Release and next priority

Release the updated app and accumulated deferred migrations through the established coordinated process; do not treat the current older hosted staging app as acceptance for this boundary. Neither migration was applied to production here.

Next: make change-order link regeneration and revocation atomic and safely retryable. Sending now rejects a stale contact-bound link, but Link controls still perform their replacement/revocation/history writes separately. Protecting that explicit office action is the next focused step while retaining the existing customer-link behavior.

Safe evidence: `staging/CHANGE_ORDER_SEND_VERIFICATION_20261022.json`. Screenshots and private local test logs are in the dated task evidence directory, outside Git. Pre-existing Impeccable artifacts were preserved outside this commit.
