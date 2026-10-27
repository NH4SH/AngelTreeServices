# Change-order editor contact loading

Verified October 26, 2026. The preceding change-order list/creation batch is
pushed normally to main as `66dafd24e82a9a62a73b8b38e2e79150b126301c`, with
CI/Netlify skip markers. This follow-up is uncommitted on
`codex/change-order-editor-contacts`, based on that exact main commit.
Production, published staging and the scanner remain unchanged.

## Result

Opening an existing change order now hydrates only the unique saved Requested by
and Approval contact IDs: zero, one or two contacts. Previously the editor read
every active contact belonging to the linked organization, in 1,000-row batches,
and serialized the complete directory into the page.

The existing searchable lookup control supplies 20-row contact pages on demand.
Its existing endpoint derives the organization from the exact accessible parent
work order and uses the caller's current permissions and RLS on every request.
Saved contacts remain pinned while browsing other pages or searching. Searching,
failed requests, retry and late replies do not change the saved selection or
discard entered wording. No global contact fallback or privileged reader was added.

An inactive or otherwise unavailable saved contact ID stays in the document
header and in the visible control. It must be explicitly reviewed, replaced or
cleared before saving; it is never silently erased. A failed or unexpected entry
read exposes the existing reload state instead of a partial editor. Blank
organization selections remain optional, and blank individual-customer contact
controls remain disabled. A selected-only reader no longer incorrectly claims
that an organization has no active contacts merely because none are selected.

The fixed work order, original source quote/closeout, monetary fields, notes,
line IDs, costs permissions and existing green/neutral CRM interface are retained.
Save changes still uses the existing receipt transport; Save and close retains
the existing server action. Request identity, replay, revision conflicts,
approval/cancellation rules, transaction boundaries and audit history are unchanged.
No migration, grant, policy, dependency, secret or environment change is needed.

## Paired staging measurement

| Measure | Before | After |
| --- | ---: | ---: |
| Median editor HTML | 653,274 bytes | 48,023 bytes |
| Median enabled-editor entry | 1,429 ms | 683 ms |
| Successful measured navigations | 6 / 6 | 6 / 6 |

HTML fell about **93%**, and observed entry median fell about **52%**. Both
versions used the same synthetic owner, settled change order, two saved contacts
and 1,105-contact organization. Each version had an excluded warmup, followed by
six full browser navigations; authenticated HTML probes ran outside the timed
intervals. Timing covers navigation through an enabled editor after the load
event. These observations describe this protected staging run, not production,
cellular, physical-device or concurrent-load performance guarantees.

## Verification and preservation

- **3,251 regression checks** passed under Node 22.23.4. Explicit typecheck,
  local production build, protected staging build, offline schema and whitespace
  checks passed. The bounded Impeccable detector reported no findings.
- Native local and staging reader tests compare authoritative headers, lines,
  revisions and parent scope for zero, one, two, duplicate and inactive saved
  contact IDs. Unexpected, foreign, inactive or duplicate reply rows fail closed.
  Disabled old sessions, crew and anonymous readers cannot load the editor.
- The unchanged native transaction rejects inactive contacts without mutating
  the document. Local/staging transaction tests also passed committed-request
  replay, stale revisions, concurrent edits, approval races, approved-edit denial,
  late-line rollback and effective-access revocation. Parent scheduling fields
  remain unchanged.
- Actual local and protected staging browsers verify off-page saved selections,
  search/paging, Enter without accidental submission, failed-query retry, delayed
  replies, keyboard saving, record changes, blank/individual defaults and explicit
  inactive-contact recovery. Saves preserve parent/source IDs, contacts, amounts,
  status and line IDs, and produce exactly one additional edit audit event.
  Existing creation prefills remain compatible.
- Desktop 1,280 px and mobile 390 px screenshots were inspected in one batch.
  No horizontal overflow, uncaught browser error or unexpected external browser
  request occurred. The local application network-denial log remained empty.
- Staging remains at 129 migrations with unchanged public function/RLS hashes
  and automatic sending OFF. Original staging baseline rows are checked by exact
  ID after testing, including historical synthetic sets beyond 1,000 rows.
- Test users are disabled/banned and lose old-token access. Unused owned contacts
  are deactivated; reviewed synthetic documents, lines and audit history are
  retained. Earlier inactive-contact test records are retained when a fresh
  synthetic fixture is needed. No customer email is sent.
- Only the owned local application/database are stopped afterward, retaining
  volumes and unrelated development stacks. All 78 pending files in the original
  worktree and the separate runtime-security worktree are preserved. Tested
  runtime hashes match the protected staging export.

Evidence, metrics and screenshots are retained privately at
`/Users/noelsierra/Documents/Codex/2026-10-26/change-order-editor-contacts/`.
The new batch is not committed or pushed. Existing release, customer-experience,
policy and runtime-security work keep their separate review boundaries.
