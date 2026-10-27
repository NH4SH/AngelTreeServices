# Searchable, paged quote lookups

Verified October 26, 2026. The preceding editor-loading batch is pushed normally
to `origin/main` as `30231a8d706cd336c3e8f5fb1d83baae8519a808`, with CI/Netlify
skip markers. This follow-up remains uncommitted on `codex/paged-quote-lookups`,
based on that exact main commit. No production deployment or change occurred.

## Result

Quote editing and the new-quote drawer no longer load entire customer,
organization, location, work-order, contact or estimate directories. They hydrate
only saved/prefilled selections by ID. Each field offers an expandable search
and a native dropdown with 20-row Previous/Next pages and an exact count.
Customers and organizations have separate search modes. The existing CRM colors,
form layout and native keyboard controls are preserved.

Locations and work orders stay bound to the selected contracting party; contacts
stay bound to its organization. Missing or inaccessible parents cannot produce
global results. Browsing, searching and paging do not change the saved selection,
dirty the quote or submit the form. A selected record stays pinned independently
of page one, including records beyond the former global row limit and estimates
older than the former 50-event window.

Search covers customer/organization names and contact details, location labels
and addresses, work descriptions, contact names/emails and estimate titles or
location labels. Search punctuation and LIKE wildcards remain literal inside
fixed, quoted PostgREST filters; request input cannot name a table, column or
operator. Each page has a deterministic ID tie-breaker. These are live numbered
pages, not a frozen snapshot of a changing directory.

## Safety and compatibility

The read-only endpoint uses cookie authentication, live effective-access/role
checks and the caller's existing RLS client on every request. Responses are
private/no-store. There is no service-role lookup fallback. Bad input, unavailable
backends and denied sessions fail visibly without exposing diagnostics.

The original field names, contracting-party confirmation, source-lead prefill,
financial calculations, atomic actions, request receipts, revision conflicts,
return context, saved wording and draft schema are unchanged. Explicit party
changes clear dependent fields. Restored drafts keep their raw selected IDs while
labels resolve, and an unresolved selected ID blocks saving instead of silently
becoming blank. Search input and directory labels are not added to local storage.
Async replies are bound to user/scope/request identity and the draft privacy
generation; late replies cannot replace a newer selection or search result.

No SQL, RLS, grants, migrations, credentials, production configuration, scanner
settings or email/payment behavior changed. No new environment variable is needed.

## Verification

- **3,232 regression/unit checks passed under Node 22.23.4**, alongside explicit
  typecheck, local production build, protected staging build, offline schema
  fingerprints and whitespace checks. The initial shell used Node 24.4.0 and hit
  an existing scanner-test directory-symlink cleanup error. That test and the full
  suite passed under the pinned Node 22 runtime; scanner code was not changed.
- Native caller-RLS tests passed against the owned local database and ATS CRM
  Staging. Each target used 1,105 synthetic customers, organizations, locations,
  work orders and organization contacts, plus 61 estimate events. Page 56,
  exact selected-ID reads, foreign-party denial, literal punctuation, all saved
  contact fields and older estimates were exercised.
- Actual local and protected-staging browsers passed search/paging, Enter without
  submission, delayed/out-of-order replies, simulated 503 and explicit retry,
  dependent-field clearing, recovery of off-page IDs, blocked save during label
  resolution, keyboard saving, unchanged totals/links/line IDs and all four
  organization contacts. New quotes were created atomically from synthetic
  website leads and customer-prefilled creation was checked. Each repeated test
  uses a fresh owned lead, preserving the earlier lead's archive/history.
- Anonymous and crew requests were denied. A live role grant was recognized,
  and disabling that same owner's profile denied its existing browser session.
  Synthetic test accounts were disabled and banned afterward.
- Desktop 1,280 px and mobile 390 px screenshots were inspected locally and in
  staging. No horizontal overflow, uncaught browser error or unexpected external
  application request occurred. The bounded Impeccable check found no issues.
- The synthetic quote editor's HTML was below 150 KB despite the larger
  directories. This is a payload/functional acceptance check, not a paired
  latency benchmark or a claim about production/cellular response times.
- Staging remains at 129 migrations with unchanged public function and RLS
  fingerprints. Baseline records are compared by ID after testing. Unused owned
  synthetic directories are archived/deactivated in 50-ID batches; history and
  selected verification documents remain. Test accounts lose old-token access.
  Only the task-owned local app/database are stopped, retaining their volumes.
- The protected unpublished draft has one server function, no schedules or
  payment/email-provider credentials, and no private values embedded in public,
  edge or function artifacts. Published staging and production releases remain
  unchanged, as do the separate pending Firewood and runtime-security worktrees.

Private evidence and screenshots are outside Git at
`/Users/noelsierra/Documents/Codex/2026-10-26/paged-quote-lookups`.
Staging now retains more than 1,000 historical synthetic rows in some tables;
future full-baseline snapshots must paginate rather than assume one API page is
complete. The new integration tests are opt-in and guard the exact disposable
local/staging targets and synthetic identities.

## Next focused priority

Measure invoice editor entry and its new-invoice drawer next, then apply the same
bounded lookup contract where broad customer/location/contact reads still occur.
Keep financial commands and existing payment locks unchanged. The broader
release, policy, mailbox/device/accessibility and runtime-security work remains
on its existing roadmap; it is not superseded by this performance batch.
