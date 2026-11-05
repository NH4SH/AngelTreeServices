# Verified Firewood forward-port boundary

This review branch starts from main `665b67f` and keeps its 129-era behavior. It does not replace the frozen live 102-era application wholesale. It must not be deployed as a complete live Firewood release yet.

## Included active source

- Notification inbox interruption handling and private, complete JSON errors.
- Owner/admin Firewood office workspace, saved-order retry, price review, cancellation, delivery-window review, retained audit history and safe accounting commands.
- Invoice-to-order navigation and coordinated cancellation; existing session authorization, RLS and checkout closure lease stay in force.
- Pure handoff contracts, bounded/signed handlers and exact routes. The protected runtime uses the existing fixed root-owned readonly metadata/secret paths, source/schema/key binding, upstream recovery signature verification, worker marker and fresh lease checks. It supplies no authority from environment flags and is closed on an unenrolled build.
- Six upstream read-only verifier copies with pinned hashes. Synthetic tests exercise cryptographic, filesystem, lease, mode and supplier boundaries; no test creates actual root mounts, reads real credentials or connects a provider.
- Guarded reference SQL outside `supabase/migrations`; no installer or automatic activation.

The office page uses main’s existing Firewood navigation rather than the older live invoice-navigation workaround. The invoice page retains main’s reminder summary, versioned portal links and asynchronous reader behavior. The cancellation commands/SQL are the existing reviewed implementation, not rewritten transactions.

## Required before an active main-based release

1. Forward-port the operative collector admission (`collector-admission`, `receipt-source-gate`) and its narrow hooks into `stripe/server.ts`, `stripe/invoice-checkout.ts`, `stripe/card-payment.ts`, payment context/reconciliation/recovery and customer invoice routes. Preserve newer main behavior in those files; do not copy complete 102-era files over them. The newly preserved development `collector-policy.ts` remains non-operative/test-scoped and is not yet imported by main’s existing payment modules.
2. Review the customer invoice portal presentation and existing immutable Firewood terms/receipt hooks against newer main. The root-owned handoff/office adapters alone do not establish complete collection/receipt safety.
3. Reconcile the independent Firewood SQL/profile against the actual intended target and current application ledger. Existing review SQL expects an approved 102-era preimage and is not a 129-era migration installer.
4. Produce fresh exact source/image/schema/key/read-only mount/paired recovery evidence and a new explicit release admission for that complete candidate. Keep the frozen 702-file cancellation/notifications candidate unchanged for its independently reviewed maintenance release.

Already-live customer-checkout simplification and exact controller source are preserved under `ops/verified-releases/2026-11-04`. The broad archival branch `1586ba9` remains provenance, not an implementation merge candidate. Existing dirty development files, estimate photos and new paid-to-delivered fulfillment work are outside this consolidation.

## Local collector follow-up

The separate `codex/firewood-collector-forward-port-20261104` branch forward-ports the collector/receipt/payment and customer accounting hooks described above. See `FIREWOOD_COLLECTOR_FORWARD_PORT_REVIEW.md` for scope and tests. This does not enroll or deploy a 129-era target; the target SQL/catalog and protected release evidence remain prerequisites.
