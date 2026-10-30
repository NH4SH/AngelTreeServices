# Website native database boundary review

Local review and isolated permission rehearsal, 2026-10-30. No Website/CRM application source, production database, scanner, provider, credentials, or running home services were changed by this review.

The 15-table Website store can share `postgres.app_private` with the 10 proposed CRM tables, provided the new Website roles receive only the explicit column rights in `ACCESS_MATRIX.json`, all new tables receive the existing recovery fence, and both inherited PUBLIC privileges described below are resolved before any native login is activated. The Website DDL alone is not a secure installer.

## Decisions

- Keep `ats_firewood_request`, `ats_firewood_worker`, and `ats_firewood_health` NOLOGIN initially, NOINHERIT, without memberships, ownership, superuser, creation, replication, or RLS-bypass rights. No direct CRM, Auth, Storage, or `hosting_guard` access is granted.
- Only the operator installs `schema.sql` and immutable triggers. `installOfficeOrderStore` is explicitly isolated-only in the current source. The runtime must not receive CREATE, ALTER, DELETE, TRUNCATE, trigger-management, or schema-install authority.
- Preserve actual row locks. PostgreSQL `SELECT ... FOR UPDATE` requires an UPDATE privilege. Give `UPDATE(id)` only on immutable draft/order rows and the singleton control row for locking. Existing immutable triggers reject actual draft/order updates; the control CHECK fixes its key at true. Do not grant `UPDATE(paused)` to customer requests.
- Both request and worker roles need pricing/preparation/observation updates because customer requests can recover those operations. Worker alone can append confirmations, manage the fixed outbox attempt fields, and update its heartbeat. Request cannot read the outbox, confirmation store, or heartbeat; worker cannot read customer session/CSRF or rate/control tables.
- Health gets no raw table privileges. The proposed `fwofficev2_health()` wrapper returns only the exact fixed aggregate fields already used by `worker.status()`, after fresh native admission. Its SECURITY DEFINER use is narrow, intentional, private, SESSION_USER checked, and explicitly revoked from PUBLIC. It is a proposed integration seam: the existing Website `health()` injection must call this helper rather than granting health raw reads.
- Enable and force RLS on all 15 new tables. Policies apply only to the explicit native roles and require fresh native context. These are server-role policies, not a claim of per-customer database isolation: the Website still owns session, CSRF, accepted-order ownership, and strict receipt validation. Caller-set JWT GUCs cannot substitute for verified native identity.

## Actual inherited privilege blockers

`PUBLIC_METADATA_READBACK.json` reports effective PUBLIC USAGE on `net`, PUBLIC rights on its HTTP queue/response tables and sequence, and executable net functions. It also reports database PUBLIC TEMPORARY. NOINHERIT and per-role REVOKE do not deny rights inherited from PUBLIC.

TEMPORARY also allows temporary-table shadowing: implicit `pg_temp` lookup can precede the adapter's `app_private,pg_catalog` search path for relations. Checking `current_schema()` does not remove that path.

`public-boundary-rehome.sql.review-only.txt` therefore proposes a narrowly scoped rehome before creating the three native roles: snapshot every existing role's effective net USAGE, database TEMPORARY, and memberships; explicitly preserve those two privileges for exactly the existing non-super roles that already have them; revoke only net schema USAGE and database TEMPORARY from PUBLIC; verify the complete original role matrix is unchanged. Database CONNECT, net table/function ACLs, existing role memberships, and every other schema remain unchanged. Future roles would need deliberate net/TEMP grants.

This is not a per-role deny. It is a global ACL rehome with an explicit compatibility proof and must be handled by the exact target-bound operator installer. Discard existing pools and use fresh native-login connections; schema-USAGE revocation does not reliably invalidate previously resolved prepared plans. Audit indirect outside-net wrappers as well: an ordinary invoker function with a pre-resolved net dependency can matter even without SECURITY DEFINER. `indirect-net-references.read-only.sql` provides dependency/text-reference metadata without returning bodies or queue rows; it is not a proof against dynamically constructed SQL by itself.

The live metadata snapshot does not list a reachable PUBLIC SECURITY DEFINER function outside Website. This is encouraging, but the above net/TEMP blockers are real. Do not activate logins on the strength of the earlier schema/function ACL summary alone.

## Fresh native lease versus signed recovery receipt

`fwofficev2_native_context()` is a proposed private read helper owned by actual guard owner `supabase_admin`, VOLATILE, with empty search_path and an exact native SESSION_USER allowlist. It reads the actual `hosting_guard.state` and actual system identifier under that owner; callers receive neither schema USAGE on `hosting_guard` nor table/function access to the guard.

It rejects non-READ-COMMITTED isolation, operator `SET ROLE` impersonation, missing/unverified topology, capture hold, holder mismatch, changed database boot, expired/future lease, invalid topology fingerprint, future capture, and capture age at or above 280 seconds. It returns only database/SID/boot, lease epoch, node/topology identity, capture and lease times, and an expiry capped to the native lease, capture+280 seconds, and observed time+14 seconds. Epoch is text to preserve bigint precision. This helper does not pretend that a native lease proves a Website release hash or possession of a private recovery authority.

The separate released-context reader must validate exact host master bytes, real namespace/generation/source boot, actual SID/database boot/topology/schema/source/release/key bindings, and a genuine current signed receipt. The real authority fields are `recoveryBindingSha256` and `authorityPublicKeyFingerprint`, not an invented UUID. It must compare current native facts to that bound descriptor, read the signed/master context before and after the native read, and return the shorter deadline. Backup age is measured from capture start, not the later verification timestamp. The current Website adapter performs these checks before business work and before COMMIT in READ COMMITTED; mode-specific office/preparation/collection/sending gates remain necessary.

The actual original `hosting_guard.enforce_write()` checks lease expiry but not `capture_in_progress` alone. This review preserves that function. The existing maintenance controller must expire the lease and close native sessions when holding writes; the required precommit context read additionally rejects a changed capture hold. The isolated test separately proves both protections, without claiming that the old guard alone enforces the flag.

## Isolated native evidence

`NATIVE_PERMISSION_PROOF.json` records 12 passing groups on a new owned PostgreSQL 17.11 cluster, Unix socket only, no TCP. The fixture contains exact current Website 15-table DDL, exact original guard function bodies read from the saved deployed catalog, three empty synthetic CRM/Auth/Storage relations, and an explicitly fake net HTTP function that only returns an integer. No HTTP extension or provider was invoked.

The full matrix for all 25 preexisting local roles and membership rows is identical before/after the net/TEMP rehome. Three genuine native SESSION_USER connections then proved allowed column writes/locks, immutable history/outbox denials, health helper-only reads, denial of net queues/function/sequence/TEMP/CRM/Auth/Storage/guard/role/DDL access, JWT-GUC non-escalation, rejection of stronger snapshot isolation, stale/future/hold/topology/boot denials, actual 14-second expiry, actual deferred-COMMIT rollback after lease expiry, and precommit rollback on capture hold. All 15 Website tables have the three existing guard triggers. Final native roles are NOLOGIN; the owned cluster is stopped with synthetic data retained. An initial driver-import failure is preserved separately; it stopped its own empty cluster cleanly.

This proves the permission design against a deliberately small native fixture. It does not replace the full 175-table CRM catalog/effective-ACL audit, actual default privilege review, joined Website/CRM native workflow tests, paired off-device checkpoint/recovery verification, or a real runtime certificate. No signed recovery receipt or production approval was fabricated.

## Gates before an inactive production installation

1. Freeze the current Website adapter/mode changes and exact source/schema/helper/wrapper hashes. Review current `pg_default_acl`; reject unexpected table, column, function, owner, policy, or membership grants. Per-table REVOKE alone does not remove a separately granted column ACL.
2. Prove the live preexisting-role net/TEMP/membership matrix unchanged and indirect net wrapper risk resolved; keep new roles NOLOGIN throughout installation.
3. Validate exact existing 102 financial function preimages and the separate 10-table CRM package. Install only exact new objects; do not run the isolated installers in shared `app_private`.
4. Enroll all 25 new CRM+Website tables, not only this 15-table fixture; verify admission, deferred commit, and truncate guards and fresh full schema/ACL seals.
5. Complete corrected 54-file recovery-helper maintenance ordering, new generation/namespace master binding, paired off-device capture, current native admission and signed-runtime checks, and query compatibility using genuine native sessions. Only then consider controlled login activation, still without enabling provider sends, collection, or backlog replay.

All `.sql.review-only.txt` bundles deliberately abort their transaction and end in ROLLBACK. They are review material, not deployable migrations or authority to activate anything.
