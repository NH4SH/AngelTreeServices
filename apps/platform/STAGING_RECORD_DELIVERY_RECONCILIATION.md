# Staging migration 125 — record delivery visibility

October 25, 2026. Complete on **ATS CRM Staging only** (`gbyhdsuiqeslgjdnbqng`):
**125 native migrations**, latest **`20261025173049`**. This reconciliation is local
on `codex/staging-record-delivery-125`, preserving the verified record-delivery
implementation commit `8bf106f` and its current-main ancestry. Neither that batch
nor this checkpoint was pushed by this continuation. No application was deployed,
and no production query/change, key rotation, provider request or customer email occurred.

## Installed result

The exact committed `20261025173049_record_delivery_visibility.sql` was installed
through the native Supabase CLI after a fresh physical-target/baseline check and
an immediate dry run listing **only that migration**. The operation explicitly
excluded seed, custom-role and Vault imports. No config/Auth import, migration
repair or fabricated history entry was used. The repeat dry run is up to date,
with zero pending migrations or imports.

The full new native ledger entry, including its statements, matches the fresh
local rehearsal. All **124 original complete history entries** are unchanged.
The catalog has **5,116 objects**, adding only:

- The public **invoker** `list_record_delivery_requests` endpoint, which checks
  source visibility under the caller's RLS.
- The private, stored/effective-staff-gated metadata reader, with an empty search
  path and only the reviewed authenticated/postgres execution grants.
- The private, ready/valid GIN index on outbound context containment, supporting
  exact invoice/change-order membership and any proposal in a multi-proposal request.

There are no modified or removed pre-existing catalog objects. Existing RLS,
role/column/default privileges, financial commands, payment locks, immutable
terms, proposal expiry, reminder controls, dispatch/acceptance/reconciliation,
idempotency, retry/lease safeguards and audit history are unchanged. Frozen
message bodies, portal tokens and source snapshots remain private.

All **49 protected business/Auth/history sets**, individual invoice/proposal terms
bindings, communication/recurring settings and the no-send Auth guard match the
pre-upgrade baseline exactly. Staging's automatic sending, appointment-change
notices and recurring generation remain **OFF**. The migration prepares and sends
no messages. This database reconciliation does not publish the new UI.

## Verification

| Check | Result |
| --- | --- |
| Fresh seed-free owned local database | All original 124 migrations replayed; no shared database reset |
| Local candidate transaction | 100 assertions; candidate and fixtures rolled back exactly |
| Deliberately failed native local upgrade | Catalog, private index/functions, protected data and native ledger rolled back together |
| Native local installation and repeat | 125 entries; original history/state preserved; zero pending on repeat |
| Installed local SQL | 100 assertions; fixtures rolled back |
| Actual installed local Auth/API acceptance | Nine scenarios / ten TAP results, 196 scoped GET reads; no provider I/O |
| Fresh staging preflight | Exact physical identity, complete 124 ledger, catalog, protected state, bindings, guard and OFF controls |
| Staging candidate transaction | 100 assertions; local catalog match and exact complete rollback |
| Targeted native staging installation | Only unchanged migration 125; all original history retained |
| Installed staging SQL | 100 assertions; all synthetic fixtures rolled back |
| Native staging repeat | Up to date; no pending migration, seed, role or Vault import |
| Read-only 125 maintenance | Fresh hosted observation and 17 acceptance/rejection checks passed |
| Full CRM regression suite | 3,090 passed; zero failures, cancellations or skips |
| Separate manual-reminder suite | 21 passed |
| Fresh native schema, offline fingerprints, framework floor, route types and TypeScript | Passed on Node 22.23.4; public signatures, generated types, original migrations and production application code unchanged |
| Security advisors | Exact before/after equality: local 0, staging existing 80; no new findings |

Native checks include independent named outcome fixtures, prepared/in-flight/unknown
requests, completed/acknowledged terminal work, pending repair/follow-up, delayed
and adverse reports, all eleven stored-role/effective-access identities, the private
helper's independent guard, source RLS, strict scope/page validation, complete
paging beyond 1,000 matches, UUID ties, metadata redaction and index usability.
Each hosted suite is inside a caller-owned rollback transaction.

Actual local tests use real local Auth sessions, PostgREST and installed native
functions. They retain record scopes through every GET, verify all proposals in
multi-proposal requests, recover exhausted pages, distinguish empty/missing/error,
deny anonymous/nonstaff/forged/invalidated sessions, and prove that even active
staff cannot call the private helper through the exposed API. Complete fingerprints
preserve outbox, history, queue, finances, settings and audit during browsing. The
existing integration guard was extended only to this task's newly owned namespace;
matching container identity, loopback API, explicit disposable opt-in and no-provider
network safeguards remain required.

Staging verification uses synthetic identities and simulated caller claims.
Hosted Auth-session/browser, customer-mailbox, physical-device and spoken-screen-reader
acceptance are not claimed. No customer email was sent. The prior implementation's
successful optimized build and responsive browser checks remain applicable because
production application source and dependencies did not change; that build and UI
pass were not repeated. Fresh schema/type checks and full regression were repeated.
No separate lint script is configured.

Staging retains its inherited 80 advisor findings: 79 authenticated-definer notices
and one leaked-password-protection warning. This migration does not change those
existing privileges or the project setting. The separate runtime-security worktree
remains at `06580f6c922fa6ab0ebaf229d27b1d30097f1b78`.

## Checkpoint and release boundary

Current read-only maintenance uses:

- `supabase/staging/record-delivery-candidate-125.json`
- `supabase/staging/record-delivery-snapshot-125.sql`
- `apps/platform/scripts/release/verify-staging-record-delivery-candidate.mjs`

The maintenance script has **no installation path**. It rejects production/write/
repair/deploy flags, wrong or stale physical identity, source/history changes,
reader privilege/security-mode drift, an invalid containment index, altered old
catalog/RLS, changed protected records or bindings, guard changes and enabled
automation. It seals the complete installed catalog and the prior catalog after
excluding only the three reviewed additions. The original migration-124 checkpoint
is unchanged and remains a historical pre-upgrade reference.

The deferred manifest records staging reconciliation while retaining
`productionReady: false` and `readyForHosting: false`. It authorizes no general
migration push, application deployment, production activation or resend. The
existing policy/tax-preparer, managed-runtime, mailbox/device and broader roadmap
follow-ups remain separate. The next handoff is pushing the verified implementation
and reconciliation when requested; any application release remains separately authorized.

Private evidence: `/Users/noelsierra/Documents/Codex/2026-10-25/staging-record-delivery-125/`.
Sanitized receipt: `staging/RECORD_DELIVERY_RECONCILIATION_VERIFICATION_20261025.json`.
Raw snapshots, session credentials, connection details and logs remain outside Git.
Only this task's owned loopback database is stopped after verification; synthetic
volumes, other stacks, existing worktrees, user tabs and the home scanner are preserved.
