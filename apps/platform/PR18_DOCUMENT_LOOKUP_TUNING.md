# PR18D: measured document quote-picker lookup

While testing the library, its existing quote-link picker hit the local statement
timeout. The disposable database contains 106,812 synthetic quotes from earlier
reporting tests. An authenticated owner query, with unchanged RLS and the same
customer/organization joins, ordering and 250-row limit, took 8,507.310 ms. Adding
an index on `quotes(updated_at desc)` reduced that measured read to 30.619 ms.
This is one before/after measurement, not a production latency guarantee.

The existing `(archived_at, updated_at desc)` index does not cover this query's
ordering across all archive states. This package preserves those states and every
existing index instead of changing which records can be linked. It adds only the
measured ordering index, with a one-second lock timeout and five-second statement
timeout. A busy/large production table must fail and roll back rather than stall
writes; a concurrent build would require a separately reviewed maintenance step.
Follow SUPABASE_MIGRATION_RECONCILIATION.md before any hosted migration.

No RLS, query limits, UI capabilities, financial or employee logic is changed.
The new index is also checked by fresh migration replay. Search permission,
normalization, wildcard escaping and stable-page tests were rerun locally.
The now-working quote picker was exercised in the document form. No production
schema/configuration change or deployment was performed.
