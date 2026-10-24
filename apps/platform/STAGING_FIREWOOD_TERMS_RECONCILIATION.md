# Staging migration 124 — Firewood invoice terms

October 24, 2026. Complete on **ATS CRM Staging only** (`gbyhdsuiqeslgjdnbqng`): **124 native migrations**, latest `20261024190625`. The verified Firewood invoice/email implementation is pushed normally to `origin/main` as `90ac38e7c54f9cb47396fa73a4f9be0dd8e5bb61`. This reconciliation remains a local commit on `codex/staging-firewood-124`, based on that main. No app deployment, production query/change, key rotation, customer email or payment-provider request occurred.

## Installed result and preservation

The exact committed `20261024190625_firewood_invoice_terms.sql` was installed through the native Supabase CLI, following a fresh physical-target check and a dry run listing **only that migration**. No seed, custom-role, Vault, config or Auth import was requested. No migration repair or fabricated ledger entry was used. A second dry run reports up to date, with zero pending migrations.

The complete new migration ledger entry, including statement history, matches a fresh native local installation. All **123 original complete ledger entries** are unchanged. The catalog now has **5,113 objects**: one private invoker validator is added, three existing invoice command bodies are updated, and the invoice supported-version constraint accepts the reviewed Firewood version. The entire result matches the independent local rehearsal and staging candidate transaction.

Every other catalog entry is unchanged. The three replaced commands retain their owners, ACLs, arguments, result types and routine settings. The private validator has an empty search path, remains security invoker, and has no direct API-role execution grant. Existing RLS, role/column/default privileges, quote/approval expiry, payment locks, financial formulas, no-relabel triggers, reminder commands and prior recovery guarantees remain intact. See `FIREWOOD_INVOICE_TERMS.md` for the implemented product-family checks and old committed-request recovery.

All **49 protected business/Auth/history sets**, communication/recurring settings and the no-send Auth guard match the original staging baseline exactly. Automatic sending, appointment-change notices and recurring generation remain **OFF**. Every saved invoice/proposal terms binding is also sealed separately in the new read-only checkpoint. Existing invoices retain their original version; historical invoices, request receipts, email payloads, payment records and delivery history were not rewritten. Reconciliation prepares or sends no messages.

## Verification

| Check | Result |
| --- | --- |
| New, seed-free owned local database | All original 123 migrations replayed without resetting a shared database |
| Local candidate transaction | **87 assertions**; candidate and fixtures rolled back exactly |
| Deliberately failed native local upgrade | Catalog, data and native ledger rolled back together |
| Native local installation and repeat | 124 entries; original history/protected state preserved; zero pending on repeat |
| Installed local SQL | **87 assertions**; synthetic fixtures rolled back |
| Actual installed local Auth/API/action acceptance | **19 scenarios / 20 TAP results**, 250 caller requests and 22 invoice-command requests |
| Fresh staging preflight | Exact physical identity, 123-entry ledger, pinned catalog, bindings, protected state and OFF controls |
| Staging candidate transaction | **87 assertions**; expected local catalog matched and complete rollback verified |
| Targeted native staging installation | Only unchanged migration 124; original complete 123 ledger rows retained |
| Installed staging SQL | **87 assertions**; all fixtures rolled back and protected state remained unchanged |
| Native staging repeat | Up to date; zero pending migration, seed or role imports |
| Read-only 124 maintenance | Fresh hosted observation and **13 acceptance/rejection tests** passed |
| Full CRM regression suite | **2,936 passed**, zero failures, cancellations or skips |
| Separate manual-reminder suite | **21 passed** |
| Fresh native schema, offline fingerprints, framework floor, route types and TypeScript | Passed on Node 22.23.4; public signatures, generated types and original migration files unchanged |
| Native-record document/email rendering | Four installed local/staging records, legacy and Firewood, passed real document, customer-page and email-HTML rendering |
| Security advisors | Exact before/after equality: local **0**, staging existing **80**; no new findings |

Native SQL checks include synthetic stored roles, effective-access denial, arbitrary-version rejection, confirmed domestic-use creation, original committed-request recovery, generic/Firewood separation, immutable bindings, product/quantity restrictions, existing financial/stale-edit protections, audit confirmation and preservation of original records. Candidate tests start with an invoice/request created under the pre-upgrade command. Installed-version fixtures exercise the same legacy input shape under the installed command. Each hosted suite runs in a rollback transaction.

Actual local API checks use real local Auth sessions, PostgREST/native transactions and the existing Firewood/invoice actions. They exercise defaults and edited prices, atomic walk-in creation, concurrent identical submissions, lost-response retry, changed-request denial, old legacy-request recovery, confirmed copies, edits, stale `PT409`, listing/address behavior and allowed/denied identities. The existing test-only guard now recognizes this reconciliation's owned namespace and additionally requires matching container identity and the expected database port. Production application code is unchanged. The pre-existing ancillary copy activity adapter remains stubbed in that test; the native invoice audit is real.

Staging SQL uses synthetic identities and simulated caller claims. Hosted Auth-session/browser, real-mailbox delivery, physical-device, spoken-screen-reader and native PDF-export acceptance are not claimed. The four installed-record renderer checks use deterministic payment/transport adapters; they send no email and make no payment. The prior implementation's successful optimized build and rendered desktop/mobile checks remain applicable because application/UI source and dependencies did not change; they were not repeated. Fresh schema/type checks and the complete regression suite were repeated for this reconciliation. No separate lint script is configured.

The inherited staging advisor baseline is 79 authenticated-definer notices and one leaked-password-protection warning. This migration does not change their privileges or the project setting. The separate managed-runtime worktree remains untouched at `06580f6c922fa6ab0ebaf229d27b1d30097f1b78`.

## Maintenance and release boundary

Current staging maintenance uses `supabase/staging/firewood-terms-candidate-124.json`, `firewood-terms-snapshot-124.sql` and `scripts/release/verify-staging-firewood-terms-candidate.mjs`. The script has **no installation path**. It accepts only the assigned staging reference and read-only options; production, apply/repair/deploy flags, changed migration bytes, altered native history/catalog/permissions, stale/wrong physical identity, changed protected records or immutable bindings, and enabled automation are rejected. The new snapshot recognizes only the two supported invoice families and separately fingerprints every saved invoice and proposal binding. Older candidates and receipts remain unchanged historical checkpoints.

The deferred inventory now records that migration 124 is reconciled in staging while retaining `productionReady: false` and `readyForHosting: false`. It does not authorize a general migration push, app release, production installation, automatic activation or resend. ATS's seller-side Forest Products Tax filing/classification, wider policy decisions, real-mailbox/device acceptance and the separate managed-runtime issue remain open. No new business policy or tax charge was introduced here.

Only this task's new loopback database is stopped after verification; its synthetic volumes are retained. Shared local stacks, the home scanner and existing worktrees are preserved. This documentation and checkpoint are saved locally, pending a later push instruction. Record-scoped document-email delivery/history browsing remains the next communications priority in the existing roadmap.

Private evidence: `/Users/noelsierra/Documents/Codex/2026-10-24/staging-firewood-124/`. Sanitized receipt: `staging/FIREWOOD_TERMS_RECONCILIATION_VERIFICATION_20261024.json`. Raw snapshots, identities, session credentials, connection details and logs remain outside Git.


## Push and communications follow-through

This verified reconciliation is pushed normally to main as `5cdc0b8`. `RECORD_DOCUMENT_EMAIL_HISTORY.md` records the subsequent local, read-only communications batch. Its 95 native assertions passed in each local/staging target with all synthetic fixtures rolled back and the exact 124 checkpoint preserved. No new migration or app deployment, production operation, automation activation or customer send accompanies that feature.
