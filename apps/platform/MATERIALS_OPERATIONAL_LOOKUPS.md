# Materials operational lookup loading

Verified October 27, 2026. The vendor/contact batch is pushed normally to main as
`36d90bbeb003643cd24acf4318aa73d676568dbe`, with CI/Netlify skip markers. This new
batch is uncommitted on `codex/materials-operational-lookups`, based on that main
commit. Production, published staging and the scanner are unchanged.

## Result

Office inventory-location, movement, reservation, purchase, disposal, production,
delivery and stockpile forms now browse materials, equipment and work orders in
20-row pages. They reuse the existing search/retry/native-select pattern. Initial
forms contain blank choices rather than full directory arrays; displayed history
hydrates only the material/job labels it needs. Catalog/overview catalog reads and
their existing aggregate semantics remain separate and unchanged.

Material choices retain all unarchived workspace items, including inactive items
that were previously selectable. Equipment retains the existing active-only rule.
Work orders retain unarchived records except paid/lost/cancelled states; paging
replaces the old 200-choice ceiling. Stable ordering adds ID tie resolution.
Material labels include the existing unit; equipment includes its asset number;
work orders add a short existing scope excerpt to distinguish otherwise identical
service/status choices. Search uses fixed fields and literal escaped punctuation.

All original form field names, raw UUIDs, optional choices, manual unit selection,
estimated/decimal quantities, idempotency keys, private-file controls and server
actions are retained. Required fields still use native validation. Lookup errors
preserve selections and offer retry. Pending selection verification prevents an
accidental save. Search controls use full-width rows within the existing sidebar
and responsive CRM styles.

The original crew disposal/material forms and work-order planning form are retained
byte-for-byte, with their existing server-loaded choices and permission boundaries.
A separate office disposal form consumes staff lookups. No crew screen calls the
new staff endpoint. No inventory transaction, price/cost calculation, financial
rule, audit contract, RLS policy, schema or dependency was changed.

`GET /api/admin/materials/operational-lookups` accepts only bounded, allowlisted
material/equipment/job requests, checks the signed-in user and live effective staff
roles, and reads through caller RLS. It returns value/label paging data with private/
no-store headers and sanitized errors. It exposes no material notes, internal costs,
maintenance details or arbitrary table/operator selection. There is no privileged
fallback or shared data cache.

## Measurements

Same synthetic fixture state on unpublished protected Netlify drafts (main and
candidate), the same staging database, six full navigations per view after an
excluded warmup. HTML probes are separate from timed entries; no provider call,
customer email or scanner request is involved.

| View | Main entry median | Candidate median | Main HTML | Candidate HTML |
| --- | ---: | ---: | ---: | ---: |
| Movements | 808.5 ms | 903 ms | 532,015 bytes | 334,538 bytes |
| Purchases | 1,108.5 ms | 1,166 ms | 225,301 bytes | 55,814 bytes |
| Production | 675 ms | 636 ms | 300,149 bytes | 61,345 bytes |
| Deliveries | 697 ms | 606.5 ms | 261,835 bytes | 58,673 bytes |

Initial HTML falls 37%, 75%, 80% and 78% respectively. This establishes a substantial
payload/choice reduction, not a universal latency gain: movement and purchase entry
medians were slightly slower in this small sample. The movements view still renders
its existing 150-row correction/history window and is the remaining large payload.
No button-save, cellular or production performance claim is made.

## Verification

- All 3,283 unit/PostgreSQL regression checks pass on Node 22.23.4. Typecheck,
  offline schema fingerprints, local production build and protected staging build
  pass. Tests cover strict parsing, exact-selected hydration, stable 20-row ranges,
  literal wildcard punctuation, malformed/error reads and live staff HTTP gates.
- Native local/staging tests traverse all 45 materials, 45 equipment assets and 45
  work orders across three pages; exact selected IDs work independently of page
  one. Archived materials, inactive equipment and paid/lost/cancelled/archived jobs
  are excluded. Inactive unarchived materials retain workspace eligibility.
  All eight history projections, stock balances and costs match the old reader.
  Estimator access remains; crew, disabled old tokens and anonymous API calls fail.
- Actual local/staging browser tests verify third-page choices for all three kinds,
  keyboard navigation, optional choices, independent production input/output
  materials, empty/error/retry preservation and responsive controls. Existing
  actions reject an incorrect unit without a write, receive 1.375 estimated units
  with the exact equipment/work-order UUIDs, reserve 1.25 units, receive a 0.625-unit
  purchase at $2/unit ($1.25), and plan a 2.25-unit delivery without consuming stock.
  Original stock and reservation records remain intact during the workflow.
- The actual crew page retains its original selectors and calls no staff lookup
  API. Byte comparisons preserve crew/planning forms, their legacy helpers, crew
  routes, other material readers and all material server actions.
- Desktop 1,280 px and mobile 390 px screenshots were inspected together; controls
  are readable without horizontal page overflow. The detector reports no findings
  on changed UI targets. No uncaught browser error, unexpected external browser
  request or local application network-denial attempt occurred.
- Staging remains at 129 migrations, unchanged public function/RLS hashes and
  automated sending OFF. Captured pre-existing staging baseline rows are compared
  by exact ID after testing. No real email or scanner call is made.
- Synthetic users are disabled/banned, owned choices/jobs are retired and owned
  reservations released with a retirement reason. Stock/purchase/delivery/audit
  history is retained. Only the owned local application/database are stopped,
  retaining volumes and unrelated stacks. All 78 pending original-worktree files
  and the separate runtime-security worktree are preserved. Tested runtime hashes
  match the staging export; both published Netlify release IDs are unchanged.

Private evidence and screenshots are outside Git at
`/Users/noelsierra/Documents/Codex/2026-10-27/materials-operational-lookups/`.
The new operational lookup batch remains uncommitted and unpushed.

## What is live, and what remains

Read-only checks on October 27 confirm that the live CRM application is hosted by
Netlify at `https://admin.angeltreeservices.org`, published deploy
`6adab6d33b9c3096a37ad0a1`. Its production database is Supabase project
`ddvlnixdugcbnrewktes` (ACTIVE_HEALTHY). The home Mac supplies private file scanning;
it does not host the production CRM application or database. If that Mac is
unavailable, scanning-dependent uploads can be unavailable while the cloud CRM
and database remain online. The isolated MacBook application/database benchmark
was not a production hosting migration.

The next milestone should be a controlled release of the accumulated work:

1. Recheck the existing managed-runtime security release gate and preserve its
   separate review boundary. Local pinned Node/build success does not certify the
   hosted runtime's actual patch level; production runtime activation stays a
   separate approved action.
2. Reconcile/rehearse the pending database release with backup/rollback planning.
   Production records 102 migrations; staging records 129. The production version
   fingerprint matches staging's first 102 versions, leaving 27 staged versions
   to review. Counts/version parity are not permission to apply them blindly.
3. Run combined staging business journeys/role checks for the exact release, plus
   remaining real-device, accessibility and mailbox acceptance from the existing
   customer-experience review. Then seek explicit production release approval and
   perform live smoke/monitoring checks after deployment.

After that, measure remaining large history views (especially movements) before
adding further performance work. Inventory-location choices and existing history/
overview semantics still have their prior limits. Retention/recurring automation
and broader policy decisions retain their existing activation boundaries. Turning
this into a commercial multi-company product is a separate phase covering tenant
isolation, company onboarding, ownership and billing; it does not require moving
the production database onto the scanner laptop.
