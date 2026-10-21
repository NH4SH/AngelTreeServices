# Production scanner and customer-email activation

Owner authorization: enable the production scanner and automatic customer emails only after verification; preserve existing records and prevent duplicate sends.

## Verified release safeguards

- Production and staging use separate scanner hostnames, tokens and nonroot bridges. The existing bounded ClamAV engine remains shared; no additional engine or provider account is required.
- Public TLS, digest matching, EICAR quarantine, missing/wrong/cross-environment token rejection and concurrent 25 MiB scans passed. Staging scanning remains intact. Readiness now checks loaded definition age and TLS expiry through the existing incident-deduplicated health monitor.
- A dedicated `CUSTOMER_EMAIL_WORKER_SECRET` activates customer communication processing without activating job advancement, calendar synchronization or manager-notification workers. Existing installations may still use the original shared key as a fallback.
- Migration 102 preserves the transactional delivery admission function, authorization, source locks, provider idempotency identities and uncertain-delivery protections. It puts first/overdue invoice reminders in the same admission family and includes accepted legacy invoice/quote delivery history. It changes no financial values, RLS or business records.
- Local real-Postgres concurrency checks passed: one winner for competing reminder stages; legacy accepted delivery suppression; legitimate later reminders; uncertain delivery holds; unrelated payment receipts; separate invoices; no anonymous or staff dispatch grants. All 2,194 regression checks and typecheck passed.
- Migration 102 was installed through the native exact-ledger workflow in staging, then production. Historical staging candidate verifiers retain their original exact-ledger acceptance; the additional migration is independently hash-pinned.

## Activation procedure

1. Deploy the verified source with production scanner configuration and the dedicated customer worker credential. Credentials stay outside Git and client code.
2. Run the operator-only, body-free synthetic scanner acceptance route from the actual Netlify runtime. Verify the existing health monitor observes the new critical scanner component.
3. Recheck the seven private attachment inventories before enabling their gates. Do not mark legacy files clean or disable a gate to recover access. Retention and purge remain unchanged.
4. Enable customer automation while refreshing the settings activation timestamp so historical payment receipts are not backfilled. Preserve existing per-record opt-outs and the minimum send interval.
5. Let the normal processor cancel stale sources and reconcile provider acknowledgments. Repeat inspection before any further pass. Never manually resend accepted or uncertain deliveries.

Final activation evidence and actual delivery counts are recorded below after live verification.

## Operating limits

The home Mac requires power, internet and a running guest. A full Mac reboot requires FileVault unlock and operator login. Scanner failure or stale definitions hold files closed; monitoring reports the outage. No business documents are retained by the scanning bridge. The scanner has no Supabase, Resend or Stripe credentials.

Netlify's current plan requires all supported variable scopes. The three new variables remain production-context only, have no client-public prefix, and both credentials are marked secret. No plan upgrade is required.
