# Materials vendor and contact lookup loading

Verified October 26, 2026. The preceding materials workspace batch is pushed
normally to main as `7220f3bfe4a5587c4efc3afa835271ae7972d65e`, with CI/Netlify skip
markers. This vendor/contact batch was subsequently pushed normally to main as
`36d90bb`, with CI/Netlify skip markers. Production, published staging, the scanner and
the home Mac are unchanged.

## Result

Materials forms no longer preload full vendor and customer collections. Preferred
vendor, purchase vendor and delivery contracting party now use the CRM's existing
search/browse pattern with native selects, 20-row pages, exact totals and stable
name/ID ordering. Searches match names literally and case-insensitively. Vendor
lookups offer organizations only; delivery lookups retain both organization and
active/unarchived individual-customer choices. Organization eligibility remains
unarchived organizations of any existing type, as before.

The selected catalog editor hydrates its exact saved vendor, independently of
browse page one. Purchase and delivery histories hydrate only the exact party IDs
needed by their existing visible windows; typed vendor names need no organization
read. Blank creation forms preload no vendor/customer choices. An unavailable
saved vendor keeps its value, offers retry or an explicit replacement/clear, and
blocks an accidental save. Archiving remains available. Browsing, pagination,
errors and retries never write to the record or silently clear its selection.

Vendor controls adapt the paged party value back to the original raw organization
UUID field. Delivery controls retain the existing `customer:UUID` / `organization:UUID`
values. Typed purchase vendors, unit/cost controls, stock rules, idempotency keys,
audit history, private attachments and every existing server action are retained.
No business transaction, financial calculation, RLS rule or schema was changed.

The shared lookup gains an optional organization-only mode; quote/invoice/change-
order defaults remain unchanged. Its search button becomes enabled after hydration,
avoiding an early click on streamed HTML before its handler is ready. The delivery
party lookup occupies a full-width row in the narrow sidebar, with material/work-
order inputs beneath it. Established CRM styling is reused without a redesign.

## Read and permission boundaries

`GET /api/admin/materials/lookups/vendor` and `/delivery` accept only allowlisted,
bounded party-search parameters. Each request validates the signed-in user and
live effective staff roles, then reads through the caller's Supabase client/RLS.
Responses contain value/label pairs and paging metadata, with private/no-store
headers and sanitized errors. There is no privileged fallback or shared cache.
Unsupported scopes, duplicate parameters, invalid identities, oversized queries
and unexpected lookup kinds are rejected. Names, tables and operators cannot be
supplied as arbitrary query syntax.

Financial visibility still uses the existing role group. Estimators can use the
same permitted party choices while private material costs and purchase forms stay
restricted. Crew, customer/property-manager role allowlists, disabled access and
anonymous callers cannot use the staff lookup API. The native role catalog contains
staff/crew roles only; customer/property-manager denial is tested at the unit HTTP
boundary rather than provisioning new roles for the test.

## Measurements

Paired unpublished protected Netlify drafts (main versus candidate), one staging
Supabase database, the same settled synthetic records after workflow tests, and
six completed full navigations per view after an excluded warmup. HTML probes run
outside timed intervals. This is a small synthetic observation, not an isolated
button-save benchmark, cellular comparison or production performance guarantee.

| View | Main entry median | Candidate entry median | Main HTML | Candidate HTML |
| --- | ---: | ---: | ---: | ---: |
| Catalog with one selected editor | 1,224 ms | 940 ms | 75,203 bytes | 62,467 bytes |
| Purchases | 1,172 ms | 886 ms | 200,615 bytes | 191,870 bytes |
| Deliveries | 669 ms | 707 ms | 220,801 bytes | 197,323 bytes |

HTML falls 17%, 4% and 11% respectively. Catalog/purchase entry medians improved
in this sample; delivery was slightly slower despite its smaller response. The
reliable change is bounded on-demand choices and exact saved/history hydration,
not a claim that every page is now faster. The remaining material/equipment/work-
order option payload still dominates some operational forms.

## Verification

- All 3,277 unit/PostgreSQL regression checks pass on Node 22.23.4, including strict
  lookup parsing, bounded projections/order/ranges, label hydration, literal
  wildcard punctuation, malformed/error reads, live-role HTTP gates and private
  headers. Typecheck, offline schema contract, local build and protected staging
  build pass. No dependency or migration changes were needed.
- Native local and staging tests traverse all 45 fixture vendors and 45 active
  customers, resolve saved last-page parties exactly, reject archived vendors and
  inactive/archived customers, and verify estimator/crew/disabled-old-token/
  anonymous behavior against actual RLS. The open editor and history labels use
  exact IDs rather than full directory reads.
- Actual local/staging browser workflows verify seeded selections, 20-row paging,
  keyboard controls, literal search, empty/error/retry states, preservation of
  selection and typed-vendor fallback. Existing actions save the raw vendor UUID,
  receive 1.375 units at $2/unit ($2.75) and a separate typed-vendor purchase, retain prior
  stock entries, and schedule both customer and organization deliveries without
  consuming stock. An archived saved vendor remains unchanged until explicit user
  action. The existing new-quote lookup still offers both party types; no quote
  is submitted.
- Local browser verification completed in two passes: the optional quote smoke
  check initially used an incorrect test URL after the inventory assertions had
  passed. The corrected check and retained-record postconditions were then
  verified without resetting or repeating the purchases/deliveries. The corrected
  complete workflow passed on staging. Final layout checks ran on both targets
  against the final runtime hashes, without additional writes.
- Desktop 1,280 px and mobile 390 px screenshots were reviewed together. The
  delivery field was expanded in the one final layout correction and confirmed.
  There is no page overflow, uncaught browser error or unexpected external browser
  request. The design detector reports no findings on changed UI targets; the
  local application network-denial log is empty.
- Staging remains at 129 migrations, with unchanged public function/RLS hashes and
  automated sending OFF. Pre-existing rows in the captured baseline tables are
  compared by exact ID after testing. No customer email or scanner request is sent.
- Synthetic users are disabled/banned, owned material/location choices are
  deactivated and owned vendor/customer choices are archived. Synthetic purchase,
  receiving, delivery and audit history remains. Only the owned local app/database
  are stopped, retaining their volumes and unrelated stacks. The 78 pending files
  in the original worktree, separate runtime-security worktree, inventory server
  actions, crew routes and other materials readers are preserved. Both published
  Netlify releases remain unchanged.

Runtime files: the materials page/forms and workspace reader, the existing shared
lookup field's small organization-only/hydration additions,
`src/lib/data/material-lookups.ts`, the scoped API route and the optional catalog
editor filter type. Regression/native/browser tests accompany them.

Private evidence and screenshots are outside Git at
`/Users/noelsierra/Documents/Codex/2026-10-26/materials-party-lookups/`.
The verified vendor/contact batch is now pushed as `36d90bb`. Its operational
lookup follow-up is documented in `MATERIALS_OPERATIONAL_LOOKUPS.md`.

## Next focused priority and limits

Measure and bound the material/equipment/work-order choices still embedded in
operational materials forms, then review paging for their history windows. Retain
all stock commands, financial rules and security boundaries. Catalog matching
still traverses the catalog on the server; existing overview aggregate semantics
and non-party API/history limits remain unchanged. Broader release and runtime-
security work keeps its established separate review boundary.

Implementation references: [Supabase range/order behavior](https://supabase.com/docs/reference/javascript/range)
and [case-insensitive pattern filtering](https://supabase.com/docs/reference/javascript/ilike).
