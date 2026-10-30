# Live Firewood: compatibility with the current 102-migration CRM

October 29, 2026. **The new live candidate is compatible with the reviewed focused prerequisite design, but is not an installer for the raw production 102 schema.** This is an independent source/schema assessment. It does not certify a native 102 installation, production permissions, backup enrollment or release readiness. No remote operation or schema change was performed for this assessment.

## Evidence inspected

The following retained artifacts were read without modification:

| Artifact | SHA-256 |
| --- | --- |
| `immutable102.sql` | `f4862e3c84cf0584ee5198d1079db985c49a7fe7543466e12c314a4e492ed78f` |
| `focused102-postimage-schema.private.sql` | `bf38174a28aa8fd334beff56cf95e47c2d4b28f897766a3fb155bb39aebd6c70` |
| `payment-receipt-scope-102-candidate.sql` | `f0009ec4c0c51b7e14cf8ec51554d8bec2dc42bb22c896f1cc18e39afba73327` |

These remain in the existing private release directory under `Documents/Codex/2026-10-29/firewood-finalization/recovery/private-release/`. The proposed live database code is [boundary.sql](../../supabase/review/firewood-live/boundary.sql). The frozen capsule was not rewritten or relabeled to include this new work.

## Schema and authorization findings

- All **75 required columns across eight existing public tables** are present in the focused 102 postimage: customers, service locations, invoices, invoice lines, invoice portal tokens, payments, checkout reservations and activity log. The private refund-observation table is also present. The live candidate uses the existing financial ledger rather than introducing another payment ledger.
- The raw 102 history already provides nullable invoice job IDs, individual/organization contracting-party constraints, service-location references, encrypted invoice capability storage, the four payment preferences, surcharge/refund/dispute columns, and checkout principal/channel fields. The candidate's household customer/location/invoice inserts fit these established shapes. It does not require migration 129 or unrelated main changes.
- Existing activity-log actors include `staff` and `system`; subject type is unrestricted text and subject ID is UUID. The new approval/preparation events fit those constraints. The active owner/admin helper exists with signature `app_private.has_platform_admin_role()` and checks `effective_platform_access(auth.uid())` plus the `owner`/`admin` roles. The live approval RPC should keep using that real helper rather than a new role predicate.
- Existing invoice-line guards lock the parent and prohibit paid/void/leased changes; creating lines on a newly sent invoice remains permitted. Existing payment/checkout guards lock the invoice first. The candidate's payment capture, renewal and observation paths follow the same invoice-before-handoff order; the candidate does not replace those financial guards.
- The candidate uses separate private live tables/functions, RLS, explicit API-role revocations and role-limited entrypoints. It does not relabel the frozen sandbox source, account, terms, capabilities or rows as live. The review fixture's simplified roles/helper are useful behavioral tests, **not proof of the real 102 employment/access predicates or complete privilege catalog**.

## Concrete release blockers

1. **Raw 102 has no `document_terms_version` column or known-terms constraint.** Its immutable SQL contains no `document_terms_version` token. The candidate correctly stops if the known invoice-terms boundary is missing. A focused installer must first apply the separately reviewed preserve-document-terms prerequisite, retain all legacy terms and then extend the constraint for the distinct live family. The frozen focused postimage already demonstrates the prerequisite shape; it is not evidence that production has it.
2. **The payment-receipt claim backport remains a prerequisite.** The narrow retained patch verifies the exact old `claim_outbound_delivery(uuid)` definition before changing invoice-wide receipt matching to payment identity. Its checked source hash/anchor must be revalidated against the actual intended preimage. Never replace the function with a main-branch definition or assume fixture tests cover provider idempotency and retained customer delivery history.
3. **No actual 102-plus-live installation has been exercised.** The in-memory SQL tests use a deliberately small schema and a stub admin predicate. Before a production installation is proposed, restore the exact current 102 business/operations topology privately, apply only the reviewed prerequisites plus this candidate in a bounded transaction, and run actual role/trigger/constraint, payment-recovery and existing-history assertions. Preserve the current Next/Node security floor and exclude unrelated main migrations.
4. **The live schema changes recovery topology.** Five new private tables and their triggers/functions require actual write-admission/deferred-commit/truncate enrollment, observed schema/ACL readback, a fresh paired CRM/Website checkpoint, independently verified off-device freshness and a new five-minute source certificate. Neither the business-only schema export nor the old 142-table certificate proves the new topology is admitted. Do not create or reuse authority IDs during review.
5. **Installation, routing and provider custody remain intentionally unbound.** The review SQL is guarded for isolated synthetic use, creates no source row and defaults every flag off. The code review profile is non-loadable and has null release/database/key/authority references. The actual disabled installer, actual route/header readback and private live provider/surcharge/webhook/email readiness must be independently verified before any collection or sending can be enabled.

## Important operating boundary

Pausing new orders should stop Website admission and the collector without deleting accepted orders or disabling the retained status/reconciliation source. `enabled=false` intentionally denies the source RPCs, including status. The eventual runbook must distinguish a full source hold from an order/collection pause and preserve the verified receiver under the write guard.

The local SQL behavior tests may use generated fictional addresses on an ATS-controlled domain solely in an in-memory database with no sender, provider or network transport. This allows the **unchanged ordinary live contact guard** to be tested positively. `.invalid` fixtures remain confined to explicit contract/handler test seams, and the ordinary live protocol must continue rejecting sandbox contacts.

## Engineering decision

Proceed with the default-off implementation review and isolated compatibility rehearsal. **Do not treat the current candidate, focused capsule, or in-memory test suite as production release approval.** Keep the frozen sandbox/staging interface unchanged; retain one live invoice per accepted order, trusted office-issued price approvals and the existing financial/email transaction boundaries.
