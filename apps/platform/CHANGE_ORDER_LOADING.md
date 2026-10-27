# Change-order list and creation loading

Verified October 26, 2026. The invoice-loading batch is pushed normally to main
as `a5dd8343d9179bd309d2a37a2e4b43c6a1057d7b`, with CI/Netlify skip markers.
This change-order follow-up is uncommitted on `codex/change-order-loading`, based
on that exact main commit. Published staging, production and scanner are unchanged.

## Result

The Work additions directory now reads 25 narrow rows per page, ordered by
`created_at DESC, id`, instead of reading full documents and billing lines up to
the global API cap. Earlier records remain reachable through native page links.
Row labels, status, additional amount, billing state and detail links are preserved.

The four summary counts use caller-RLS head/count reads across all accessible
records. Previously they were derived from the first API page: the synthetic
before screenshot shows 999 needing review while more than 1,100 were accessible.
Counts now describe the full directory, independently of its current page. Failed
count reads display unavailable values rather than claiming zero.

Directory visits no longer load job/contact/approved-quote directories or creation
catalogues. Opening creation omits the directory/summary reads and brings the form
into view immediately. Only a selected work-order ID is hydrated on entry.
Work orders and organization contacts use searchable 20-row pages; contacts are
scoped by an exact active, accessible parent job. Missing/individual parents cannot
fall back to a global contact list. Approved-quote directories are not needed to
derive the selected job's source quote.

Selected job options carry only their consumed parent/source metadata, validated
against the exact selected ID. The shared lookup control's optional validation
and selection callbacks keep this metadata synchronized without another broad
lookup. Existing quote/invoice defaults are preserved. Job changes clear dependent
contacts without discarding the rest of the live form. Search, paging, malformed
responses and failed reads cannot silently replace the pinned selection. An
unavailable selected job blocks saving while allowing a replacement search.

Creation uses the existing green/neutral CRM design and native controls. Its old
viewport-wide panel caused desktop overflow beside the sidebar; a route-specific
margin rule now contains it within the CRM content width. Search result counts
remain visible alongside an unresolved-selection warning. No visual redesign or
global palette change was made.

## Measured result

| Surface | HTML before | HTML after | Entry median before | Entry median after |
| --- | ---: | ---: | ---: | ---: |
| Directory | 1,582,828 bytes | 71,350 bytes | 2,420 ms | 1,456.5 ms |
| Creation | No reliable paired run | 47,639 bytes | No reliable paired run | 730 ms |

Directory HTML fell about **95%**, with an observed **40%** entry-median reduction.
The initial old creation-page render was 3,062,930 bytes. Repeated old-creation
navigations did not complete consistently within 60 seconds, so no paired
creation latency percentage is claimed.

The directory comparison uses the same synthetic owner and settled staging
records, six full navigations per version after an excluded warmup, with separate
HTML probes outside each timed interval. The new creation result also uses six
samples after warmup. Repeated creation probes used a selected work order
available to the old reader. The fixtures include 1,105 additions with billing
lines, 1,105 work orders and 1,105 organization contacts. The old creation navigation interruption and 60-second timeout are retained in
the private diagnostics. These are staging/payload
observations, not production, cellular, physical-device or load-test guarantees.
Numbered pages and counts reflect live records, not a frozen directory snapshot.

## Preserved boundaries and verification

- The original create/edit transactions, request identity, replay/retry controls,
  revisions, review/approval/cancellation boundaries, pricing, costs permissions,
  source-closeout/source-quote fields, billing, RLS and grants are unchanged.
  Existing fixed-parent editing and its scoped contact reader are unchanged.
  No migration, dependency, secret or environment-variable change is required.
- **3,249 regression checks** passed under Node 22.23.4. Explicit typecheck, local
  production build, protected staging build, offline schema and whitespace checks
  passed. Page-gate tests prove browsing never invokes creation readers and
  creation never invokes directory/summary readers; incomplete catalogues expose
  no save form.
- Native local/staging tests compare page 45 and global summary counts against
  independently paginated caller-RLS headers. Job/contact page 56, exact parent
  hydration, individual/missing-parent denial and minimal payloads passed.
- Existing native local/staging financial tests passed committed-request replay,
  stale revisions, concurrent editors, approval races, approved-edit denial,
  late-line transactional rollback and access revoked after preflight. Parent
  work/scheduling fields remained unchanged.
- Actual local/staging browsers passed directory paging, pinned selections,
  malformed job metadata, explicit retry, contact selection beyond page one,
  job changes preserving wording, keyboard creation with unchanged totals and
  selected contacts, and recovery from an unavailable parent. Anonymous/crew and
  disabled old sessions were denied; live role grants were recognized.
- Independent read-only quote/invoice browser checks confirm their default
  controls and distinct job eligibility remain unchanged. Desktop 1,280 px and
  mobile 390 px screenshots were inspected locally and in staging. No horizontal
  overflow, uncaught browser error or unexpected external app request occurred.
  The bounded Impeccable check reported no findings.
- Staging remains at 129 migrations with unchanged public function/RLS hashes and
  automatic sending OFF. All pre-existing baseline rows are compared by exact ID
  after testing. Full snapshots paginate beyond 1,000 historical synthetic rows.
- Test accounts are disabled/banned and lose old-token access. Unused owned jobs,
  locations and contacts are archived/deactivated. The 1,105 disposable bulk
  addition fixtures are marked cancelled through the staging/local maintenance
  client, retaining their headers, lines and history; no production record or
  existing baseline addition is changed. Verified synthetic creation records and
  financial test history remain. No email/provider call was sent.
- Only the owned local app/database are stopped, with volumes and unrelated
  stacks retained. The 78 pending files in the separate Firewood worktree and the
  runtime-security worktree commit are preserved. Protected unpublished drafts
  have one server function, no schedules/provider credentials and no private
  values embedded in public, edge or function artifacts. Published releases are
  unchanged. New source remains uncommitted and unpushed.

Private evidence, measurements and screenshots are outside Git at
`/Users/noelsierra/Documents/Codex/2026-10-26/change-order-loading`.

## Next focused priority

Measure fixed-parent change-order editing for large organizations. That editor
still intentionally loads the selected organization's entire active contact set;
the bounded selector can be extended there if measurements justify it, preserving
saved contacts and all edit/retry boundaries. Other release, policy, device/mailbox
and runtime-security work retains its existing roadmap.
