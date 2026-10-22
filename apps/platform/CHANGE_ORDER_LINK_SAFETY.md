# Atomic change-order customer links

Verified October 22, 2026. Sending commit `dddba7a` is pushed to `main`. This link-management batch is saved separately for the next push. No application was deployed and production was not changed.

## Result

Generate, regenerate and revoke now use one reviewed database command. Token changes, audit history and the private retry receipt commit together. Regeneration revokes the old links and creates one replacement atomically; a failure cannot leave the replacement or revocation half finished. Revocation needs no encryption key and creates no replacement. Generating normally reuses a matching active link without extending its expiry. Ordinary document edits keep the existing link.

Each action binds the employee's loaded change-order revision, the token set shown on screen, intent and request ID. A competing edit or link change requires a fresh review. Token views and successful-use telemetry do not invalidate that review. Request recovery looks up the original receipt before generating any new token. It confirms the earlier outcome without restoring a link later revoked, replaced, expired or assigned to a different party/contact. Deactivating the selected organization contact also makes the link unavailable to share or recover.

The browser stores only opaque IDs, revision, token-set digest and intent. Pending actions survive reload, keep their original identity and offer **Check earlier link action**. Copy and other mutations stay disabled until local recovery state is restored and any pending action is confirmed. Success refreshes the record; server-action results never contain raw customer URLs. The reader strips stored ciphertext/hashes before React props and exposes a URL only after binding and decryption/hash verification.

Initial approval-email preparation now uses the same reviewed link identity. Recovery of an already committed older email request still happens first and works without the new browser digest. An uncommitted older request without a digest requires a fresh review. Existing outbox dispatch, provider idempotency, delivery recovery and explicit additional-copy rules remain unchanged. No automatic email is sent by link controls.

## Security and compatibility

Migration `20261022170133_atomic_change_order_portal_links.sql` adds an RLS-protected, client-inaccessible receipt table and three authenticated office commands with empty search paths and live role checks. Mutations and recovery follow the established job → change order → sorted token locks and recheck office access after waits. Authenticated direct token insertion/update/deletion and the old unversioned token-creation endpoint are retired. Trusted service view/use telemetry remains available. Financial totals, scope, work-order creation and approval transactions are unchanged.

Customer declines and change requests now enforce the same current customer/organization and active selected-contact binding as portal reads and approvals. The existing null-contact legacy rule is preserved. No existing token or delivery history was bulk changed. Historical migrations retain their exact bytes; the original 93-entry staging candidate is unchanged. The source inventory now contains 113 migrations and 20 separately reviewed deferred entries.

## Verification

- Fresh seed-free native replay of all **113 migrations**, generated schema and drift check.
- **299 rollback SQL assertions**, including 40 link assertions and the prior 259 sending, workflow, manual approval, copy, edit, portal approval and appointment checks.
- **18 actual Auth/API scenarios**: nine link concurrency/security cases and nine sending regressions. These include competing regeneration/revocation, identical retries, concurrent first generation, offboarding/source edits during waits, superseded recovery, telemetry-neutral review versions and revocation against a queued email claim.
- **2,269 CRM checks passed**, zero failed/skipped; final typecheck and isolated optimized build passed. Final application sources match both preview and build. UI detector reported no findings.
- Browser: a local proxy withheld a successful generation response after commit. Reload preserved the original action and disabled Copy; recovery produced **one token, one receipt and one audit**, unchanged document revision and zero email deliveries. Desktop 1280px and mobile 390px had no horizontal overflow. Keyboard focus and empty, loading, uncertain and confirmed states were checked. Native regeneration confirmation stalled the browser automation, so confirmation dismissal is not claimed as verified; database replacement/revocation behavior passed the SQL/API tests. The stalled click created no replacement.

Only migration 113 was installed in staging after a native dry run. Its **40 synthetic rollback assertions passed**. Existing business records, Auth users/sessions/roles, tokens, receipts, audit/delivery history, settings and unrelated routines matched before/after. All staging sending/generation switches remain OFF. This is staging database verification, not acceptance of a newly hosted app.

Security advisors retain the existing 33 no-policy informational findings and leaked-password-protection warning. The authenticated security-definer group increases from 66 to 69 for the three intentional office commands; their tested live-access checks and private tables provide the command boundary. See the [Supabase advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable). There are no other advisor additions/removals.

Production remains on migration 102 and its existing published application. Production/staging deploy IDs and hosting configuration match the starting snapshot. No real email, provider call, production write, credential, scanner or sending-switch change occurred. Test actors were disabled; task services were stopped with their data preserved. The interrupted local VM was returned to its prior stopped state after cleanup.

## Next priority

Apply the same atomic replacement and retry discipline to invoice customer links. The invoice regeneration action still creates a token, revokes a separately loaded token list and records history in separate calls. Concurrent replacements can leave more than one active link, and a lost response has no durable office-action receipt. Keep payment/checkout rules unchanged while closing that capability-management gap; quote links can follow in the same established roadmap.

Production release still requires the coordinated application/deferred-migration process. This staging database install does not authorize deployment. Safe evidence: `staging/CHANGE_ORDER_LINK_VERIFICATION_20261022.json`; synthetic screenshots and private logs are kept outside Git in the dated task evidence directory.
