# PR11: field job pages and private photo reads

This contract describes local code. It does not authorize deployment, production
migrations or changes to Storage policies/credentials.

## Field landing and directory

`read_crew_job_page` is a stable **security-invoker**, read-only function. It uses
the current JWT, the existing caller-only effective-access check and all existing
table RLS. There is no target-user parameter, service client, shared result cache,
new write permission or security-definer shortcut. Only authenticated callers have
execution permission; existing private authorization helpers remain private.

The database filters and counts before returning a page. The default page is 25
jobs, maximum 100; list payloads omit notes, assignment history, equipment/material
relationships, gate codes and detail-only contact fields. Photo counts retain all
six categories without transferring one row per image. Full detail reads and all
existing job, closeout, time-clock and photo-upload commands remain available.

- Today uses live job visits overlapping an Eastern business day, including
  overnight visits. The bounds are local midnight to the next local midnight,
  exclusive at the end, so daylight-saving days can be 23 or 25 hours.
- Upcoming selects a future live visit, even when the parent's first workday has
  passed. A job can belong to Today and Upcoming if it has visits on both days.
- Completed/cancelled/no-show visits do not schedule active field work. A legacy
  header time is used only when the caller can see no job visits. Thus hidden
  visit rows are not exposed as a workaround for assignment permissions.
- All active includes overdue and unscheduled accessible work. Unscheduled keeps
  accepted work and jobs with no remaining visible live visit findable.
- History includes explicit completion timestamps and legacy completed/invoiced/
  paid states. Billing-state names cannot put explicitly completed work back into
  Today's list. It never updates or backfills completion dates.
- Needs photos and Ready to complete remain accessible from the home summaries.
  A summary count failure is displayed as unavailable, rather than a successful
  empty workday. Detail links retain all existing actions.

Cursors bind the view and date and carry the exact database timestamp plus job ID.
History sorts descending by completion timestamp (legacy fallback updated/created
at); other views sort by their selected work time and ID. Equal timestamps retain
UUID tie-breaking, including sub-millisecond precision. Newer inserts do not shift
an already-read page. This is keyset pagination, not a frozen snapshot: a job whose
status/date actually changes may move between views. First page is the explicit
recovery action for a changed/invalid cursor.

The dashboard makes one compact RPC. Bounded lateral probes keep visit/photo RLS
checks on indexed rows for each visible job. Profiling rejected an initial plan
that built repeated global RLS-filtered hashes. Existing job, visit and photo
indexes were sufficient; no index, policy or global optimizer setting was changed.
See the verification report for measured payload and timing samples.

## Existing mobile and time-clock callers

`GET /api/crew/jobs` keeps its existing envelope/list fields and today/upcoming/
active scopes; it now supports `limit` and `cursor` and adds `nextCursor` and
`total`. Consumers must follow `nextCursor` to retrieve more than the first page.
The current iOS job directory already uses the paged `/api/mobile/jobs` endpoint,
so no Swift DTO/view change is required. Its completed-history cursor now uses
updated timestamp plus ID; old offset cursors are accepted and upgrade on the next
page. Existing non-history scopes/search behavior remain unchanged.

`GET /api/crew/jobs/[id]/photos` checks the same caller-visible, nonarchived job
with an ID-only read rather than expanding the entire work order. API photos,
nullable URLs and warnings retain their existing shapes. Responses remain
`Cache-Control: no-store`.

The clock selector retains its previous accessible job/status options, including
historical options, using minimal name/ID projections and deterministic batches.
Its permissions, timers and submission behavior are unchanged. It does not reuse
the full field-detail query.

## Private gallery signing

`getJobPhotos` reads metadata using the request's client, in batches of 500 with
stable timestamp/ID ordering. It deduplicates Storage paths and signs up to 100
paths per call, sequentially. A normal gallery needs one signing request instead
of N. Larger galleries do not create an unbounded pool of signing requests.

Storage results are mapped by **path**, not array position. Missing, refused or
thrown batch results leave the corresponding URL null, retain every metadata row
and produce a short refresh warning. Successful batches remain usable. Empty or
inaccessible metadata produces no signing request. No signed URL, raw Storage
diagnostic or credential is logged or shared through a cross-user cache.

The bucket stays private; existing object SELECT policies and the **900-second**
expiry are unchanged. As before, an already-issued signed URL is a bearer link
until it expires; disabling an account blocks new metadata/signing requests but
cannot retroactively revoke an existing signed link. Gallery metadata is a live
paged read, not a transactionally frozen image collection. Refresh after uploads
or concurrent edits to obtain the current gallery.

The PR10 mandatory upload/audit trigger and helper remain unchanged. The only
additive migration in PR11 installs the read function. Apply it before the new
application code in a separately approved rollout; no production migration was
run here. Native HTTP contracts were tested locally; a full Xcode simulator build
was not part of this web/read-only change.

Official batch-signing reference:
[Supabase createSignedUrls](https://supabase.com/docs/reference/javascript/storage-from-createsignedurls).
