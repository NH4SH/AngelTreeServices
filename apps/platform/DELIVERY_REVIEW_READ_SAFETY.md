# Delivery review read safety

Verified October 25, 2026. The migration-125 implementation and reconciliation are
pushed normally to `origin/main` through **`dacc741`**. This focused PR14
communications follow-through remains local on `codex/delivery-review-read-safety`.
No production query/change, deployment, key rotation or customer email occurred.

## Problem and resulting behavior

The actual local browser reproduced an invalid selected link (`id=not-a-delivery`)
opening **50 unrelated delivery cards and 70 recovery disclosures**. The old page
converted an invalid ID to SQL NULL, silently invoking the native global-list
behavior. A missing successful response also defaulted to an empty array. Metadata
was cast directly to action-bearing row types, and exhausted pages could claim
there were no deliveries while their native total remained positive.

The new caller-bound reader distinguishes **invalid link**, **missing selected
request**, **unavailable read** and **verified empty view**. Invalid IDs issue no
review RPC; a missing valid UUID remains missing. A selected read must return that
exact UUID and at most one row. Login return URLs retain the validated selection.
Selected views exclude unrelated office/legacy/source recovery sections; those
features remain available in the two existing global queues.

The reader explicitly decodes counts, complete page lengths, unique row IDs,
source IDs, dates, outcomes, repair states, attempt counts and booleans before
showing recovery controls. Missing or malformed main data is unavailable, never
an empty success. Optional office/legacy/provider-count failures are isolated;
pending customer-alert failures leave valid delivery controls visible. Source
alerts accept only the current canonical local record destinations, preventing
untrusted navigation. Extra payload/body/context fields and raw errors are discarded.

Page inputs are bounded integers. An exhausted page can recover once using its
native count, retaining its filter and one shared five-second abort budget. A
second moving/stale result remains unavailable rather than looping or inventing
empty state. Reads use the existing **stable GET RPCs**, with the nullable
unselected ID omitted so PostgreSQL uses its existing NULL default. There is no
service fallback, broad fetch/client filtering or mutation command in the reader.

The existing green/neutral interface, cards, native disclosures, valid action
permissions, confirmations, reasons, request IDs and server actions are retained.
Refresh and explicit invalid/missing-link recovery are added. Accepted requests
with pending delivery metadata no longer say Not sent; a prepared request with a
recorded earlier attempt no longer says it was never dispatched. The original
retry/copy/repair eligibility expressions and all authoritative native checks remain.

## Verification

- **3,165 regular CRM checks**, including **75 new focused cases**, and the
  separate **21 manual-reminder checks** passed. Final runs have zero failures,
  cancellations or skips. Focused tests cover scope/URL validation, metadata
  decoding, no false emptiness, shared abort/recovery limits, isolated errors,
  safe destinations, role gates, status wording and unchanged valid control props.
- **Nine actual local Auth/API scenarios / ten TAP results** passed, with **326
  read-only RPC GETs**. They page every matching delivery in both native queues
  and 1,101 pending source events beyond the first 1,000 inputs, verify exact
  selected IDs, zero invalid-link reads, missing records, recovery, response faults
  and all four staff/two administrator boundaries. Forged metadata, anonymous and
  disabled/separated/removed-role old sessions remain denied. Complete fingerprints
  preserve requests, source events, history, queues, finances, settings and audit.
- **34 native SQL assertions passed on each local and staging target**. All
  fixtures are synthetic and rolled back. Explicit source-event identity values
  avoid advancing a hosted sequence. The exact **125-entry ledger**, **5,116-object
  catalog**, **49 protected sets**, immutable document bindings, no-send Auth guard
  and OFF staging automation controls match before/after. There is **no migration**.
- **18 reader/fault cases** using actual local and staging native result envelopes
  passed. These validate native metadata decoding and reject malformed/incomplete
  variants. They complement actual local HTTP/Auth acceptance; they are not a claim
  of hosted staging Auth-session or browser acceptance.
- Fresh native schema and offline fingerprints, framework floor, route type
  generation, TypeScript and optimized build passed on Node **22.23.4**, Next
  **16.4.2**, React **19.2.9**. An initial build alongside the dev preview compiled
  but timed out in its internal TypeScript phase. A clean isolated build with the
  preview paused and a 4-GiB Node heap limit passed; no project build setting or
  dependency changed. No separate lint script is configured.
- Security advisors remain local **0** and staging's exact inherited **80**. No
  public/native function, RLS policy, permission, dispatch/repair transaction,
  payment/financial command, immutable term or production configuration changed.
- Actual local browser checks cover the invalid and missing links, one selected
  request, original review choices, keyboard Next to page 2, long references,
  1280/768/390 layouts, real read errors, an isolated pending-alert failure and a
  genuine empty native Needs review result. No horizontal overflow was observed.
  Temporary local execute denials and synthetic queue-state changes were restored
  exactly, including complete ACLs and every original row. Recovery forms were
  never submitted. The final restored browser again shows 50 cards, the source
  queue and no errors.
- The scoped mechanical detector ran once with **zero findings**. A bounded
  Impeccable hardening/polish pass retained the incumbent communications system;
  no new visual identity, global styles or shipping raster assets were introduced.

Provider calls and customer emails sent: **zero**. Hosted app/browser, real mailbox,
physical-device, spoken-screen-reader and production acceptance are not claimed.
The unrelated runtime-security worktree remains at
`06580f6c922fa6ab0ebaf229d27b1d30097f1b78`.

## Files, evidence and existing roadmap

Implementation: `src/lib/email/delivery-review-read.ts` and the existing
`admin/communications/delivery-review/page.tsx`. Tests:
`tests/delivery-review-read.test.mjs`, `delivery-review-read.integration.test.mjs`
and `supabase/verification/delivery_review_read_safety.sql`. The narrow surface
brief is `.impeccable/surfaces/delivery-review-read-safety.md` at the repository root.
Existing review controls/actions, recorded history, migration-125 record views,
provider integration and all prior features are preserved.

Sanitized receipt: `staging/DELIVERY_REVIEW_READ_VERIFICATION_20261025.json`.
Private evidence: `/Users/noelsierra/Documents/Codex/2026-10-25/delivery-review-read-safety/`.
Raw snapshots, native inputs, credentials, logs and browser captures remain outside
Git. Only the owned temporary preview/database are stopped; synthetic volumes,
other services, user tabs, worktrees and the home scanner are preserved.

Native global ordering still uses `created_at` without a UUID tie-breaker; a
multi-page session is not frozen across concurrent changes. The API completeness
case uses unique native timestamps and does not claim tie-safe global paging.
The existing 10,000-page bounds and 20-row office/legacy previews remain. The next
focused PR14 follow-through is deterministic native Delivery review paging. Safe
record-return context, policy/tax-preparer, mailbox/device/accessibility and the
separate managed-runtime follow-ups remain in the existing roadmap. Nothing here
authorizes deployment, production activation, backlog replay or an automatic resend.
