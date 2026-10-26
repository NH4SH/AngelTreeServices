# Deterministic Delivery review queue paging

Verified October 25, 2026. The previous Delivery review read fixes are pushed
normally to `origin/main` through **`d17b4be`**. This next PR14 follow-through is
local on `codex/deterministic-delivery-queue`. Nothing was deployed, production
was not queried or changed, and no provider request or customer email was sent.

## Change and boundaries

The existing native delivery reader sorted only by `created_at`. Requests created
in one transaction commonly share that timestamp. Different LIMIT/OFFSET plans
could choose different tied rows, causing duplicate or missing entries when
browsing a stationary queue. The old function failed the new first-page tied-row
assertion before any candidate migration was applied.

Candidate migration **126**, `20261026003309_deterministic_delivery_review_paging.sql`,
adds a total order at both the row selection and JSON aggregation boundaries:

- Needs review and Recent deliveries: `created_at DESC, id DESC`.
- Office notice preview: `submitted_at DESC, id DESC`.
- Legacy uncertain receipt preview: `created_at DESC, id DESC`.
- Pending customer activity: `event_order ASC, id ASC`. Normal identity allocation
  is ordered already; the UUID also resolves repeated order values from imports
  or restores without rewriting historical events.

Two delivery indexes support the full queue and the existing attention predicate.
A composite partial source index supports pending activity. Existing indexes are
retained. Only two existing function bodies change. Their signatures, defaults,
metadata projection, counts, stable volatility, owner, definer setting, empty
search path and complete EXECUTE ACLs are preserved. There is no new endpoint,
table grant, RLS change, mutation command or historical backfill.

The UI, selected-request validation, failed-read/empty-state distinction, filters,
50-row delivery pages, 20-row source pages/previews, numbered links and existing
recovery controls are unchanged. Current retry/copy/repair authorization,
confirmations, audit, frozen messages and financial behavior are unchanged.

Numbered pages still describe the **current** queue. New arrivals or state changes
between requests can change page membership. This does not create a frozen session
or cursor protocol. Existing page limits and bounded office/legacy previews remain;
the change guarantees a unique order for a stationary matching set. Introducing a
new cursor/session contract would be separate work, not a silent change here.

## Verification

- Fresh owned loopback Supabase replay through all **126 original migrations**,
  with seed disabled. The public TypeScript schema is byte-identical. The schema
  manifest was regenerated from that replay; earlier migration hashes are intact.
- **128 native tied-paging assertions** passed on the fresh local replay and in
  a rollback-only ATS CRM Staging candidate transaction. Fixtures include 1,301
  same-timestamp deliveries, 1,201 same-order source events, and 31 tied entries
  in each bounded preview. Complete traversals beyond 1,000 matching rows compare
  every ID and count, detect duplicates/omissions, repeat alternate scan plans,
  verify selection/redaction and preserve all tested rows and settings.
- The existing **34 native security/read assertions** passed on each target with
  the candidate. Effective owner/admin/staff boundaries and denied nonstaff,
  disabled, separated and removed-role identities remain enforced.
- **10 actual local Auth/API scenarios / 11 TAP results** passed, including **151
  read-only RPC GETs** and 18 selected reads. Both tied queues and source activity
  are traversed completely; repeated pages, selected/missing/invalid requests,
  bounded recovery, malformed-response handling and current role/session denials
  remain correct. Reads preserve the fixture's delivery/source/history/finance/
  queue/audit/settings fingerprint. No recovery or send command is invoked.
- **3,165 CRM checks** and the separate **21 manual-reminder checks** pass with
  zero failures, cancellations or skips. One existing inventory test now expects
  126 repository sources / 33 deferred entries; its historic 93-entry checkpoint
  and staging's installed 125-entry ledger remain unchanged.
- Fresh schema check, offline fingerprints, framework floor, route type generation,
  TypeScript and optimized build pass with Node **22.23.4**, Next **16.4.2** and
  React **19.2.9**. No dependency, public generated type or build setting changed.
- Advisors remain local **0** and staging's exact inherited **80**. The existing
  staging findings are not represented as fixed by this batch.

The exact staging catalog delta was inspected **inside** the candidate transaction:
two reader body hashes changed and three ready/valid indexes were added. All
other 5,114 catalog objects and both readers' complete security metadata/ACLs
match the installed checkpoint. Ledger, business/history sets, immutable document
bindings, approval functions, no-send Auth guard and OFF automation settings match
inside the candidate and after rollback. The final installed checkpoint is still
**125 migrations / 5,116 catalog objects / 49 protected sets**.

Ordering correctness is tested independently of plan choice. Staging's tiny
rollback fixtures have stale estimates, so the planner can legitimately prefer
an existing index plus sorting. Ordered-index support checks use transaction-local
planner switches; they do not change hosted statistics or configuration and are
not a production performance benchmark. No ANALYZE, sender, deployment, migration
repair or permanent staging installation was performed.

The indexes use transactional `CREATE INDEX`, which takes write-blocking relation
locks while building. Permanent reconciliation must review target size and lock
availability and retain the short lock timeout used by these staging tests. No
production volume was queried or production build duration estimated here.

Hosted browser/Auth acceptance, customer mailboxes, mobile devices and production
acceptance are not claimed. There is no UI change in this batch. The separate
runtime-security worktree remains at `06580f6c922fa6ab0ebaf229d27b1d30097f1b78`.

## Evidence and next existing-roadmap step

Sources: the candidate migration, `supabase/verification/deterministic_delivery_queue.sql`,
`tests/deterministic-delivery-queue.integration.test.mjs`, regenerated schema
manifest and the existing deferred-source inventory/test. Existing application
components, delivery readers/actions and all earlier migrations are unchanged.

Sanitized receipt: `staging/DETERMINISTIC_DELIVERY_QUEUE_VERIFICATION_20261025.json`.
Private evidence stays in
`/Users/noelsierra/Documents/Codex/2026-10-25/deterministic-delivery-queue/`.
Logs, database snapshots, synthetic credentials and native inputs are excluded
from Git. Only this task's isolated local stacks are stopped; volumes are retained.

The next existing PR14 step is **targeted staging reconciliation for migration
126**, preserving the exact 125-entry native history and protected checkpoint.
Permanent installation, app deployment, production changes and backlog replay are
not authorized by this verification record. Remaining record-return context and
mailbox/device/accessibility follow-ups stay in the existing roadmap.

References: PostgreSQL documents why LIMIT/OFFSET needs a unique order in
[LIMIT and OFFSET](https://www.postgresql.org/docs/current/queries-limit.html).
Supabase documents explicit privileged-function search paths and execution rights
in [Database functions](https://supabase.com/docs/guides/database/functions).
The current Supabase changelog was reviewed; no relevant API, privilege or schema
convention was changed for this candidate.
