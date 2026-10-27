# Materials workspace loading

Verified October 26, 2026. The preceding materials/planning work is pushed normally
to main as `00cbd0d73db5aa44c796c696a9960126af464d0c`, with CI/Netlify skip markers.
This workspace batch was subsequently pushed normally to main as
`7220f3bfe4a5587c4efc3afa835271ae7972d65e`, with CI/Netlify skip markers. Production, published staging, the home Mac and scanner are unchanged.

## Result

Each materials tab now reads its own required datasets. For an owner and a catalog
under 1,000 entries, overview uses nine Data API reads and catalog uses five,
including current-page private costs, instead of seventeen on every tab. Other
tabs use four to seven reads. Unused material-load history is no longer fetched.
Recent overview movements request eight rows, matching its existing rendered
preview; the full movements view retains its existing 150-row window. Operational
history windows and all business commands remain unchanged.

Catalog results show 25 records per page. Search remains literal, case-insensitive
matching over name, SKU and description, including punctuation. Category options
come from the complete unarchived catalog. Server-side catalog traversal uses
stable name/ID ordering and additional 1,000-row requests to avoid losing later
materials at the Data API cap. Filtering and result paging happen on the server.
This is not database-side search or a global aggregate rewrite.

Only the selected material mounts an edit form. Previously every collapsed row
included a full edit form and its vendor options in the response. Add material and
add location remain available; the selected editor preserves existing fields,
vendor, private cost and archive controls. Edit/close links preserve search,
category and page; paging closes the editor. No new update endpoint was added.

Required read errors now show a recovery notice and retain tab navigation without
rendering partial forms or false zero totals. Errors are sanitized. All reads use
the signed-in Supabase client and existing RLS. Financial datasets remain restricted
to the existing financial roles; non-financial purchase lists omit cost values.
Delivery choices no longer include unused customer-location fields. There is no
service-role read fallback or shared data cache.

Browser checks caught existing narrow-column overflow in correction controls and
production date fields. Small CSS changes keep correction controls inside their
column and give date/time controls a full row within the materials workspace.
The established CRM appearance and all form actions are retained.

## Protected staging comparison

Same development Mac, synthetic owner, Supabase staging database and separate
unpublished Netlify drafts, before any browser mutations. Each figure is the
median of six completed full page entries, after one excluded warmup. HTML probes
run separately from the timed entries. This measures navigation through the
rendered view, not isolated server execution, button-save time or a production SLA.

| View | Before entry median | After entry median | Before HTML | After HTML |
| --- | ---: | ---: | ---: | ---: |
| Overview | 1,367 ms | 881 ms | 71,692 bytes | 71,691 bytes |
| Catalog, 35 matching synthetic materials | 1,597.5 ms | 686.5 ms | 292,769 bytes | 114,708 bytes |

Observed entry median improved 36% for overview and 57% for catalog. Catalog HTML
fell 61%. Query counts, bounded results and removal of hidden forms explain the
structural reduction; the small timing sample remains subject to network and
server variation. An interrupted run was discarded and repeated. No cellular or
production performance claim is made.

## Verification and preservation

- All 3,271 existing/new unit and PostgreSQL regression checks pass on Node
  22.23.4. Typecheck, offline schema fingerprints, local production build and the
  protected staging build pass. No dependencies or migrations were changed.
- Native local and staging tests compare all eight views with the previous caller-
  RLS reader. Stock, labels, estimates and existing history windows match. All 35
  fixture materials remain reachable, punctuation stays literal, and estimator
  views omit private cost datasets. Disabled old tokens and anonymous clients
  cannot retrieve materials. Unused/error/malformed-read and >1,000-choice cases
  are covered by unit tests.
- Actual local and staging browser tests exercise every tab at 1,280 and 390 px,
  catalog filters/paging and keyboard navigation, the single selected editor,
  unchanged unit-change protection, a description save, one decimal stock receipt,
  and reservation release with its required reason. The original 20 immutable
  movements remain unchanged; the synthetic receipt and release history remain.
  There are no uncaught browser errors or unexpected external browser requests.
- Before/after catalog and overview screenshots and editor screenshots were
  inspected. The design detector reports only pre-existing global CRM accent and
  animation patterns; no finding overlaps the changed UI lines. Those established
  styles were preserved rather than expanding this loading change into a redesign.
- Staging remains at 129 migrations, with unchanged public function/RLS hashes and
  automated sending OFF. Original staging rows are compared by exact ID against
  the pre-fixture snapshot. No customer email or scanner request is sent.
- Synthetic users are disabled/banned, test employees and owned material/location/
  equipment choices are deactivated, and original/synthetic histories are retained.
  Only the owned local application/database are stopped, with volumes and unrelated
  stacks retained. All 78 pending original-worktree files and the separate runtime-
  security worktree are preserved. Tested source hashes match the staging export;
  both published Netlify release IDs remain unchanged.

Runtime files: `src/lib/data/materials.ts`,
`src/lib/materials/workspace-view.ts`, `src/app/admin/materials/page.tsx` and the
small materials CSS additions in `src/styles/globals.css`. New reader/render/native/
browser tests accompany them; the previous planning integration test receives the
new reader's import dependency. Material actions, shared forms, crew routes and
other materials readers are unchanged.

Private evidence and screenshots are outside Git at
`/Users/noelsierra/Documents/Codex/2026-10-26/materials-workspace-loading/`.
This verified workspace batch is now pushed as `7220f3b`. The subsequent vendor/
contact lookup work is documented in `MATERIALS_VENDOR_CONTACT_LOOKUPS.md`.

## Next focused priority and limits

Measure and bound the remaining material-workspace contact/vendor choices and
operational histories without changing stock transactions or financial access.
Catalog matching still traverses the whole catalog server-side; other existing
choice/API limits and overview aggregate semantics are retained. In particular,
the existing “Active materials” label counts unarchived catalog entries and the
operational overview uses bounded histories. Those semantics deserve their own
explicit review before introducing database aggregates or new paging contracts.
Existing release/runtime-security priorities keep their separate boundaries.
