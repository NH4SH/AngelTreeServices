# Native receipt source-admission checks

All eight focused receipt groups passed in a newly created, Unix-only, synthetic PostgreSQL 17.11 fixture. The same run passed all 13 existing financial-repair cases (205 operations) and six document-accounting groups. No older cluster was started, no HOME/production/provider was contacted, and no actual customer email or charge was sent.

Actual SQL readbacks prove the precise claim lineage: original retained-gold body `1900fbc1f487cd9847db7fdb32729e5a`; after the frozen payment-ID-only prerequisite `300389d99e9409f36610eaa971caee04`; still that body after all four canonical Firewood units; and `409f0e55cdc9a0075b1e4d42307a567d` after the separate source guard and the financial fixtures. Ten required original billing-core functions matched retained-gold body hashes, owners, definer modes, settings and volatility before approved deltas. The 102 migration count alone was not used as proof of function equivalence.

The tests verify:

1. A held sender returns no claim while preserving the complete prepared row, both request aliases, history and zero attempts.
2. A succeeded-payment receipt on a cancelled/credited order can be claimed with preparation and collection held when the independent sender flag is enabled. Recording an expressly synthetic accepted finish after sender hold still repairs history; replay adds no new delivery.
3. A separate payment on that same invoice remains eligible after the first accepted receipt, preserving payment-level duplicate matching.
4. `not_attempted` keeps the same single attempt, needs-review state and disabled blind retry.
5. An unknown outcome stays held with its original idempotency key and no second attempt.
6. Unknown payment, mismatched invoice, malformed live terms and missing handoff all return no claim without changing prepared history.
7. A concurrent lock on the source row returns no claim before the holder releases its lock, proving the NOWAIT behavior and no attempt/history mutation.
8. An ordinary receipt remains admitted while the live Firewood sender is held.

Accepted-message identifiers and ledger inputs are explicitly synthetic finish/evidence fixtures. They are not provider confirmations. All candidate source flags are false at the end; the new cluster is stopped with the complete evidence retained. The first two receipt fixture attempts omitted required communication fields; those failures are retained separately and were corrected only in fixture construction, without changing business SQL.

`NATIVE_RECEIPT_PROOF.json` contains the source stages, native target identity, ten-function core comparisons, detailed cases and final flags. This is not a complete 175-table production postimage, an off-device restore certificate, native LOGIN activation, provider verification or deployment approval. The proposed source-admission SQL, canonical files and existing financial/finish rights retain their separate reviewed boundaries.
