# Staging migration 126 — deterministic Delivery review paging

October 25, 2026. Complete on **ATS CRM Staging only** (`gbyhdsuiqeslgjdnbqng`):
**126 native migrations**, latest **`20261026003309`**. The verified implementation
is pushed normally to main as **`a7044a2`**. This reconciliation is local on
`codex/staging-delivery-queue-126`. No app deployment, production query/change,
customer email, provider request or key rotation occurred.

## Installed result

The exact committed `20261026003309_deterministic_delivery_review_paging.sql` was
installed through the native Supabase CLI. Seed, role and Vault imports were
explicitly disabled. The immediate native dry run listed only migration 126.
No migration repair, synthetic history entry, config/Auth import or backlog replay
was used. The repeat dry run is up to date with no pending migration/import.

The new complete native entry, including its statements, matches the fresh local
upgrade. All **125 original complete native history entries** are unchanged.
The catalog now has **5,119 objects**. The only changes are the reviewed bodies of
`list_outbound_deliveries` and `list_pending_customer_source_events`, plus three
ready/valid indexes supporting their total order. Every other **5,114 catalog
objects**, both readers' full security metadata/ACLs and all earlier indexes remain.

All **49 protected business/Auth/history sets**, individual invoice/proposal terms
bindings, approval semantics, communication/recurring settings and the no-send Auth
guard are unchanged. Staging's automatic sending, appointment-change notices and
recurring generation remain **OFF**. No send/repair command was called. Existing
RLS, source visibility, effective staff/admin boundaries, financial commands,
immutable messages, leases, idempotency, audit and record history are preserved.

The UI, existing numbered links, filters, exact counts, page sizes, selected-link
validation, recovery controls and failed-read/empty-state behavior are unchanged.
Paging has a unique timestamp/UUID (or source-order/UUID) order for stationary
matching rows; concurrent additions/state changes can still shift live pages.

## Verification

| Check | Result |
| --- | --- |
| Fresh owned seed-free local baseline | All original 125 migrations replayed; no shared reset |
| Local candidate | 128 tied-paging assertions; exact candidate delta and rollback |
| Failed native local upgrade | Reader/index changes, protected data and native ledger roll back together |
| Local native connection bounds | Explicit URL runtime settings of 3s lock / 90s statement verified inside the deliberately failed migration |
| Native local installation/repeat | 126 entries, original history/state preserved; zero pending on repeat |
| Installed local SQL | 128 paging + 34 security/read assertions; synthetic fixtures rolled back |
| Actual installed local Auth/API | 10 scenarios / 11 TAP results, 151 read-only GETs including 18 selected reads; no provider I/O |
| Fresh staging preflight | Exact physical identity, complete 125 history/catalog, protected state/bindings/guard and OFF controls |
| Index target screening | Both target tables small; no conflicting granted write/DDL locks before the native run |
| Staging candidate | 128 paging + 34 security/read assertions, exact local candidate catalog and complete rollback |
| Native staging installation | Only unchanged migration 126; complete native entry matches local |
| Installed staging SQL | 128 paging + 34 security/read assertions; all synthetic fixtures rolled back |
| Staging repeat | Up to date; no pending migration, seed, role or Vault import |
| Read-only 126 maintenance | Fresh hosted observation; 20 acceptance/rejection checks |
| Full CRM regression | 3,185 passed; zero failures, cancellations or skips |
| Separate manual-reminder suite | 21 passed |
| Fresh schema, offline fingerprints, framework floor, route types and TypeScript | Passed on Node 22.23.4; public generated types, migrations and application source unchanged |
| Security advisors | Exact before/after equality: local 0, staging inherited 80; no new findings |

Native cases exercise same-timestamp and same-source-order batches beyond 1,000
matching records, every page/ID/count, repeat/alternate plans, bounded previews,
selected requests, private-body redaction, matching ordered indexes and all eleven
stored-role/effective-access identities. Hosted fixtures use rollback transactions
and explicitly supplied source identity values so no hosted sequence is advanced.
Actual local tests use real Auth/PostgREST and preserve complete tested delivery/
source/history/finance/queue/audit/settings fingerprints while browsing. Their
existing opt-in/loopback/container/no-provider guard additionally recognizes only
this task's newly owned `ats_queue126_…` namespace.

The preceding implementation's optimized build remains applicable: application
source, dependencies, generated public types and migration source bytes did not
change. That build and browser pass were not repeated. Fresh schema/type checks
and the complete regression suite were repeated. Hosted Auth/browser, customer
mailbox, physical-device and spoken-screen-reader acceptance are not claimed.

## CLI interruption finding

The staging connection was configured in this task's isolated CLI cache with
requested 3s lock / 90s statement settings. A controlled 20-second **owned staging
table-lock test** showed those settings could not be relied upon as an enforced
server deadline. The migration client was stopped after its 12-second deadline,
but the server transaction continued and migration 126 subsequently committed.
The harness incorrectly assumed client interruption cancelled the transaction.

Before any retry, the actual committed database was inspected. It had the exact
expected 126 entry/catalog and preserved all old history and protected state.
The migration was **not retried**, undone or repaired. Installed-state tests and
the zero-pending repeat then passed. A missing space in the diagnostic cleanup
predicate also caused its explicit cancellation attempt to fail; the owned lock's
bounded sleep/rollback expired normally. Follow-up checks found zero owned test
sessions and zero conflicting locks. The diagnostic harness is retired.

This is a tooling/release limitation, not a claim of a verified staging 3s timeout.
Neither a CLI process timeout, `PGOPTIONS`, nor requested connection startup settings
should be treated as proof of server cancellation. Future timed migration tooling
must establish and verify transaction-local server limits, observe authoritative
catalog/history after any interruption, and avoid blindly retrying. Review that
path before any production rollout. Do not change the already committed migration
126 or its native history to retrofit execution wrappers. No production database
was contacted during this diagnostic.

## Current checkpoint and release boundary

Read-only maintenance uses:

- `supabase/staging/delivery-queue-candidate-126.json`
- `supabase/staging/delivery-queue-snapshot-126.sql`
- `apps/platform/scripts/release/verify-staging-delivery-queue-candidate.mjs`

The gate rejects production/write/repair/deploy targets, stale/wrong physical
identity, source/history drift, body hashes that differ from the committed SQL,
permission/security-mode changes, incorrect indexes, altered old catalog/RLS,
protected-state/binding/guard changes and enabled automation. It reconstructs the
complete old catalog by removing only the three reviewed indexes and restoring
only the two pinned prior reader definitions. The original 125 checkpoint stays
unchanged as historical evidence.

The deferred manifest still has `productionReady: false` and
`readyForHosting: false`. This reconciliation authorizes no application deployment,
production activation or resend. Server-confirmed migration execution/cancellation
is a release-preparation follow-up; record-return context and existing mailbox/
device/accessibility and managed-runtime work remain in their existing roadmap.

Private evidence: `/Users/noelsierra/Documents/Codex/2026-10-25/staging-delivery-queue-126/`.
Sanitized receipt: `staging/DELIVERY_QUEUE_RECONCILIATION_VERIFICATION_20261025.json`.
Raw snapshots, credentials, connection details and logs are excluded from Git.
Only this task's loopback stack is stopped, retaining synthetic volumes. User tabs,
other services/worktrees and the home scanner are preserved. The runtime-security
worktree remains at `06580f6c922fa6ab0ebaf229d27b1d30097f1b78`.
