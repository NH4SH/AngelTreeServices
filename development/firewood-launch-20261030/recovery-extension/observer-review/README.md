# Continuous catalog observer review — recipe v2

This folder is an offline recipe. Nothing is wired into recovery-profile-context.mjs or any production adapter. No VM, HOME, cloud, provider or database query was executed by this author.

## What the one statement observes

continuous-catalog.select.sql builds three separately framed projections in one catalog statement and returns only their opaque SHA256 digests, two named-inventory digests and structural counts:

- semanticSchemaSha256 covers non-system schemas, relations/columns/defaults/constraints/indexes/triggers/views/sequences/ownership, routines, types/enums/domains, event triggers, extensions, database encoding/locale/ACL, role/database configuration hashes and the authorization projection.
- ownerAclSha256 covers database/schema/relation/column/routine/type/default privileges, owners, role privilege flags and connection limits, memberships including grantor and all PG17 options, RLS enable/force state and policy roles/expression hashes.
- guardEnrollmentSha256 covers each exactly named protected table and all its hosting guard triggers, guard function definitions/security/configuration/ACL, guard schema permissions and guard event-trigger metadata.

Every routine body and definition is hashed inside PostgreSQL. Raw CRLF remains significant. Routine, role and database-role settings are hashed server-side; no value or raw record is returned. The global role configuration recipe exactly matches v3: sha256(UTF8(coalesce(to_jsonb(rolconfig),'null'::jsonb)::text)). SQL NULL differs from an empty array.

Owner/ACL projections resolve role names instead of hashing role OIDs. ACL order is normalized under C collation while preserving grantor, grantee kind/name, privilege and grant option. NULL raw ACL remains distinct from an explicit equivalent ACL. Policy roles and all record identities also use C order, independently of the source's ICU application-data sorting.

The meaningful bootstrap identity is retained separately as the role at OID10. Current Root readback identifies supabase_admin there; the observer does not substitute that name from a config claim. Ordinary role OIDs are representation details; bootstrap identity cannot be projected away.

Role can_login is intentionally absent from the static projection. Role validity timestamps were already operational and remain absent. All other represented privilege properties, connection limits and configuration hashes remain static. Live LOGIN/session/readiness/validity eligibility must still be checked separately before renewal or start; this digest does not reopen a login.

## Exact inventory and guard scope

The freshly approved source inventory is175 protected ordinary tables in public/app_private/auth/storage and176 captured tables when supabase_migrations.schema_migrations is included. The reviewed overlay adds exactly25 named tables, producing200 protected and201 captured. Counts crosscheck; they never establish authority.

The named digests hash compact JSON arrays of sorted qualified ASCII table names. The SQL uses C order and compact to_json entries to match the existing policy's sorted-name JSON hash. Unsupported identifier shapes are counted. The independently approved exact inventories remain mandatory outside this query; no query input supplies its own expected names or hash.

The protected tables each require three O-enabled triggers:

- ats_hosting_admission: row BEFORE INSERT/DELETE/UPDATE, enforce_write(), type31, no deferral or constraint.
- ats_hosting_commit: row AFTER INSERT/DELETE/UPDATE, enforce_write(), type29, constraint present, deferrable and initially deferred.
- ats_hosting_truncate: statement BEFORE TRUNCATE, operator_truncate_only(), type34, no deferral or constraint.

Each must have no arguments, column restriction, WHEN qualification or transition tables. Extra guard triggers invalidate the exact triplet. The independently approved capture confirms that the global migration ledger has no guard triplet. The observer reports ledger guard count separately; it never invents an enrollment for that table.

Require duplicateAclIdentities, invalidGuardTripletTables, ledgerGuardTriggers, duplicateSemanticIdentities and unsupportedInventoryNames to be zero, bootstrapRolesAtOid10 to be one, all expected digests to match independently reviewed pins, and all structural counts to match the reviewed profile. Non-system aggregates, foreign servers/user mappings, subscriptions, security labels and nondefault tablespaces are unsupported in this profile and must remain zero. A valid count or triplet flag cannot replace a named digest comparison.

## Execution and authority boundary

Root executed this exact v2 source in its owned native PG17.11 QA rehearsal, and compared it against the preserved original query. The caller supplies a READ ONLY transaction with search_path pg_catalog, timezone UTC, jit=off, statement timeout5s and lock timeout1s. JIT is disabled only for this caller transaction; no database or role setting is changed. Grammar/performance/equivalence passed for the same data-free QA catalog; the fixture still has known baseline ACL differences and is not a final source postimage. Root must finish that postimage and intended fault checks before considering adapter integration.

The returned semantic digests use PostgreSQL17 JSONB text serialization, with sorted record/privilege arrays. Pure fixture tests exercise invariants; they do not claim that Python's fixture serializer reproduces server bytes. Root must measure actual server hashes. Every expected digest in the supplied contract stays UNBOUND.

No expected digest is accepted as an observation. A source/archive/binding repeating its own hash is not approval. Registration and the existing independent signed receipt must bind the final reviewed source, overlay and actual semantic/owner/guard postimages. Capture/boot/namespace/generation/topology/clock/14-second SQL lease/280-second backup age and one-writer checks remain separate and unchanged.

documentFamilySha256 and releaseComponentDigest remain explicitly UNBOUND. They require Root's fixed, reviewed filesystem/component closure and actual bytes. No document/component digest is invented from a runtime config or this SQL output.

## QA fixture transformations

The data-free native rehearsal intentionally differs from production:

1. It has a fresh physical SID, boot, purpose marker and isolated network/volume.
2. It adds an explicitly named QA operator, while retaining the actual supabase_admin bootstrap identity at OID10.
3. Source roles initially stay NOLOGIN. That operational difference does not affect the static role projection.
4. Role/database configuration values are not copied. Source v3 configuration hashes are provenance; a QA hash over omitted configurations cannot equal production by assertion.
5. Six migration authors are redacted, and every non-NULL historical SQL array is replaced server-side with an inert digest/count/null/dimension comment. The QA ledger hash is distinct from the original630 source hash.
6. Publications/subscriptions/transport and source data are not imported by the schema-only fixture.

These are declared comparison transformations, never substitutions in the actual observer. The observer always hashes the real catalog it reads. QA proof must compare unchanged source definitions and the exact intended delta using its explicit fixture mapping; it must not claim a full QA semantic digest literally equals production. Unexpected role/configuration/schema differences are failures, not additional normalization opportunities.

## Coverage and remaining verification

The statement is a schema/authorization/guard observer, not a customer-data scanner, backup-content verifier or complete PostgreSQL system-catalog attestation. Application rows, current guard lease rows, sequences' changing last_value and provider state are not read. Publication transport, system pg_catalog implementation internals and arbitrary future extension classes require their existing independent image/runtime/recovery checks; this recipe does not replace them.

The42 local tests cover quoted-source read-only boundaries, opaque-only output, NULL/config distinction, grantor/options, role LOGIN exclusion, meaningful bootstrap identity, locale-independent named inventories, same-count replacement, raw CRLF hashes, guard faults and the exact175/176 split. Native source postimage qualification and operative integration remain unverified; Root's narrower native grammar/performance/equivalence results are recorded below.


## Preserved ACL fixes and v2 lookup optimization

The original empty-ACL correction is preserved under history-before-empty-acl-fix; the corrected fbb2cf query, builder, tests, contract and proofs are preserved under history-before-acl-map-v2. NULL ACLs retain applicable object defaults; explicit empty ACLs remain empty and raw_is_null=false. No privilege or guard rule changed.

V2 uses the exact Root-tested2bfb4879… bytes. Canonical ACL records and one identity-to-record lookup map are MATERIALIZED once. Six identity joins and the per-column scalar ACL scan become exact map lookups. A duplicate ACL identity prevents map construction and makes semanticSchemaSha256, ownerAclSha256 and guardEnrollmentSha256 SQL NULL. duplicateAclIdentities must also be zero; no last-value-wins lookup establishes authority.

The17 edit spans reverse exactly to fbb2cf…; all other record definitions and hash-input recipes are unchanged. The historical performance package retains this source proof. The current top-level builder regenerates the promoted v2 bytes; the old experimental renderer remains historical and bound to its fbb inputs.

## Root native equivalence evidence

NATIVE_REFERENCE_EQUIVALENCE_PROOF.json and NATIVE_ACL_MAP_PERFORMANCE_PROOF.json record Root's owned QA comparison:

- Original fbb query:8050.15ms under an explicitly authorized30-second QA-only diagnostic bound.
- Promoted v2 query:581.12ms within the unchanged5-second operative bound.
- All five opaque digests and every original count were identical; the only added count, duplicateAclIdentities, was zero.
- Both probes used transaction-local jit=off. No operative or production timeout increased.
- The QA catalog still has known baseline ACL differences. These are query-equivalence/performance proofs, not final source/overlay qualification or production pins.

The author ran42 local fixture/source/proof-consistency tests and no database/VM/HOME/provider operation. The contract and expected production hashes remain UNBOUND, and the operative observer adapter remains disabled.
