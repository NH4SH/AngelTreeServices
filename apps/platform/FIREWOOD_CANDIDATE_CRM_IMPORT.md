# Firewood candidate → CRM invoice integration

October 29, 2026. **Local sandbox implementation; not approved or activated for production.**

## Scope and preservation

This detached worktree started at `a04c7b7ed2aea3d3091558af4ecce2d432cce8d3`, the reviewed legacy Firewood test-import baseline. Its 26 uncommitted source/test/document files were copied without modifying the original worktree. SHA-256 preservation evidence is in the private local evidence directory. No commits, pushes, merges, hosted migrations or deployments were performed.

The production CRM's published 102-migration baseline, home host, scanner, hosted Staging/Recovery, Website lead intake, schedules and old test importer were not changed. This experimental worktree is intentionally separate from main and pending lookup changes. Port reviewed candidate changes onto the current integration branch before any release; do not deploy this older worktree wholesale. The isolated SQL prototype is outside the migration chain.

## Contract and endpoint

- New route: `POST /api/integrations/firewood/candidate-import`.
- Contract: `firewood-paid-order-v1`; source: `website_firewood_candidate_v1`.
- Sandbox account only: `acct_1UU9U8RAZXGe6tX0`. Live mode, live keys, real email contacts, hosted database URLs and generic CRM credentials are rejected.
- Canonical parser/metadata/HMAC/receipt validator: `src/lib/firewood/candidate-contract.mjs`; declarations alongside it. Frozen interoperable fixture: `tests/fixtures/firewood-candidate-contract.json`.
- Order UUID = attempt UUID = Session client reference. Display reference is `FW-` plus the first eight uppercase UUID characters. Neither retries nor observation refreshes mint a new identity.
- Hash is SHA-256 over recursively sorted canonical JSON of the complete normalized order. It includes accepted household-v2 policy/hash, acceptance time, contact, prices and any pre-capture office approval UUID/time. Original Website fixture hash remains `65db00151eb1411aae18c5a2b9b6c2ad2df3e2ae30475def1b7df8f832baa220`.
- Six catalog totals and explicit office-approved reduced prices are supported. Selected stacking remains a line even when its approved fee is zero. No additional tax/fee/automatic discount is inferred.
- HMAC headers/signature use the agreed raw-body path-bound protocol, five-minute timestamp window and 16 KiB body limit. Query strings and unrelated methods/paths are rejected. Responses are `no-store`.
- Default route is unavailable (`503`) unless all dedicated candidate configuration is present. No production environment names or credentials are fallback inputs.

The agreed Website proposal also had a generic live-capable parser. This CRM candidate intentionally rejects live mode; this is not a live contract approval.

## Independent provider evidence and transaction

`verify-candidate-payment.ts` only reads Stripe. It independently checks the account, complete/paid Session, complete product lines, amount/currency/tax/discount/shipping, Session and Intent metadata, succeeded fully received Intent, captured paid Charge and delivery/contact identity. It paginates all refunds/disputes within a bounded deadline. Missing/unknown/inconsistent evidence is an unresolved error, never a zero financial balance.

`SQL: scripts/verification/sql/firewood-candidate-import.sql` creates separate private source/import/observation tables, with RLS and revoked direct grants. Public RPC wrappers require service-role execution **without an end-user subject** and an explicitly enabled disposable source. No source is enabled by the prototype itself.

Claiming an immutable intent and 30-second observation lease precedes provider reads. Finishing uses one transaction for customer/address resolution, invoice, lines, existing payment, balance reconciliation, audit, mapping and observation. Audit failure rolls everything back. Contact conflicts require review without overwriting or merging customers. Invoice/payment/provider mappings cannot move to another order. Expired observations cannot finish; exact lost-response retries return the existing mapping.

Original capture evidence is immutable. Each successful observation is append-only. Current succeeded-refund totals may decrease after a later provider failure; the original payment stays intact, the history remains, and refund review stays required. Pending/requires-action refunds require refresh and review. Missing old refund IDs, changed amounts/identities and regressions from failed/canceled states are rejected. Both `du_` and `dp_` disputes are accepted with terminal-state fencing. Existing refund/dispute balance reconciliation is reused.

Receipts preserve original `paid:true/balance_due_cents:0` evidence separately from current invoice/refund/dispute state. They explicitly report Website notification authority, no CRM customer email, no delivery completion and no payment retry. Importing never creates another Stripe charge, CRM email/reminder, dispatch or completed delivery.

A separate sandbox invoice-terms family preserves the accepted Website policy and avoids asking for payment again. All older terms and legacy test routes retain their original behavior.

## Test environment and evidence

Fresh namespace: `ats_fwcandidate_*` recorded in `/Users/noelsierra/Documents/Codex/2026-10-29/firewood-candidate/environment.json`. Local API `127.0.0.1:61421`, DB `61422`; no managed database was cloned. Local candidate HTTP harness listens only on `127.0.0.1:3218`. It hosts the actual CRM handler and no background workers. The HMAC connection file is private and must not be committed or printed.

Completed checks:

- 103 unit checks covering new and unchanged legacy importers, binding, provider reads, modes, auth, scope, pagination and office approval.
- 98 Firewood/document/legacy-terms regressions, including candidate receipt wording and old clause hashes.
- 25 native PostgreSQL transaction groups: six totals; office/zero-fee stacking; concurrent claim/finish; expired lease; lost response/restart; provider outage; unpaid/delayed payment; contact collision/reuse; mandatory audit rollback; source disabled; duplicate provider identity; refund changes and immutable history; both dispute formats and refund/dispute balance interactions; caller/grant/RLS checks.
- TypeScript and optimized Next build passed. The optimized route returned default-disabled `503/no-store` with no candidate configuration.
- Local Supabase security advisors: no issues found.
- HTTP sandbox account identity verified; unsigned request `401`, unrelated route `404`, unknown test Session `503` without billing.
- Original legacy source hashes preserved; `git diff --check` passed.

Fresh genuine Stripe sandbox end-to-end verification is complete:

- Nine independently verified invoice/payment mappings: the preserved native-first manual handoff, all six local catalog combinations, the $570 office-approved order, and a genuine dispute-card order. Each has one payment and the correct accepted snapshot, customer/address, terms, provider IDs and lines. The office lines are exactly 42,750 + 14,250 cents, each quantity one. Unknown Stripe fees/net remain null.
- The complete automatic path used a genuine signed Stripe event → Website paid-state transaction/outbox → Website worker → CRM transaction. Both confirmation copies were captured; no customer email was sent.
- A genuine $100 partial refund leaves the same $300 order/payment with balance 10,000 cents and review required. A full $990 refund leaves the same original $990 payment/invoice with balance 99,000 cents and review required. The actual dispute is `needs_response`; the original payment/capture stays linked and review is required.
- A genuine paid $450 contact-conflict case was held without an invoice, payment or partial customer record. Its immutable request and explicit review state remain preserved. This paid review case is separate from the nine recorded mappings.
- Lost-success-response retry, duplicate delivery of genuine checkout payloads using test signatures, and an actual controlled restart of only the local3218 candidate endpoint preserved invoice/payment IDs and original capture hashes. The restart replay kept total invoice/payment counts unchanged.
- All CRM job, customer-communication, pending-reminder, outbound-delivery, delivery-request and customer-source-event counts remain zero in the owned candidate database.

The native test worker’s SSH profile blocks forwarding. That security setting stayed intact. The preserved native-first request was handed off through a signed local retry; the full automatic integration tests then ran on a fresh Website-only schema/login in the disposable local database. Its actual TCP DDL/CRUD works only in that schema, and CRM invoice/payment/private-table/public-schema access is denied.

**Verification limits:** delayed/incomplete provider evidence, pending/requires-action refunds, later succeeded-to-failed refund transitions, stale observations and terminal dispute win/loss regressions were exercised with deterministic fixtures against native PostgreSQL. They were not represented as genuine Stripe bank-return events. The actual provider tests covered successful partial/full refunds and an active dispute. No live bank payment or customer transaction was used.

Website restoration/cleanup is complete: its final provider evidence restores the old sandbox webhook’s exact saved fields/status. The dedicated Stripe listener and both owned Website receivers are stopped; no forwards remain. Its final assertions show eight local invoice/payment mappings, the preserved contact-conflict review, 18 captured confirmations/zero sends, 21 completed events and zero pending CRM requests. The earlier native-first mapping makes nine total. Both installed 74-file Website exports and the older two orders/four captured confirmations match their saved state. The candidate3218 endpoint is now stopped too; source, synthetic data and evidence are retained. The CRM read key cannot independently read webhook configuration (`webhook_read` denied); its permissions were not expanded, and restoration is supported by Website’s provider snapshot/guard evidence. This is test verification, not production activation approval.

Relevant evidence files in the private local evidence directory: `candidate-source-manifest.json`, `legacy-preservation.json`, `native-verification.json`, `unit-test.private.log`, `terms-test.private.log`, `build.private.log`, `typecheck.private.log`, `advisors.private.log`, `http-readiness.json`, `next-default-disabled.json`, `genuine-independent-verification.json`, `genuine-contact-conflict.json`, `genuine-side-effects.json`, `restart-verification.json`, `website-schema-isolation.json`, `loopback-bindings.json`. No credential value belongs in this document or test fixtures.

## Before any future release

Reconcile the experimental schema with the actual current migration chain, review deployment configuration and notification ownership, and obtain explicit production activation approval. No production activation is authorized by this work.
