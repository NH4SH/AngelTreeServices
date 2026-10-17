# Migration reconciliation — October 17, 2026

## Engineering decision

**All 27 repository versions after the recorded 65 are legitimately pending.
None qualifies for a history-only repair.** Every missing version has concrete
schema/permission effects that are absent or different on the hosted database.
Do not run migration repair, mark any of these versions applied, replay an old
baseline migration, or run a hosted db push from this report.

The verified scanner hosting/recovery package `449f73e` is pushed to main and
`codex/pr18-scanner-hosting`, deployment skipped. This follow-through is local
on `codex/pr18-migration-staging`. It continues the existing PR18/F17 release
sequence and preserves every previous migration and implementation.

## Actual comparison

Read-only target: Supabase CRM `ddvlnixdugcbnrewktes`, PostgreSQL 17.6. Its 65
recorded versions exactly match the repository's first 65 version/name pairs.
There are no unknown hosted versions. The release contains 92 migration files.
The current published Netlify CRM remains deployment `6ad23c757dfc53f702ae00b9`,
application commit `49a0b82`; pushing main did not deploy the newer stack.

`supabase/verification/release_catalog.sql` inspects application relations,
column types/defaults/column grants, validated constraints, indexes, routine
arguments/defaults/body fingerprints/owners/security/search_path/grants, views,
policies, ordinary triggers, enum values, bucket settings, schema/default grants
and the known automatic-RLS event trigger. No business records, credentials,
migration statement text or general function bodies are exported. Only the
previously documented administrative helper definition was fetched for a local
schema-only simulation; it contains no business data. Sensitive definitions are
compared by fingerprints, not printed.

The hosted catalog contains **3,628 objects**. A repeatable 65-file baseline has
3,619: 3,518 match exactly, none is missing on hosted, 101 differ and nine are
additional. Compared with the 4,723-object release, 1,104 are absent, 154 differ
and 3,465 match; nine hosted extras remain. These are object-level facts, not a
claim that each table is an independent feature or that a count proves intent.
Per-migration footprints come from snapshots after each of versions 65–92;
later replacements are evaluated against the final release as well.

The final read-only catalog seal matched the collected fingerprints:
`b592a167e6415797d3bcaf75e011177d`. Hosted history remained at 65.
MD5 is a comparison aid, not an authenticity signature; all 92 migration files
also have SHA-256 in `supabase/reconciliation/release-2026-10-17.json`.

## Recorded baseline differences — preserve and review

| Difference | Finding and decision |
| --- | --- |
| Extra `profiles.crew_view_reset_requested_at` | Nullable timestamptz, no default or column grant. Not referenced in current tracked web/native source. Preserve it; do not delete it or silently add a feature. Decide whether to capture it in a separate additive migration after checking older clients/operational intent. It was retained in the local upgrade simulation. |
| `app_private.rls_auto_enable()` / `ensure_rls` | Already documented in SECURITY_HARDENING.md and conditionally handled by the July hardening migration. Private SECURITY DEFINER, fixed pg_catalog search_path, no API-role execution; active event trigger. Preserve it and its dependency. It is not proof of a missing application migration. |
| `set_updated_at()` | Only raw-body whitespace differs. Normalized body, arguments, return type, owner, search_path, volatility and execution grants match. No function rewrite is warranted. |
| Public-schema ACL | Hosted explicitly grants USAGE to anon/postgres in addition to inherited PUBLIC USAGE. Owner remains pg_database_owner. This is redundant schema usage, not permission to CREATE tables. Leave it unchanged. |
| 99 relation ACLs | Shapes, owners and RLS match the baseline. Hosted grants extra MAINTAIN to anon on 77 and authenticated on 96 tables; service_role additionally has MAINTAIN/REFERENCES/TRIGGER/TRUNCATE on 93 tables. No SELECT/INSERT/UPDATE/DELETE differences were found against the baseline. Keep these differences explicit; do not disguise them as equivalence or opportunistically normalize production. |
| Six public default-ACL records | Hosted postgres and supabase_admin defaults retain broad non-DML grants; supabase_admin defaults also auto-grant DML/function execution. Fresh repository replay does not recreate these provider-era defaults. New migrations must therefore be checked on both a fresh restrictive baseline and a hosted-like baseline. |

The extra privileges are real least-privilege drift. RLS does not govern
TRUNCATE, and MAINTAIN is not a row-read privilege. This does **not** establish
that unauthenticated REST callers can execute arbitrary maintenance SQL. The
practical risk is a broader SQL capability boundary and unsafe grants inherited
by future objects. Review a separate additive cleanup that revokes non-DML
maintenance/DDL-style privileges from API roles/defaults while preserving all
required DML, RLS, service commands and owner administration. Test it against
actual defaults and all workflows before approval. No cleanup migration or
production grant/default was changed in this package.

## Pending versions

Every row below is **pending**, with no automatic repair permission. Absent and
different counts refer to touched objects in their **final** release form; they
can overlap between migrations that intentionally replace the same routine.

| Version / change | Final touched objects absent | Different | Decision |
| --- | ---: | ---: | --- |
| `20261015040735` — job photo category parity | 0 | 1 | Pending; no repair |
| `20261015042649` — reliable employee offboarding | 112 | 22 | Pending; no repair |
| `20261015050427` — guard service recommendation assignment | 0 | 1 | Pending; no repair |
| `20261016002812` — guarded invoice void | 27 | 1 | Pending; no repair |
| `20261016010829` — invoice financial write boundary | 7 | 1 | Pending; no repair |
| `20261016012251` — enforce invoice financial write boundary | 2 | 5 | Pending; no repair |
| `20261016020444` — recoverable stripe webhook receipts | 52 | 1 | Pending; no repair |
| `20261016032012` — ordered payment reconciliation | 53 | 4 | Pending; no repair |
| `20261016040341` — atomic invoice generation | 15 | 1 | Pending; no repair |
| `20261016060143` — atomic quote editing | 11 | 0 | Pending; no repair |
| `20261016060503` — enforce quote edit boundary | 2 | 13 | Pending; no repair |
| `20261016064442` — atomic quote approval | 8 | 0 | Pending; no repair |
| `20261016080420` — atomic scheduling | 18 | 4 | Pending; no repair |
| `20261016130010` — explicit job completion | 23 | 4 | Pending; no repair |
| `20261016134622` — checked photo upload and communication outcomes | 2 | 1 | Pending; no repair |
| `20261016144647` — crew field job pages | 1 | 0 | Pending; no repair |
| `20261016162316` — transactional website lead intake | 12 | 0 | Pending; no repair |
| `20261016165057` — durable outbound delivery | 124 | 0 | Pending; no repair |
| `20261016182241` — owned scheduling handoffs | 55 | 0 | Pending; no repair |
| `20261016192144` — supervised operations | 27 | 2 | Pending; no repair |
| `20261016200200` — trustworthy report reads | 391 | 0 | Pending; no repair |
| `20261016210536` — reversible website sender blocks | 48 | 0 | Pending; no repair |
| `20261016223056` — measured organization location lookup | 1 | 0 | Pending; no repair |
| `20261016224352` — private document scan gate | 40 | 0 | Pending; no repair |
| `20261016225410` — measured document quote lookup | 1 | 0 | Pending; no repair |
| `20261016231215` — remaining attachment scan boundary | 74 | 0 | Pending; no repair |
| `20261017000918` — private upload transport | 7 | 0 | Pending; no repair |

## Local upgrade verification

The complete 92-file chain was replayed independently, taking catalog snapshots
after version 65 and every pending version. In a second empty local database,
Supabase CLI **2.121.0** actually applied the first 65 files and recorded its own
ledger, then applied all 27 pending files and recorded **92**. No ledger was
fabricated or repaired. `rehearse-local-upgrade.mjs` makes this local-only drill
repeatable and rejects non-loopback database URLs, other Docker targets and
non-prefix histories. It always creates a new randomly named database.

The upgrade also used a schema-only local overlay for the observed extra column,
existing/default grants and automatic-RLS helper. All expected final objects
survived. Relative to a fresh full replay, there were **zero unexpected API DML
grant differences, RLS/table-shape differences or application routine differences**.
The observed legacy grants/defaults and extra column/helper remained visible;
the pending chain does not pretend to fix them.

The local PostgreSQL 17.11 cluster rejects a superuser-owned event trigger whose
handler is owned by non-superuser postgres. The simulation therefore leaves this
one administrative handler owned by the existing local supabase_admin, with no
API execution. Hosted 17.6 has the existing postgres-owned handler. No cluster
role was elevated or changed. This is a stated simulation limit, not a claim of
an exact managed-platform clone. Let the future staging platform create its own
administrative helpers and verify them separately; do not replay this overlay
as a production migration. PostgreSQL minor-version qualification remains open.

At completion, all seven scan gates, recurring generation and automated sending
defaulted OFF; the new database had no Auth users or Storage objects. The shared
disposable CRM and review owner were not reset. All original application source,
production configuration, dependency locks and 92 migrations are unchanged.
The credential-free regression suite passed **692 tests** and typecheck passed.
The new staging/copy tools were tested separately; previous application build
and file/provider integration evidence remains prior evidence, not a new run.

## Cutover constraints identified from actual data

Read-only aggregates found 35 completed Stripe receipts, no incomplete receipts,
one pending payment, two creating/open checkout records, one pending customer
communication, one effective owner candidate, zero active profiles linked to
inactive employees and no unvalidated public constraints. No personal details,
amounts or provider payloads were read. Checkout expiration/provider state was
not investigated; counts alone do not establish that a customer is paying now.

PR06 will preserve the 35 historical processed receipts by backfilling their
new completion markers. Rehearse this with synthetic receipts, not production
copies. The new financial/quote/schedule boundaries reject the old app's direct
writes. Applying the whole schema while the old `49a0b82` app and scheduled
workers continue writing is not an acceptable release sequence.

For a future approved production window: refresh these counts, review the
pending payment/checkouts/communication without replaying customer sends, prepare
paired database/source-file recovery, quiesce relevant writes/workers, apply only
the approved chain and release the matching verified app, then check recovery
queues and resume deliberately. Stripe/webhook retry and communication ownership
must survive the window. No pause, retry, cancellation or provider action happened
during this preparation.

## Recommended next step

Continue PR18 staging preparation: assign the separate stage project/site/scanner
and origin, decide how to capture the observed column and clean up legacy grants,
then implement narrowly scoped staging canonical-origin support with tests.
Keep production's origin restriction intact. Verify the isolated target and its
inherited environment/protection before any staging build or deployment approval.
See STAGING_PREPARATION.md. No hosted reconciliation execution is authorized here.
