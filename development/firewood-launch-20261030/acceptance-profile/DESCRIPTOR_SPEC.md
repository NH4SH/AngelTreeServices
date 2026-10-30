# Firewood production and acceptance identity specification

This is a local derivation specification, not runtime installation or activation authority. Canonical frozen sources remain untouched. No key, provider, host, or production database access is included.

## Fixed production identity

- Office contract: `firewood-office-live-v2`.
- Financial contract: `firewood-invoice-handoff-live-v1`.
- Source: `website_firewood_invoice_live_v1`.
- Environment: `ats_firewood_live_v1`.
- Mode/livemode: `live` / `true`.
- Expected account from frozen contract: `acct_1Tv92EI7tY6VHUvU`. This is an expected identity, not a fresh account/key verification.
- Paths: existing `/api/integrations/firewood/live/v1/{prepare,status,renew}` and `/api/integrations/firewood/live/v2/office/{price-request,price-status,order-status}`.
- HMAC domains: existing `ATS-FIREWOOD-LIVE-V1` and `ATS-FIREWOOD-OFFICE-LIVE-V2`.
- Runtime binding, provider observation, database identity, release/schema pins and authority remain unbound until root supplies independently observed evidence. Environment booleans cannot fill these fields.

## Agreed acceptance identity

- Office contract: `firewood-office-acceptance-v2`.
- Financial contract: `firewood-invoice-handoff-acceptance-v1`.
- Source: `website_firewood_invoice_acceptance_v1`.
- Environment: `ats_firewood_acceptance_v1`.
- Mode/livemode: `test` / `false`.
- Expected sandbox account: `acct_1UU9U8RAZXGe6tX0`; verification status **UNVERIFIED**. No key read or provider call has occurred in this task.
- Paths: `/api/integrations/firewood/acceptance/v1/{prepare,status,renew}` and `/api/integrations/firewood/acceptance/v2/office/{price-request,price-status,order-status}`.
- HMAC domains: `ATS-FIREWOOD-ACCEPTANCE-V1` and `ATS-FIREWOOD-OFFICE-ACCEPTANCE-V2`.
- Hermetic unit-fixture origins: `https://crm.firewood-acceptance.invalid` and `https://checkout.firewood-acceptance.invalid`. These exist only in non-provider-ready hermetic fixtures. The default acceptance descriptor has null origins. An actual final-topology HTTPS origin/path requires a distinct operator-approved binding; it may use the existing hosts with guarded acceptance paths and must not inherit live authority.
- Database purpose: `ats-firewood-acceptance-v1`; separately owned native database with exact name, system identifier, UUID marker, database comment, metadata marker, schema/release digests and admission binding. No production IDs, rows, provider credentials or customer data.
- SQL/RPC identity namespace: `firewood_acceptance_` instead of `firewood_live_`. This affects only the separately derived private tables/functions/constraints/triggers and matching RPC literals. Shared original financial function names remain unchanged. This acceptance schema is not an installable production migration.

## Frozen business semantics

Keep accepted terms version, clauses and hash `b58eaaea481bfd1aecf509ef940a8f0bc135f7db4446784533cb3b588c6ac482` unchanged. Keep payment policy version and hash `201c6523787fd3e2289843f51e63b1726b85a5fc2978cbae15acf870e79cdad3` unchanged. Keep price catalog, tax basis, surcharge math, cash-ledger reducer, issuance/credit math, lifecycle transitions, role/session checks, RLS/ACL, row/advisory locks, CAS guards, request/replay rules and original financial branches unchanged. No test settlement is a live settlement; identifiers and observed provider mode must remain distinct throughout.

## Deterministic derivation contract

Pin each complete source hash before any replacement. Each file has an exact list of identity-only old/new literals and required occurrence counts. Record every source/output span. Reject missing, extra, overlapping, unknown or changed inputs. Reversing the recorded spans must reconstruct the exact pinned source bytes. Copy unchanged import dependencies with pinned hashes; reject any import escaping the owned artifact. Preserve business-policy bytes and all original ordinary financial branches. Record both manifests and a derivation digest.

Acceptance modules retain internal export names for compatibility, but their descriptor, network/HMAC identity, SQL objects and wire envelopes carry acceptance identity. They are emitted only under this owned folder; no canonical files, routes or live handlers are changed.

Pure read-only validators must reject mismatched expected/observed account, wrong mode/livemode, live paths or signatures on acceptance, acceptance paths or signatures on live, production database purpose/marker in acceptance, missing schema/release/admission binding, unverified provider observation, and booleans offered instead of binding evidence. Passing validation records consistency; it does not create keys, connect providers, install a runtime, or authorize activation.

## Local verification only

Use Node built-in tests with fake in-memory transports/rows only for this derivation unit. Prove deterministic outputs; exact hash/preimage rejection; unchanged terms/payment/pricing/accounting behavior; cross-profile request/signature rejection; wrong account, livemode, DB purpose and marker rejection; and no process.env, network, key, or database loading by the profile module. Root owns a later separately authorized actual native QA target and all actual account/provider observation.

Root confirmed the identity and namespace design. Before every executable SQL unit, a bound envelope must verify target purpose plus literal database name/OID/system identifier/comment/marker and the separately registered admission binding. Shared original102 dispatch routines mean the acceptance profile must never install or coexist in the production database. This derivation does not connect a database or render executable SQL until root supplies matching fresh independently observed bindings.
