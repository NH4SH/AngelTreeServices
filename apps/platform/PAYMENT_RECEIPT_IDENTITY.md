# Separate receipts for separate payments

October 23, 2026. Follow-through to the existing communications/delivery-recovery and receipt-clarity work. Migration 119 staging reconciliation is pushed normally to main as `ba4367c`. This new batch remains local and unreleased; production is unchanged.

## Reproduced defect and decision

An accepted receipt for payment A incorrectly suppressed the receipt for payment B on the same invoice within the configured reminder interval. The actual previous processor returned `skipped`; the native migration-119 delivery command independently refused B. Both reproductions used synthetic data and no provider. This demonstrates a lost-receipt path, not evidence of an actual production incident or an incorrect financial balance.

The worker now checks receipt history by payment identity. A different known payment on the invoice no longer suppresses this receipt; the same payment still does. Older invoice receipt events without a payment identity retain their conservative hold. Own accepted communication history is still reconciled without sending again, and uncertain results remain held for review.

Candidate migration **120**, `20261023213240_scope_payment_receipts_to_payment.sql`, makes the same narrow distinction for saved outbound requests in the existing native claim command. Accepted receipts retain the existing configured interval; dispatching and unknown requests for the same payment still prevent another receipt attempt. A saved request without a payment ID retains its existing invoice-level hold. Legacy accepted-event matching already uses payment identity and is unchanged. No existing failed, skipped or cancelled row is reset or resent automatically.

## Preservation and boundaries

Application code changes only the history filter in `src/lib/communications/processor.ts`. The migration replaces one exact matching expression inside `public.claim_outbound_delivery`, guarded by its reviewed migration-119 preimage. Its owners, permissions, security mode, arguments and search path remain unchanged. No new command, table, policy, index, default, role or API type is introduced.

Source and recipient checks, source snapshots, invoice/source/family lock order, stable business/provider keys, immutable payloads, claim fencing, attempt limits, retry authority and delivery history remain intact. Same-payment duplicates serialize through the existing locks. Two genuine payments can each have one receipt attempt. Financial values and calculations, payment processing, refunds/disputes, recipients, receipt wording and templates are unchanged. Other reminder families retain their original comparison and suppression rules, including the proposal-expiry checkpoints from migration 119.

The fresh native schema manifest records migration 120; generated public TypeScript is byte-identical. All original 119 migration files are unchanged. The deferred source inventory includes 120 for separate permanent staging review; historical candidates remain pinned. No worker, application, migration or automation is permanently installed/activated in staging by this batch. The employee UI, dashboard, website work and separate runtime-security branch at `06580f6` are preserved.

## Verification

| Check | Result |
| --- | --- |
| Full CRM suite on patched locked dependencies | **2,485 passed**, no failures/skips; includes nine new worker regression tests |
| Route types, TypeScript, optimized build | Passed on Node 22.23.4 / Next 16.4.2 / React and DOM 19.2.9 |
| Fresh native local replay/upgrade | Original 119 replayed in a new isolated project; native 120 upgrade and repeat passed, prior complete ledger/data preserved |
| Candidate and installed native commands | Initial 30 assertions; final **32 installed local and 32 rollback-only staging assertions** passed |
| Actual concurrent PostgreSQL sessions | Two scenarios / three TAP results; both sessions observed waiting: distinct payments get two attempts, competing same-payment receipts get one |
| Worker with native local/staging inputs | **12 scenarios**; previous suppression reproduced, new receipt accepted once, same-payment/unknown-history holds preserved, healthy send inputs identical |
| Real local Supabase client/PostgREST | Actual compound history filter accepted; different payment excluded, same payment and unidentified invoice receipt matched |
| Schema and security | Fresh native generation/check and offline fingerprints passed; public types and local security-advisor findings unchanged |
| Staging preservation | Fresh exact 119 verifier passed before/after; all 5,110 catalog objects, 49 protected record sets, prior native statement history, settings and Auth guard preserved |

Native command tests cover accepted, in-flight and unknown same-payment holds; distinct payments on the same invoice; immutable first-delivery history; same-key repeat; legacy accepted events; unidentified in-flight history; no invoice/payment mutation; exactly one attempt per payment; automatic-sending OFF; and anonymous/authenticated denial. Candidate DDL and every synthetic staging record are rolled back. Only the reviewed claim body changes prospectively; existing hosted defaults/ACLs are compared to their own reviewed baseline, not replaced with local bootstrap defaults.

The native-input worker tests use database-produced fixtures and controlled responses/transport. Real PostgREST filter checks run only against task-owned local synthetic records. No deployed worker, hosted failure or real inbox delivery is claimed. Concurrency fixtures and local filter fixtures remain confined to the new disposable project, whose data is retained when stopped. Build verification copied no ignored environment files/provider credentials and recorded zero external application requests.

## Next step and release limits

Permanent staging reconciliation for migration 120 is the next database step. Staging remains at **119** with automatic sending, appointment notices and recurring generation OFF. Do not use this fix to bulk retry historical skipped/failed receipts; any such recovery needs provider/history review and separate authorization. No customer communication, production query/change, key rotation, application deployment or support message occurred.

The existing owner terms-policy decisions, mailbox/device/assistive-technology acceptance and separate managed-runtime follow-up remain in the current roadmap. No new roadmap or unrelated feature is introduced. Sanitized receipt: `staging/PAYMENT_RECEIPT_IDENTITY_VERIFICATION_20261023.json`. Private evidence: `/Users/noelsierra/Documents/Codex/2026-10-23/payment-receipt-identity/`; raw synthetic inputs, native responses and logs remain outside Git.
