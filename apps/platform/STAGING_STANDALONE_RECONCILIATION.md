# Staging migration 98 reconciliation

October 20, 2026. Standalone invoice safety `a341d4f` is pushed atomically/nonforce
to main and its preserved branch, deployment skipped. This operational follow-up
is local on `codex/staging-standalone-98`, based on that main. It changes no
application runtime code and does not deploy the app or change production.

## Result

ATS staging `gbyhdsuiqeslgjdnbqng` is verified at 98 migrations. The only applied
file was unchanged `20261021022314_standalone_invoice_requests.sql`, SHA-256
`2a4ab5a6a913e0c861ca8ca05b2e674cde1dc544ffdcf982c770c5cf7e6a4c54`.
The original 97 version/name entries and all existing catalog objects are intact.
No seeds, role imports, Vault provisioning, history repair or reset occurred.

The live catalog exactly matches the normal-migration-owner local rehearsal:
4,856 entries, 12 additions, zero existing changes/removals. The additions describe
one private request ledger, its six columns/two constraints/index, its restrictive
deny policy and one authenticated staff command. Existing financial functions,
RLS/grants, principal snapshot, defaults, active no-send Auth guard, configuration,
empty business/notification/source state and OFF switches are preserved.

| Check | Observed result |
| --- | --- |
| Assigned project / organization / physical database | Exact reviewed ATS identity and healthy target |
| Hosted migration history | Original 97-entry prefix preserved; exactly 98 total |
| Local managed-default rehearsal | Exact staging-97 preimage; unchanged 98 SQL; expected catalog/seals |
| Rollback / repeat | Injected failure rolls back new objects and history; valid apply/repeat succeeds |
| Existing database suites | 295 assertions passed across 15 pgTAP suites |
| Standalone command suite | 24 scenarios / 25 TAP results passed on a separate empty managed-default clone |
| Regular regression gate | 1,679 passed, zero failed/skipped; nine new maintenance-verifier cases |
| Isolated Node 22 typecheck / optimized build | Passed using synthetic settings and no copied credentials/linked state |
| Hosted dry run | Only migration 98 before; no pending migrations afterward; no seeds/roles |
| Independent final read-only verifier | Exact 98 ledger, catalog, guard, config, defaults, principal and private request protection pass |
| Hosted permission probes | Seven actual read-only denials; no fixtures or requests created |
| Shared development stack | All 110 public row sets, functions, ledger, constraints, policies, buckets and scan switches unchanged |
| Application / production | No app deployment or production database query/write |

The separate SQL suite retains owner/admin/estimator/payroll access, role/account
denials, request/payload/actor binding, new-customer replay, individual/organization
billing, late-write rollback and lost-result recovery. Five independent-session
tests observe real advisory-lock waits and commit/rollback handoff, including
contact conflicts and revoked access while waiting. Synthetic committed fixtures
exist only in that owned local clone, never on staging or the shared app database.

## Security advisor decision

Hosted advisors changed from **59 WARN / 31 INFO** to **60 WARN / 31 INFO**.
All 90 original findings are unchanged. The single new warning is
`authenticated_security_definer_function_executable` for
`public.create_standalone_invoice`; there are no other new findings.

**Keep the reviewed command and leave this warning visible.** Authenticated users
need EXECUTE to invoke the app's transaction, while its existing live office-role
checks authorize writes before and after the request-lock wait. The command uses
an empty fixed search path, narrow input handling, the existing validated financial
command and a private ledger with restrictive deny policy and no direct API-role
table privileges. Local SQL verifies nonstaff/inactive/revoked access denial and
all four authorized office roles. Hosted negative checks independently confirm
unbound/nonexistent users cannot invoke it. The full function/catalog hash matches
the reviewed source.

Changing it to invoker would require redesigning the existing protected financial
write boundary. Broadening table grants or suppressing the finding would not be
appropriate. This is an intentional privileged-command boundary, not a finding
that was silently marked fixed. Supabase's [advisor guidance](https://supabase.com/docs/guides/observability/advisors)
explicitly calls for evaluating intentional findings against the intended access
model. The earlier local advisor engine did not emit this hosted rule; its prior
zero-new-findings result is local evidence, not the hosted result above.

An initial read-only probe could not complete its managed Auth-role impersonation
check. The permitted-role probes were rerun without that impersonation: anonymous
and service execution, authenticated execution without a subject/with a nonexistent
subject, and direct ledger reads by anonymous/authenticated/service roles all fail
with `42501`. The managed Auth role's false execute/table privileges are verified
from the effective catalog; no permission was changed to enable testing. The
migration was not rerun. The existing server-only principal read still returns
null for an absent synthetic invoice, and the direct synthetic no-send guard
body still returns 503. No Auth email operation was attempted.

## Operation and limitations

Fresh prechecks verified physical identity, ATS organization/health, the complete
97 ledger/catalog, normal migration owner, active Auth guard and fresh effective
Auth/API configuration. A local normal-owner/managed-default rehearsal matched
that full preimage before the forced rollback and valid upgrade. The private CLI
work directory contained exactly the 98 original files, checked byte-for-byte.
Immediately before the one native staging upgrade, source bytes, complete
preimage/catalog, configuration, guard/defaults and empty/OFF state were rechecked.

Postchecks used read-only queries and fresh configuration. Full hosted catalog
and new command/ledger permissions match the local rehearsal; original history,
principal, guard and configuration fingerprints match the before state. Repeat
native dry run is up to date. A separate invocation of the new maintenance tool
matches all post-apply evidence. No key retrieval, credential provisioning,
configuration patch, role import, provider request, collection or message occurred.

These checks are not populated hosted PostgREST, issued-JWT/browser, TLS/CDN,
deployed runtime, Stripe or email acceptance evidence. Scanner, paired source-file
restore/operator and protected hosted runtime gates remain separate. Hosting
readiness remains false; no production rollout is implied.

## Maintenance artifacts

- `supabase/staging/standalone-candidate-98.json`: pins the unchanged 97 candidate,
  original SQL and exact 12-entry delta; shape/ledger/API ACL/default seals.
- `scripts/release/verify-staging-standalone-candidate.mjs`: read-only current-98
  check, including restrictive policy, narrow effective permissions and empty
  private history. It rejects production targets/write flags.
- `tests/staging-standalone-candidate.test.mjs`: source/inventory/history, physical
  identity, guard/config/freshness, defaults, permissions, policy and empty-state
  drift rejection. Existing principal/notification/source protections remain.
- `supabase/staging/README.md`: current maintenance command and historical limits.

Observed seals: shape `fb7d851b02b21b4982481a2bf35bac9d`, ledger
`7e27eca9b807388c245db26c3fd02a0b`, API ACL `be7ffc90fbac497504987b670b198a49`.
Owned/managed defaults retain their previous exact seals. Historical candidates
92–97, SQL, profiles and guards are unchanged. Deferred inventory is still the
historical source-93 pin, not a live hosted installation/status file.

This reconciliation package is local pending push. Existing untracked Impeccable
work is preserved. Private evidence:
`/Users/noelsierra/Documents/Codex/2026-10-20/staging-98/`.
