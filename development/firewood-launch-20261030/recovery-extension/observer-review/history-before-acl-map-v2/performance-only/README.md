# Observer performance review — isolated QA only

The original fbb2cf… observer passed the empty-ACL correction but exceeded the existing5-second limit in Root's owned, data-free native PG17 QA. Disabling JIT also timed out. Root's non-executing EXPLAIN identified estimated total cost45,559,570.82, semantic_records384,654 estimated rows and a routine-record identity join estimating278,053 rows.

No production query, timeout change, VM action or database operation was performed by this author.

## Concrete optimization candidate

acl-map-candidate/continuous-catalog.select.sql is a separate versioned review candidate. The original recipe is untouched.

The candidate materializes canonical ACL records once, verifies exact identity uniqueness, builds one JSONB identity-to-record lookup map, and replaces six repeated identity joins plus the per-column scalar CTE scan with exact map lookups. It preserves the existing ACL record construction, ownership, grantors/options, NULL/default distinction, routine/definition/configuration hashes and guard projections.

If any ACL identity is duplicated, no lookup map is built and all three attestation digests become SQL NULL. The added duplicateAclIdentities count must be zero. There is no last-value-wins authority. Expected hashes are never supplied as observations.

The17 source edits reverse byte-for-byte to the original fbb2cf… SQL. The extra count is the only intended result-schema addition.

41 pure fixture/source tests pass. They do not claim PostgreSQL grammar, native timing or output equivalence.

## Root's native verification

Run only on the same owned purpose-bound QA target, in a READ ONLY transaction with pg_catalog/UTC and jit=off. Preserve the operative5-second limit. Bind actual target SID/marker/container/volume and stop/preserve the owned target after the diagnostic as usual.

Require:

- All five original opaque digests equal the original query's result on the unchanged QA catalog.
- Every original structural count equal.
- New duplicateAclIdentities equal zero.
- Completion within the existing5-second bound.
- Original unsupported-object, guard and named-inventory requirements unchanged.

Root has separately allowed a longer **bounded QA-only diagnostic** for the original query if needed to establish the equivalence oracle. That exception does not change the operative limit or authorize any production query.

If performance still fails, inspect actual estimated plan shapes first. Further candidates may preaggregate column metadata and canonical ACLs by catalog OID inside this one statement, while keeping names in all hashed identities. Do not remove attested fields, cache unverified hashes, index/mutate system catalogs, expand timeouts, or accept caller-supplied expected hashes as observations.

Splitting the hashes into independent statements is not a ready replacement: different catalog snapshots can create a mixed observation. A split would require a separate consistency/transaction review and native proof. Keep the single-statement observation for this candidate.

## Planner diagnostic

explain-estimates.select.sql prefixes the original query with EXPLAIN ANALYZE FALSE, VERBOSE FALSE, COSTS TRUE, FORMAT JSON. It plans without running the observer.

summarize-plan.py reads a privately captured plan file locally and prints only node/cost/row/width/JIT summaries; filters, conditions, output expressions and values are omitted. It has no database interface.

No candidate is integrated into an operative adapter or independently registered profile by these files. Native verification and Root approval remain required.

