# Staging migration 97 reconciliation

October 20, 2026. Principal-snapshot implementation `4fa9021` is pushed to main
and its preserved branch, deployment skipped. This operational follow-up is
local on `codex/staging-principal-97`, based on that main. It changes no application
runtime behavior and does not deploy the app or change production.

## Result

The existing ATS staging project `gbyhdsuiqeslgjdnbqng` is verified at 97 migrations.
Only unchanged `20261021012859_invoice_payment_principal_snapshot.sql` was applied
through the pinned CLI, with seeds/roles absent and Vault provisioning skipped.
Its SHA256 remains `f9d3e431e8fcdd7126489b2826a8fff5fd1c0b5c3138e19937c46ba70e7d1ac4`.
The original 96 ledger entries and every existing catalog object are preserved.

The full live catalog exactly matches the separate local managed-default/normal-
owner rehearsal: 4,844 objects, one added routine, zero changes/removals. The new
principal read is owned by postgres, invoker/stable, empty search path, executable
only by service_role among API/Auth roles, with no private-helper grant. A
privileged invocation carrying an end-user subject still fails with 42501. No financial
formula, RLS, old execution grant, default privilege or monetary transaction was
changed. Application release readiness remains false.

| Check | Observed result |
| --- | --- |
| Assigned project / organization / physical database | Same reviewed ATS target, healthy, exact database identity |
| Before / after ledger | Exact 96 prefix preserved; 97 total; no history repair/reset |
| Local upgrade | Full chain under normal postgres; expected 97 seal; original source bytes |
| Rollback / repeat | Injected post-migration failure rolls back function and ledger; valid repeat idempotent |
| Local database assertions | 295 passed across 15 pgTAP suites, including 24 new principal checks |
| Regular regression gate | 1,565 passed, zero failed/skipped; eight new verifier cases |
| Isolated Node 22 typecheck / optimized build | Passed with synthetic settings, no linked config or credentials |
| Hosted dry run | Only migration 97; no seeds/roles; repeat is up to date |
| Hosted read-only permission probes | Three actual 42501 denials; server absent-invoice read returns null |
| Active Auth guard | Same definition, effective permissions and active configuration; synthetic direct guard result 503 |
| Auth/API configuration / owned and managed defaults | Unchanged fingerprints and seals |
| Business/Auth/files/notification/source-event state | Empty; sending, recurring, document and attachment scanning remain OFF |
| Hosted security advisors | Same 59 WARN / 31 INFO; zero new findings |
| Shared local preservation | Exact 110 public row sets, functions, native ledger, constraints, policies, buckets and scan switches unchanged |
| Existing development session | Preserved; login HTTP 200 after normal redirect |
| Production / app deployment | No production database query/write and no app deployment |

## Procedure and scope

Fresh read-only prechecks used the current 96 verifier, complete source/catalog
hashes, exact physical identity, ATS organization/healthy project, normal migration
owner, zero business/private retry/delivery state, active Auth guard and fresh
Management API configuration. No API keys were retrieved or configuration patched.

A separate empty local database replayed the original chain using the existing
managed-default/object overlays, permission reconciliation and Auth guard fixture.
The 96 catalog and complete snapshot matched live staging exactly. The unchanged 97
addition produced the reviewed one-routine delta, identical owned/managed defaults
and empty/OFF state. An intentional failure after the SQL verified native migration
rollback; a valid application and repeat verified successful/idempotent behavior.
The full pgTAP suite ran only in that separate local database and rolled its
synthetic records/probes back. It includes 1,005 successful one-cent payments,
non-successful payment exclusion, unchanged invoice totals and overlap clamping,
plus actual role/subject denials and metadata grants.

The hosted operation used an isolated private CLI work directory containing only
the 97 pinned original migration files, no seed/role imports and no Vault update.
Before applying, the process rechecked the complete 96 preimage, catalog, exact
source bytes, active Auth/API configuration, physical target and empty queues.
Native migration application adds only the reviewed routine and one history entry.

One post-application standalone metadata query had an alias-formatting error.
The SQL migration had succeeded. Verification was recovered strictly through
fresh read-only catalog, ledger, configuration and role checks; the migration was
not rerun. The final 97 read-only verifier passed, the complete catalog matched the
local rehearsal, and a repeat native dry run confirmed no pending migration.

Hosted probes ran in a read-only transaction: actual anonymous/authenticated calls
and service-with-subject calls were denied; the real service-role query for an
absent synthetic invoice returned null. No hosted synthetic fixture, invoice,
payment, Auth user, communication or provider request was created. The direct
synthetic no-send guard call invokes only its SQL body and generates no Auth mail.
These probes are not evidence of a populated invoice through public PostgREST,
independent financial commits/concurrency, live Stripe/3DS, webhook acceptance or
a deployed application runtime. Existing scanner, restore/operator and hosted
runtime gates remain separate.

## Durable maintenance artifacts

- `supabase/staging/principal-candidate-97.json`: new reviewed source/shape/ACL/
  ledger seals; original 96 candidate hash and the one exact SQL addition.
- `apps/platform/scripts/release/verify-staging-principal-candidate.mjs`: read-only
  current 97 verifier with complete guard, empty-state and principal access checks.
- `apps/platform/tests/staging-principal-candidate.test.mjs`: target/source drift,
  unknown inventory, old ledger, changed permissions/defaults, active switches,
  stale config, production/write flag and principal-property rejection.
- `supabase/staging/tests/principal-snapshot.sql`: 24 rollback-only local assertions.
- `supabase/staging/README.md`: current 97 command and historical boundaries.

New observed seals are shape `bb38eaf4ae23dde0c006c1f2109c6427`, ledger
`34d3115ad95490db4d4abe59582b9517`, API ACL `ff2d16f1ff97777cb17a1035a62306cb`.
Owned/managed defaults retain their exact previously reviewed seals. Historical
92–96 packages, SQL/migration bytes, profiles and guards remain unchanged. The
historical deferred inventory remains pinned; it does not report hosted status.

No source application, database schema beyond migration 97, fee/price, RLS,
financial command, notification transport, offboarding/employee UI, credential,
service setting or dependency change. Existing untracked Impeccable work remains.
This reconciliation package is local pending push. No deployment or release flag
was advanced; the staging app remains undeployed and production unchanged.

Private operational evidence:
`/Users/noelsierra/Documents/Codex/2026-10-20/staging-97/`.
