# Supabase-managed defaults review — October 17, 2026

## Decision

**Preserve the protected defaults. Accept them as a documented exception for the
current, pinned 92-migration staging candidate.** Do not seek `supabase_admin`
membership, move managed ownership, change global function defaults, add an event
trigger, or restructure the application's API schemas for this issue.

This completes the defaults review in the existing PR18 staging sequence. It
does not authorize deployment, production reconciliation, provider operations or
future objects. The verified permission package `95da772` is now pushed to
`main` and `codex/pr18-staging-permissions`, with deployment skipped. This review
adds metadata SQL, local tests and one stricter operational guard; no application
behavior, RLS, financial/offboarding command or original migration changes.

The exception is narrow: application objects must be created as `postgres`, with
explicit object grants and function PUBLIC revocation, and the reviewed catalog
must still match before release. A provider-created public object is a new
permission review, even if RLS is enabled automatically. This is an engineering
assessment of this candidate, not a statement that the platform defaults are
universally safe or have been restricted.

## Actual staging evidence

Read-only queries against **CRM Staging**, `gbyhdsuiqeslgjdnbqng`, found:

| Property | Verified result |
| --- | --- |
| Normal migration account | `postgres`; not superuser; not a member of `supabase_admin` |
| Public application ownership, excluding extension members | 122 relations (110 tables, 10 views, 2 sequences) and 121 routines, all owned by `postgres` |
| Public application objects owned by another role | 0 |
| Normal owner's direct named API defaults | 0 |
| Protected managed defaults | 3 entries; 36 direct named API privilege entries, unchanged |
| Browser CREATE on public schema | Denied |
| Anonymous execution of public application SECURITY DEFINER routines | 0 |
| Current application ACL / shape / ledger | Same reviewed seals and original 92-entry history |
| Auth, files, business/queue state and automation | Empty; sending, recurring and all scan gates OFF |

The protected entries affect objects **created by `supabase_admin`**, not objects
created by `postgres`. PostgreSQL selects defaults from the current creator role;
role membership does not cause another creator's defaults to flow into new
objects. Ownership alone is not proof of how an old object was created, so the
review also uses the exact current ACL contract and original migration source,
not merely owner names. Defaults do not retroactively change existing ACLs.

The metadata query is `supabase/staging/review-managed-defaults.sql`. The existing
permission runner independently reverified the entire frozen contract and now
explicitly rejects a migration role that has gained protected-role membership.
Its default read-only invocation reported `changed:false`. No hosted probe
objects, role/default modifications or other hosted writes were made in this
review. No privileged API key was retrieved.

## What the defaults really permit

The local test reproduces all three actual protected defaults, instead of
assuming they are harmless. A protected-role-created public table inherits
anonymous SELECT **and TRUNCATE**, among other rights. Deny-by-default RLS hides
its synthetic row from anonymous SELECT, but an actual anonymous TRUNCATE still
removes that row. RLS is not protection against a granted TRUNCATE privilege.

This is a future-object risk, not evidence that customers can currently truncate
CRM tables through REST. PostgREST does not provide an arbitrary SQL/TRUNCATE
endpoint. The current reviewed object grants have already been reconciled, and
no hosted destructive request was attempted. Never introduce generic SQL RPCs
or assume a new provider object is safe because an automatic RLS trigger ran.

Functions have two separate grant sources:

1. PostgreSQL grants implicit global PUBLIC EXECUTE to new functions unless a
   global default changes it. The schema-scoped PUBLIC revocation shown in the
   Supabase guide cannot subtract that global default. The local tests confirm
   this on the actual disposable PostgreSQL runtime.
2. Provider defaults can also grant EXECUTE directly to named API roles. Revoking
   PUBLIC alone does not remove these direct grants. The correct object-specific
   operation must remove every unintended grant source before restoring only
   the intended caller grants.

Do this in the same creation transaction, before the object becomes visible to
other sessions. Do not globally change all `postgres` function defaults in this
review: that reaches beyond `public` and needs a separate compatibility decision.
Existing guarded transactional commands and intended service access remain.

## Supported configuration and platform changes

Supabase documents `supabase_admin` as an internal maintenance role and does not
give customers superuser access. Its current API guide prescribes changing
`postgres` defaults, not acquiring the protected role. The PostgreSQL authority
for ALTER DEFAULT PRIVILEGES requires ownership/membership of the target role.
The local negative test returns 42501 for normal `postgres` changing the managed
defaults. We did not repeat that failing mutation against hosted staging.

No supported customer setting to alter these protected entries was established
by the current documentation review. A provider-side change, if ever necessary,
belongs with Supabase support; no support message was sent. We do **not** need
such a change to validate this candidate's current explicit grants and normal
creator policy. Future provider-created application objects would reopen that
decision and must not be normalized blindly.

The official platform announcement describes an October 30, 2026 opt-in-grants
rollout. Treat this as a reason to recheck actual metadata around releases, not
a promise that the 36 observed protected grants will disappear. Existing ACLs
and future defaults are distinct. Our canonical fresh replay already had zero
named API default grants and produced the same current ACL contract, so this
release's explicit grants do not depend on retaining those automatic grants.
Do not introduce a temporary auto-exposure toggle or bulk grant as a workaround.

The current changelog was fetched before changes. PostgreSQL 17.11 compatibility
notes and the November 10 TLS cipher change were reviewed; no database upgrade,
extension rewrite, credential rotation or client replacement was undertaken.
The current staging engine is already 17.11. This review is not an upgrade audit.

## Local verification and limits

- **185/185 pgTAP assertions** across 11 files: all prior 160 assertions plus
  25 new creator/default/implicit-grant/real-TRUNCATE assertions. All synthetic
  objects, data and default probes roll back. The before/after snapshot matches,
  and zero fixture objects remain.
- A separate real protected-role-created object changes both shape and ACL
  fingerprints; the existing runner rejects that snapshot. The reviewed baseline
  is accepted. This is an actual local catalog change, not a mocked fingerprint.
- The new fixture uses the existing local admin connection only for simulating
  provider-created objects. Normal-role assertions use `SET LOCAL ROLE postgres`;
  no membership or cluster role is changed. The new clone retains the source's
  `postgres` database owner. The original review database is untouched.
- Runner unit tests cover unauthorized targets, elevated/missing membership
  evidence, changed catalog/defaults, source binding and transaction guards.
  Full regression and typecheck results are recorded in the verification packet.
- Hosted evidence is read-only metadata, empty/OFF counts and frozen-catalog
  comparison. SQL role tests do not substitute for hosted Auth sessions, hosted
  uploads or protected runtime behavior. No app runtime source changed, so a new
  application build is not required for this review package.

Private evidence is in the existing Codex `work/managed-defaults-review/` folder;
the shareable `PR18_SUPABASE_MANAGED_DEFAULTS_VERIFICATION.json` contains no keys.

## Release policy and next step

Before an approved staging run, rerun the read-only permission runner and
metadata query against the assigned staging ref. Review the exact source,
ledger, owners, ACLs, defaults, role memberships and empty/OFF state. An unknown
object, privilege or owner is a stop-and-review result. The initialization runner
is deliberately release-specific and requires an empty target; it is not an
automatic repair tool for a later populated environment. These checks detect
drift when run; they do not prevent a later provider operation or continuously
monitor the database. A provider upgrade or schema/default change requires fresh
review before the next release. No permanent safety guarantee is inferred.

The inventory separately records **review completed / defaults retained** and
**defaults restricted: false**. The conservative full-reconciliation flag remains
false; this review does not pretend the managed ACLs equal the bare fresh replay.
The shared application target manifest and every unproven hosting flag remain
unchanged. No production recommendation is applied automatically.

The next practical PR18 gate is **visitor protection and scanner host/operator
selection**, followed by isolated mail/session, server-key/runtime binding and
paired file/database recovery evidence. The current Netlify plan still lacks
the requested visitor protection; the scanner host remains unassigned. Keep the
site undeployed while those decisions and proofs remain open. Production retains
its original services, history, credentials, data and published deployment.

## Primary references

- [PostgreSQL 17 default privileges](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html):
  creator-role semantics, role boundary, and global versus per-schema defaults.
- [PostgreSQL 17 TRUNCATE](https://www.postgresql.org/docs/17/sql-truncate.html):
  the RLS exception, independently exercised with a synthetic local row.
- [Supabase API security](https://supabase.com/docs/guides/api/securing-your-api):
  explicit grants plus RLS; interpret its per-schema PUBLIC example using the
  PostgreSQL semantics and measured result above.
- [Supabase roles](https://supabase.com/docs/guides/database/postgres/roles) and
  [superuser restrictions](https://supabase.com/docs/guides/database/postgres/roles-superuser).
- [Official platform defaults announcement](https://github.com/orgs/supabase/discussions/45329):
  rollout context only; community replies are not evidence of our project's state.
