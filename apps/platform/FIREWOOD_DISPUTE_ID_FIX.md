# Firewood dispute-ID correction — verified, test only

Follow-up migration **128**, `20261026182017_firewood_test_dispute_ids.sql`, accepts the actual Stripe `du_` dispute ID format while preserving previously accepted `dp_` snapshots. Original applied migration 127 remains byte-identical. The replacement function body was compared to the original after reversing only the ID guard and `CREATE OR REPLACE` syntax; all other logic is identical.

The account/test-mode/source, Session/intent/charge, amount/currency, immutable snapshot, lease, refund/dispute ordering and transaction checks remain. Service-only grants and private RLS are preserved. The general ledger has no conflicting prefix-only guard; its unique dispute-ID and identity/amount checks remain unchanged. Synthetic dispute fixtures now use the actual provider ID shape.

## Verified results

- **3,233 CRM tests**, **20 native integration groups**, and **five optimized HTTP route groups** passed. Added cases cover initially disputed imports, `du_`/legacy `dp_`, malformed/mismatched evidence, concurrent finishes, repeated delivery, changed identity, terminal regressions and partial-refund/dispute win/loss interactions.
- Fresh owned loopback database replayed all **128 migrations**. Fresh/offline schema checks passed; public generated types are unchanged and source/deferred fingerprints match.
- Node **22.23.4** typecheck and optimized **Next 16.4.2** build passed. Build ID: `llMK1fpG1FNnsRVFNA57H`. Build-manifest SHA-256: `965091624b4ddced1bc39ebceadaf18176c4c6109582f8636cec17f7679c30ff`.
- Local security advisors reported **no issues**.

The original retained paid order `FW-TEST-4684CCC0139D4C569B41638C22B507E6` was replayed through the existing Website queue/client and optimized CRM using independently retrieved ATS Stripe sandbox evidence. Responses were **201, 200, 200**. It has one stable invoice/payment pair, its original Session/intent/charge/paid timestamp, a paid original receipt, and its current `needs_response` financial-review outcome. It was never recharged.

The retained CRM now has **seven invoices/payments**, up from six. The other six financial mappings remain unchanged. All **14 local confirmation copies and tries** are unchanged; these are captures, not evidence of real email delivery. Jobs, leads, communications, outbound requests/deliveries, source events and enabled invoice reminders remain zero. The dedicated read-only Stripe key and an additional runtime GET-only guard prevented provider writes.

Both environments were isolated and local: a fresh native stack and the original retained Website sandbox/local CRM project `ats_fwimport_0c442c677ebb`. **Hosted ATS staging and production were not accessed.** Owned stacks/apps are stopped; synthetic volumes, paid orders and history are retained. No provider listener, live payment, customer message, commit, push or deployment occurred.

Migration SHA-256: `34248e5b7ac555d29515373376937b963b1578da0b83516ff343588aa5a32605`.

## Scope and remaining release gates

The original checkout had Next 16.3.8 installed despite its patched lockfile. The build security check refused it. A separate exact-lock Next 16.4.2 dependency copy was used inside the isolated build; the checkout's installed dependencies were preserved. Initial test-harness/DDL-generation issues were corrected before the successful fresh replay. No applied migration was edited.

The connector remains disabled by default and cannot select hosted CRM or live keys. Hosted durable queues/workers, stock/order operations, actual confirmation transport, approved live tax/terms policy and public-release review remain separate requirements. This correction resolves the reproduced dispute-ID blocker only.

Local evidence is retained under `/Users/noelsierra/Documents/Codex/2026-10-26/firewood-dispute-id-fix/`, including `RETAINED_REPLAY_RESULT.json`, `native-verification.json`, `http-verification.json`, `CLEANUP_VERIFICATION.json` and `FINAL_SOURCE_PRESERVATION.json`. Raw keys, provider proof and database credentials stay private and are excluded from source reports.
