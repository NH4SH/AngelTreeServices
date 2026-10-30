# Firewood issuance and cancellation credit: independent security review

October 30, 2026. **Accept the corrected package for local synthetic verification. Security/catalog checks passed; this is not production admission.** The package remains unbound, and no production, staging, scanner, provider, credential or customer-email operation was performed by this review.

This follows the earlier [native rehearsal review](FIREWOOD_NATIVE_REHEARSAL_SECURITY_REVIEW.md). That report remains the historical record of the issuance/reporting blocker. The new accounting package addresses that blocker through an explicit issuance model and a separate cancellation credit, rather than changing the original cash ledger or inventing delivery evidence.

## Design decisions verified

- **Issuance is distinct from delivery.** The private handoff records server-generated, immutable `issued_at`. Installation rejects existing live handoffs requiring historical reconciliation; it does not backfill timestamps. Preparation leaves `sent_at` absent. Disabling the source does not turn an issued invoice back into a draft.
- **Only two original function bodies change.** `public.reconcile_invoice_balance(uuid)` dispatches managed Firewood to its accounting helper; `app_private.reconcile_outbound_delivery(uuid)` records genuine accepted document delivery and invokes the same accounting path for managed invoices. Removing only those exact dispatch additions reconstructs both actual 102 bodies byte-for-byte. Ordinary invoice behavior, authorization, amounts and reminder behavior are retained.
- **A credit releases debt; it does not record money.** The new private, append-only credit table leaves original invoice/line/payment/refund amounts intact. A composite foreign key binds invoice, source, order and full principal to the accepted handoff. Unique invoice and request keys prevent repeated credits. Genuine credit evidence derives `credited`, zero collectible balance and `paid_at = NULL`; credit never enters `invoice_paid_principal`.
- **The command owns authority and atomicity.** Only the existing effective owner/admin boundary can execute the authenticated credit command. It rereads the locked invoice/workflow, revision and full ledger hash, requires a fully refundable cancellation with zero retained gross and no pending or unresolved financial evidence, and requires positively reviewed terminal checkout ownership. The credit, derived header, workflow revision, audit and retry acknowledgement share the transaction. Final cancellation remains a separate reviewed action.
- **Historical reports retain time meaning.** Original gross invoice rows remain in their original period. A separate negative billed adjustment posts on the credit's actual creation date. Receivables use the truthful stored collectible balance; there is no draft/status exception hiding debt. Private credit rows are read through one stable definer helper with the actual financial-role gate; table access remains denied.
- **Collection and reconciliation stay separate.** New manual collection is blocked while cancellation is held. Real late provider evidence remains writable and requires review/refund handling; it must not undo the credit, reopen collection or falsely restore a payment date. The detailed money and concurrent-ordering assertions belong to the finance/concurrency suites.

## Finding corrected during native review

The first reporting extension used `CREATE OR REPLACE VIEW` without an explicit view option. **Actual PostgreSQL readback showed that this removed `security_invoker=true` from `app_private.report_invoices`.** Owner and ACL preservation alone did not preserve its authorization behavior. The strict verifier rejected this postimage.

The source now declares `WITH (security_invoker=true)` explicitly. Root repaired only this option on the owned synthetic clones. The independent rerun confirmed the original view owner, ACL and invoker option all remain exact. The verifier was not relaxed. UTC settings on the accounting helper were also bound into the final source/body/settings comparison so signed accounting snapshots have a consistent timestamp representation.

## Measured native results

The fresh development cluster is PostgreSQL 17.11, system identifier `7702329566697176992`, with an explicit synthetic marker, private Unix socket and owned directory. Base database: `fw_office_native_28956add6ba1`; fence tests used its separate `_guard` clone. No production connection was opened.

| Check | Result |
| --- | --- |
| Original/final catalog | 301 → 348 functions; 138 → 148 tables |
| Private live tables | Exactly ten, RLS enabled, owner-only direct ACLs |
| Public live commands | Exactly 19: ten authenticated commands, nine service commands; anonymous execution denied |
| Additional private API execution | Only the declared financial-report helper, authenticated and internally gated; all other private live helpers denied |
| Original deltas | Narrow receipt backport; two scoped dispatches; appended guarded `credited` status; source-derived invoice reporting view |
| Other original boundaries | Functions/settings/owners/ACLs, RLS/policies, role flags/memberships, default privileges, role settings, views/sequences/event triggers preserved |
| Source/runtime | Zero source rows; four flag defaults false; runtime factories remain `null` |

The original-function permits were independently derived from the baseline plus the reviewed source bodies. The reporting view and status-check permits were independently canonicalized from source in temporary objects inside the supplied guard clone, then rolled back. They were not approved by copying observed postimage hashes.

**32 actual native fence tests passed.** All ten live tables received the exact thirty enabled admission, deferred-commit and truncate triggers. Every unadmitted insert and nonoperator truncate failed; fresh admission worked; holder/postmaster/future-time/expiry/five-minute/topology failures denied writes; freshness lost after an admitted row change failed at commit and rolled back; topology change required reenrollment. The seven retained guard bodies/settings/privileges matched their pinned source. Temporary probes and the synthetic source were removed, and the synthetic holder/lease were cleared.

Three additional actual denial probes passed: anonymous, service-role and authenticated-without-financial-identity callers could not read the private credit report helper. Actual catalog verification also confirmed the composite full-principal foreign key, unique invoice/request constraints and non-null server issuance default.

## Evidence and release boundary

Final reviewed source hashes:

| Source | SHA-256 |
| --- | --- |
| `accounting.sql` | `dc99b8810e7dd144f4988688f5357da3f40593e877d0b63cc6aab6146c49aae1` |
| `reporting-accounting.sql` | `6f9c79b2bfc36e8e2fd83574d672aefd6466b7093d7f690d1f44bb92e99b5945` |

Private evidence is retained under `Documents/Codex/2026-10-30/firewood-accounting-repair/target-28956add6ba1/`: `ACCOUNTING_SECURITY_READBACK.json`, `SECURITY_SOURCE_DERIVED_PERMITS.json`, `CREDIT_STRUCTURAL_BINDING_PROOF.json`, `REPORT_HELPER_DENIAL_PROOF.json`, `GUARD_PROOF.json` and the native guard harness. The reusable readback checker keeps its original strict nine-table default; accounting additions require an explicit reviewed profile.

The earlier frozen capsule is unchanged: `a7a6a9f933af08d8842d45c57b75803fe8e4c26f4bc5444a68f6e7107fe6d1e2`. No old authority/certificate was extended to cover these changes. Actual provider/source installation, customer-route admission, ten-table recovery enrollment and independent paired off-device five-minute proof remain release gates. A local fence lease is not a recovery certificate. The coordinator records final shutdown of this owned cluster after all synthetic suites finish, preserving its evidence and all existing services.
