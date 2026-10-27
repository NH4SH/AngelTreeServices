# Work-order materials and planning loading

Verified October 26, 2026. The preceding work-order detail batch is pushed normally
to main as `b115d55838faa3e622bc572fda143aa756367632`, with CI/Netlify skip markers.
This follow-up is uncommitted on `codex/work-order-material-planning`, based on
that exact main commit. Production, published staging and the scanner are unchanged.

## Result

The office work-order page now uses a dedicated material-plan reader instead of
the shared seven-read inventory bundle. A normal-sized catalog requires two
caller-RLS requests: the exact parent with its planned requirements, and active
material choices. Inventory locations, reservations, stock transactions and
disposal history are no longer fetched for an office panel that does not use them.

Material choices contain only ID, name and default unit. Active/unarchived filters,
labels, blank defaults, unit validation, notes, estimated flags and decimal
quantities are preserved. The catalog uses stable name/ID ordering and additional
1,000-row pages when necessary, rather than silently losing later choices to the
Data API cap. Plans retain chronological ordering, with ID resolving timestamp
ties. The existing per-related-collection API boundary for unusually large plans
is unchanged; full plan-history paging is outside this batch.

Failed, missing, foreign or malformed planning reads return no partial plan or
add form. The work-order page retains its notice/unavailable state and the other
work-order sections. Staff/assigned-crew read checks and database RLS remain in
place; caller-provided role values cannot bypass inaccessible parent rows.

The crew inventory reader, crew routes, stock/reservation/disposal workflows,
material actions, prices, costs and financial behavior are unchanged. Shared form
prop types now describe the three fields actually consumed. After type erasure,
the entire shared material-form JavaScript is identical to main. No migration,
policy, grant, package, secret, environment or production configuration change
is required.

## Paired staging measurement

| Measure | Before | After |
| --- | ---: | ---: |
| Office planning data | 596,687 bytes | 17,043 bytes |
| Median work-order HTML | 163,856 bytes | 153,956 bytes |
| Median page entry | 1,133 ms | 844 ms |
| Successful measured navigations | 6 / 6 | 6 / 6 |

The planning payload fell about **97%**, HTML about **6%**, and observed entry
median about **26%**. Both runs used the same synthetic owner and settled records:
150 catalog entries, two planned requirements, 150 stock movements and 150 disposal
records. One warmup was excluded before six full navigations per version; separate
HTML probes ran outside timing intervals. Entry ends after the load event and
rendered schedule/planning controls. These are protected staging observations,
not production, cellular, physical-device, interaction-latency or load-test
guarantees. Both runs include slower samples around 1.67 seconds.

## Verification and preservation

- **3,259 regression checks** passed under Node 22.23.4. The final targeted reader
  and page tests also passed, including the unavailable-planning case. Explicit
  typecheck, local production build, protected staging build, offline schema and
  whitespace checks passed. The bounded Impeccable detector reported no findings.
- Unit tests cover exact-parent scope, active narrow choices, catalog pagination
  beyond 1,000 rows, stable ordering, partial/duplicate/failed replies and existing
  staff/assigned-crew boundaries. A later catalog-page failure exposes no partial
  choice set.
- Native local/staging comparisons match every active material label/unit and
  planned quantity, note and estimate flag against authoritative caller reads.
  The unchanged legacy reader still supplies both complete 150-record histories.
  Disabled old tokens, anonymous callers and unassigned crew are denied; a real
  assigned-crew session retains access to its isolated synthetic work order.
- Actual local/staging browsers preserve blank defaults, existing plan labels,
  unit validation and keyboard submission. A mismatched unit causes no write.
  A valid submission adds one estimated `1.375 each` requirement to the exact
  work order, leaving original requirements, job data, stock movements,
  reservations and disposal records unchanged. Reloading shows the saved plan.
- The actual crew view retains estimated plan labels, inventory-location choices
  and its existing 12-row stock-movement preview. Desktop 1,280 px and mobile
  390 px screenshots were inspected in one batch. There is no horizontal
  overflow, uncaught browser error or unexpected external browser request. The
  local application network-denial log remains empty.
- Staging remains at 129 migrations with unchanged public function/RLS hashes
  and automated sending OFF. Pre-existing baseline rows are compared by exact
  ID after testing. No customer email or scanner request is sent.
- Test access is disabled/banned, the owned employee is deactivated, and unused
  owned material/location choices are deactivated. Synthetic plans, movements,
  disposal records and audit history remain. Interrupted unprivileged reader
  setup accounts are also retired without deleting history.
- Only the owned local app/database are stopped, retaining volumes and unrelated
  stacks. All 78 pending original-worktree files and the separate runtime-security
  worktree are preserved. Tested runtime hashes match the protected staging
  export, and both published deploy IDs remain unchanged.

Private evidence, metrics and screenshots are outside Git at
`/Users/noelsierra/Documents/Codex/2026-10-26/work-order-material-planning/`.
The new batch remains uncommitted and unpushed.

## Next focused priority

Measure the materials workspace itself, where inventory and planning are used
together. Separate its catalog, stock, purchasing and disposal views before
introducing paged selectors or histories. Preserve the existing inventory commands
and financial permissions. Existing release and runtime-security priorities keep
their separate review boundaries.
