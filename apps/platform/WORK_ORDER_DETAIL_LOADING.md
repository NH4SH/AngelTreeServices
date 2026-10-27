# Work-order detail loading

Verified October 26, 2026. Change-order contact loading is pushed normally to main
as `c5bb0f4ca72ebaf0751e64819d5c0297c0d3a787`, with CI/Netlify skip markers.
This follow-up is uncommitted on `codex/work-order-detail-loading`, based on that
exact main commit. Published staging, production and the scanner are unchanged.

## What changed

The office work-order page uses a dedicated, typed projection. One exact-parent
caller-RLS request replaces the previous header plus eight related reads. It
retains the displayed quote/addition scope, invoice summaries, crew print notes,
appointments, schedule revisions/assignments and equipment labels. The old full
reader remains unchanged for closeout and other callers.

Invoice lines, payment ledgers, unused related headers and duplicate raw photo
metadata are omitted from this projection. The existing paginated private-photo
reader and signing checks remain the sole gallery path. Quote/addition lines that
actually appear in the work list and printed document remain complete.

The completed-work marketing panel receives only its draft inputs: record ID,
service, scope, customer/organization name and city. It no longer serializes the
entire work order, invoice ledger, crew notes and access address into client props.
Generated review, completion and social wording is unchanged.

After the core record is confirmed, independent supporting reads—including
recipients, reminder summary and lifecycle preview—run concurrently. Hidden cost
panels no longer issue a cost read for roles outside financial reporting. A failed
or incomplete core read shows explicit reload recovery before supporting readers
or financial/scheduling controls mount. A genuinely missing record retains the
existing unavailable-record state.

No section or capability was removed. Scheduling, crew assignment, completion,
invoice generation, additions, print preview, marketing drafts, private photos,
communications, materials, costs, duplication and lifecycle actions keep their
existing commands and authorization. Their transaction, conflict, retry and audit
behavior is unchanged. No cache, migration, grant, policy, secret, package or
production configuration change is required.

## Measured result

| Measure | Before | After |
| --- | ---: | ---: |
| Completed-work core JSON | 136,775 bytes | 3,848 bytes |
| Median detail-page HTML | 268,746 bytes | 125,948 bytes |
| Median page entry | 1,029.5 ms | 980 ms |
| Successful measured navigations | 6 / 6 | 6 / 6 |

Core JSON fell about **97%** and HTML about **53%**. The approximately 5% observed
entry-median difference is small relative to the sample variation; this run does
**not** establish a substantial latency improvement. The demonstrated benefit is
less data transfer, fewer core requests and less unnecessary client serialization.

Both versions used the same synthetic owner and settled staging records, including
an original quote, approved/draft additions, crew/internal notes and an invoice
with 150 billing lines. Each run excluded one warmup and then measured six full
navigations through the load event and rendered schedule control. Separate HTML
probes ran outside the timing intervals. These are staging observations, not
production, cellular, physical-device, interaction-latency or concurrent-load
guarantees. Related collections retain the existing Data API row boundary; this
batch does not introduce full-history pagination for unusually large work orders.

## Verification and preservation

- **3,255 regression checks** passed under Node 22.23.4, plus explicit typecheck,
  local production build, protected staging build, offline schema and whitespace
  checks. The bounded Impeccable detector reported no findings.
- Native local/staging tests compare every returned header and consumed related
  field against the original caller-RLS reader, including array ordering, monetary
  summaries, line IDs, revision/crew data, current appointments/sessions and
  operational-state decisions. Missing records, disabled old sessions, unassigned
  crew and anonymous callers gain no detail access. No privileged fallback exists.
- Page tests verify that missing/failed records perform no supporting reads and
  mount no partial action controls. Independent recipient/reminder/lifecycle reads
  start together, and financial costs remain restricted to reporting roles.
- Browser tests pass locally and in protected staging. They exercise scope and
  billing links, keyboard disclosures, print preview availability, generated
  marketing drafts and local-only permission controls. The schedule receives its
  original revision and employee IDs; an intentional estimate overlap blocks
  without changes, then a documented synthetic owner override saves the note while
  preserving times, crew and the separate estimate. Inline keyboard entry creates
  one $25 draft addition on the same work order without approval or invoicing.
  Original completed-work, quote and invoice records remain unchanged.
- Desktop 1,280 px and mobile 390 px screenshots were inspected in one batch.
  The incumbent CRM design is retained, without horizontal overflow, uncaught
  browser errors or unexpected external browser requests. The local application
  network-denial log is empty. No upload/scanner activation was needed.
- Staging remains at 129 migrations with unchanged public function/RLS hashes and
  automated sending OFF. Pre-existing baseline rows are compared by exact ID,
  including histories larger than 1,000 rows. Synthetic documents and audit
  history are retained; test accounts are disabled/banned and lose old-token
  access. The owned test employee is deactivated. No customer email is sent.
- Only the owned local application/database are stopped, with volumes and
  unrelated stacks retained. All 78 pending original-worktree files and the
  separate runtime-security worktree are preserved. Tested runtime hashes match
  the protected staging export. Both published deploy IDs remain unchanged.

Private evidence, metrics and screenshots are retained outside Git at
`/Users/noelsierra/Documents/Codex/2026-10-26/work-order-detail-loading/`.
The new batch remains uncommitted and unpushed.

## Next focused priority

Measure the supporting materials/planning reads on this page. Its existing shared
material reader also retrieves inventory/disposal history that this office view
does not consume. Narrow that path separately while preserving crew inventory
workflows. Existing release, customer-experience and runtime-security priorities
retain their separate review boundaries.
