# PR18A: measured search tuning

This is the search part of the existing PR18 roadmap. Schema-type generation
and document scanning remain separate changes. No production change is applied.

A fresh disposable copy of the verified migration chain was populated with
2,500 synthetic organizations and 7,500 linked service locations. An authenticated
owner, with actual profile/employee/role state and RLS enabled, searched the
existing invoker union for location text. Three warm runs per query were measured
with EXPLAIN ANALYZE/BUFFERS. No customer data is used in plan artifacts.

| Query | Before median | After median |
| --- | ---: | ---: |
| Organization address page, first 25 | 1,330.883 ms | 602.423 ms |
| Exact matching organization count | 1,308.235 ms | 591.855 ms |

The lateral location aggregation scanned the location table repeatedly. The
existing customer FK index already covers customer lookups; its organization
counterpart was missing. Add only `service_locations(organization_id)`. The
candidate reduces both measured times about 55%. No speculative trigram index,
search projection, policy rewrite, old-index removal or advisor-count cleanup is
included. These results describe this synthetic workload, not every production
search or cold-cache request.

The search expression, exact count, normalized phone/address/name handling,
archive/source/status filters and invoker permissions remain. Admin list paging
now uses created time, record type and record ID, so equal-date records have a
stable order. Command search already used an ID tie-breaker.

The additive migration has a one-second lock-acquisition timeout and a five-second
statement timeout, in a transaction. A busy/large production table must fail
safely rather than wait indefinitely; inspect actual schema and size during an
explicitly approved release. If its index build needs a concurrent maintenance
operation, review that operation separately. Do not apply migrations to production
as part of local verification.

Local integration scenarios cover the index and invoker boundary, equal-date
multi-page results, original search variants, exact counts, archive filtering,
literal wildcard escaping and issued-token revocation. Earlier financial,
employee, sender-blocking and reporting behavior is preserved.
