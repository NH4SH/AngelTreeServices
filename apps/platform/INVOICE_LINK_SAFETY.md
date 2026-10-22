# Atomic invoice customer links

Verified October 22, 2026. Change-order link commit `c9b4cd6` is pushed to `main`. The unrelated website update `1c82889` was incorporated without changing it. This invoice batch is saved separately for the next push; no application deployment or production change occurred.

## Behavior

Generate, regenerate and selected-link revoke now commit their token changes, audit history and private request receipt together. Replacement disables all prior unrevoked invoice links, including expired siblings, and creates one new link. A failed audit/receipt rolls everything back. Generation reuses a matching active link without extending its lifetime. Revocation preserves the existing per-token history control and needs no encryption key. Paid/void invoice history remains shareable; link actions do not reopen collection or alter invoice status.

Office actions carry an opaque request ID, the invoice/link version loaded on screen, intent and selected token ID. The version covers the invoice and token authority, excluding token view telemetry. A competing edit or link action requires review. Recovery checks the original receipt before generating another candidate, confirms the earlier outcome, and reveals no capability if its token was later revoked, replaced, expired or assigned to another customer. An old revoke retry never revokes a subsequently created token.

The browser retains only that opaque identity in session storage, with an in-memory fallback. Copy, open and further mutations stay unavailable while a request is uncertain or local recovery state is being restored. **Check earlier link action** survives reload. Success refreshes the invoice; action results contain no raw URL, ciphertext or token hash. Token summaries strip private stored fields, verify the decrypted token hash, and share only capabilities bound to the current contracting party. Individual revoke buttons, legacy history, expiry information, copy/open and normal invoice-edit behavior are preserved.

The established email helper retains its generate/reuse interface and now enters the same invoice-first transaction boundary. It cannot rotate or revoke links. The unused direct-insert replacement helper was removed. No new email transport, automatic sender or additional-copy policy was added.

## Authorization and payment boundary

Migration `20261022183123_atomic_invoice_portal_links.sql` adds the private RLS-denied receipt table, three office RPCs and the protected legacy generation wrapper. Owners/admins retain authority; estimators, crew, anonymous callers and service-only sessions cannot invoke office controls. Live access is checked again after lock waits. Authenticated direct token insert/update/delete is denied; trusted service telemetry remains available. Lock ordering is invoice → sorted tokens, with request serialization for exact retries.

The customer invoice reader now rejects a token whose customer/organization differs from the invoice. A concurrency test also found that a payment-preference request queued behind link revocation could retain its earlier join snapshot. A narrow anchored patch rechecks and locks the active, unexpired, matching-party token **after** acquiring the invoice lock. Payment-preference choices, calculations, source events, invoice amounts, checkout reservations, provider handling and payment reconciliation remain unchanged. Requests already admitted before revocation cannot be recalled; new/queued requests must satisfy the current capability check.

All historical migrations retain their bytes. There are now 114 source migrations and 21 deferred inventory entries; the historic 93-entry staging candidate is unchanged.

## Verification

- Fresh, seed-free native replay of all **114 migrations**, schema generation and drift check. Draft iteration was followed by a fresh final replay of the exact migration bytes.
- **340 rollback SQL assertions**: 41 invoice-link checks plus the prior 299 change-order/appointment assertions. Coverage includes late failures, stale decisions, private receipts, role boundaries, exact retries, per-token ownership, closed records, wrong-party capabilities, legacy reuse and unchanged financial records.
- **10 actual Auth/API concurrency scenarios**: same-request replacement, regenerate/revoke competition, competing first generation, offboarding and invoice edits during waits, superseded recovery, legacy email generation against replacement, telemetry, queued payment-preference revocation, and direct-DML denial.
- **36 installed-SQL payment regression checks** passed for preference routes and portal payment context/cleanup, with synthetic records and provider stubs. Their fresh-target guard admits only this task's exact loopback manifest/ports and rejects shared/hosted targets.
- **2,284 CRM checks** passed with zero failures/skips. Typecheck and isolated optimized build passed; final application-source hashes match preview and build. UI detector: no findings.
- Desktop 1280px/mobile 390px browser verification passed without horizontal overflow or captured warnings/errors. Keyboard generation and recovery worked. A local proxy withheld a successful response after commit; reload retained the pending identity and disabled sharing. Recovery left **one token, one receipt and one generated audit**, unchanged $100 invoice/balance, and zero payments, checkouts, customer communications or email events. Native replacement/revocation confirmations were not automated; their transaction behavior is verified by SQL/API tests.

Staging dry run selected only migration 114, with no seeds or role scripts. Its **41 synthetic rollback assertions passed**. Fingerprints of existing financial/business records, Auth users/sessions/roles, both document token families, private receipts, audit/delivery history and settings matched before/after. Unrelated routines and change-order approval were unchanged. Sending, appointment notices and recurring generation remain OFF. This is database verification; the hosted staging app was not deployed.

Security advisors retain the prior no-policy informational group (33) and leaked-password-protection warning. The authenticated security-definer group increases from 69 to 73 for the three intentional office RPCs and legacy wrapper, which now runs through the guarded transaction. All require a live owner/admin identity; private receipt grants remain denied. No other advisor addition/removal occurred. See [Supabase's advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

Production remains on migration 102 and its existing published source. Production/staging deploy IDs and hosting settings matched the starting snapshot. No real provider request, customer email, production write, credential change, scanner change or sending-switch change occurred. Task actors are disabled and the isolated task services are stopped with their data preserved; existing development databases are not reset or deleted.

## Release and next priority

Use the coordinated app/deferred-migration release process when authorized; this staging installation does not authorize production deployment. Next: apply atomic replacement and durable office-action recovery to **quote links**, including their existing multiple-recipient workflow. That older action still creates/revokes capabilities and records history separately. Preserve its recipient and email semantics while closing the remaining document-link gap.

Safe evidence: `staging/INVOICE_LINK_VERIFICATION_20261022.json`. Synthetic screenshots and private test logs are outside Git in the dated task evidence directory. Pre-existing Impeccable artifacts were preserved outside this change.
