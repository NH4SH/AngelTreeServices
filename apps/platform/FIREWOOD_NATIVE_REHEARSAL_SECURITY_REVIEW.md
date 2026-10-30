# Firewood focused native rehearsal: security review

Reviewed October 30, 2026. **The isolated native schema, permission and write-fence checks passed. Keep the live office package inactive.** These results close the earlier gap in testing the real 102-based schema, but do not approve a production installation, refund/accounting closure, runtime admission or five-minute recovery certificate. The billing rehearsal found a separate release blocker described below.

## Actual target and scope

This review used the fresh development-Mac PostgreSQL **17.11** cluster, system identifier `7702321714064808469`, under `Documents/Codex/2026-10-30/firewood-native-rehearsal/target-6186e960daa2/cluster`. The base database was `fw_office_native_6186e960daa2`; guard behavior ran only in its separately supplied `_guard` clone. The database comments carried the exact synthetic rehearsal marker. The verifier checked database, system identifier, data directory and marker before reading business metadata.

Actual readback confirmed an empty `listen_addresses`, a Unix-socket connection, private socket/data directories with mode `0700`, SCRAM authentication for local/loopback HBA entries, and no preloaded transport libraries. No TCP listener, application API, email sender or provider client was started. Nonoperator roles remained `NOLOGIN`. The native binary bundle was copied from the retained QA tools; this work did not start another home-Mac database or alter the scanner.

Auth/Storage bootstrap was schema-only from the retained synthetic environment. Business schemas were rebuilt from the exact immutable 102 history, followed only by the reviewed terms prerequisite, narrow receipt backport and live/office review SQL. No production rows or main-branch migration chain were imported. The baseline had zero invoices, customers and Auth users.

Eight verifier identity-negative checks also passed: invalid target naming, wrong database, system identifier, directory, marker, major version, public listener and remote connection all stopped before business metadata reads. A rehearsal harness correction changed database-comment lookup to PostgreSQL's shared-object catalog; it did not change application behavior.

## Actual catalog result

| Check | Native result |
| --- | --- |
| Catalog-scoped functions | 301 before; 339 after |
| Business tables | 138 before; 147 after |
| Original function changes | Only the exact reviewed `claim_outbound_delivery(uuid)` receipt-matching clause |
| Original security boundaries | Owners, effective ACLs, RLS, policies, role flags, memberships/delegation, default privileges, role settings, views, sequences and existing event triggers preserved |
| Original table additions | Two terms columns, two terms constraints, two terms-preservation triggers and the four reviewed live financial/collection triggers |
| New private live tables | Exactly nine; RLS enabled, no policies or direct API-role privileges, owner-only ACLs |
| New public live RPCs | Exactly 18: nine authenticated office commands and nine service-only commands; anonymous execution denied |
| New function bodies | All 37 live functions match the two review SQL sources, including security mode, volatility and complete settings |
| Terms prerequisite | Exact retained helper body, invoker mode, private execution and only the reviewed legacy/live terms families |
| Source activation | No source row; all four flag columns install `false` by default |

The receipt permit was derived from the retained source and the actual baseline, rather than approving the postimage by its own hash. Its source SHA-256 is `f0009ec4c0c51b7e14cf8ec51554d8bec2dc42bb22c896f1cc18e39afba73327`. The immutable 102 SQL remains `f4862e3c84cf0584ee5198d1079db985c49a7fe7543466e12c314a4e492ed78f`.

The comparison rejects undeclared new objects, removed/changed original objects and unexpected additions on existing tables. It preserves sequence metadata as text to avoid integer precision loss. It reads metadata and source flags, not customer/contact/payment payloads. The reusable checker is `scripts/verification/firewood-native-readback.mjs`.

## Actual write-fence rehearsal

The base installation deliberately had no hosting admission. A separate clone installed the **retained** `primary-write-fence.mjs` transformation, without rewriting its core checks. Source SQL SHA-256 remained `df3d2b2b81ff9a3a3f6049bf2f8bacc9dd7ce4b9804ddab7652f309c48f534e6`; transformed SQL remained `ed79c2f167e46b51c08f49363720c23be78fc8ce2640e77eb3e0a807f240fea1`.

**30 native checks passed**, including:

- All nine new tables had the exact 27 enabled admission, initially deferred commit and statement-level truncate triggers, bound to the expected guard functions.
- Unadmitted inserts and nonoperator truncates were rejected on every new table. The probe used `SESSION_USER=authenticator` inside definer execution; merely setting a role in an operator session would not test this boundary.
- A valid synthetic lease admitted a write and commit. Wrong holder, changed postmaster identity, future issuance, expiry, stale five-minute capture and unverified topology each denied writes.
- A transaction admitted while fresh failed at its deferred commit after freshness was revoked; its row change rolled back.
- An actual schema change invalidated topology. Existing writes remained blocked until reenrollment; the new test table received all three guards.
- The nonoperator could neither issue a lease nor inspect guard state directly. All seven installed guard function bodies/settings and private privileges matched the retained source.

An initial test deliberately changed the holder; its attempted same-epoch renewal correctly failed. The harness was corrected to advance only the clone's synthetic epoch. Strict final catalog comparison also required explicit allowance for PostgreSQL's `ats_hosting_commit` constraint rows, in addition to their triggers. Neither correction weakened the retained fence. The failed attempt evidence was preserved.

Final guard readback passed with the temporary probes removed, zero source rows, original permissions/financial functions preserved, and the synthetic holder/lease cleared. This proves the local fence behavior and new-table enrollment. **It does not prove off-device paired backup freshness or issue any recovery/admission certificate.**

## Preserved boundaries and remaining blockers

Both `getLiveHandoffDependencies()` and `getFirewoodOfficeRuntime()` still return `null`. No environment toggle, source ID or old sandbox certificate grants this package live authority. The frozen earlier release capsule remains SHA-256 `a7a6a9f933af08d8842d45c57b75803fe8e4c26f4bc5444a68f6e7107fe6d1e2`; it was not repacked to include office changes.

The independent native billing checks found that the current candidate creates a sent Firewood invoice without `sent_at`. The retained 102 payment-state trigger can then return a fully refunded or returned invoice to draft, excluding its positive debt from ordinary receivables. Preserving the ledger and cancellation hold does not make that reporting outcome acceptable. There is also no existing credit-note/debt-release command for historical positive balances. Keep those cases in billing review; do not manufacture payments, fake delivery or bypass the original void guards. The detailed financial and concurrent-session results belong to their separate rehearsal reports.

Before any release, resolve the invoice/reporting and deliberate billing-closure design; reverify the corrected candidate; perform actual private source/route/credential readback; and enroll the actual new topology in independently verified paired recovery with a fresh five-minute certificate. Native synthetic checks do not replace those steps.

Private evidence is retained in the owned target directory: `NATIVE_SECURITY_ISOLATION.json`, `READBACK_PROOF.json`, `postimage-catalog.private.json`, `GUARD_PROOF.json`, the guard harness and its preserved attempt evidence. Root's lifecycle proof records final shutdown of this owned cluster; this review does not authorize stopping or modifying any prior QA, production or scanner service.
