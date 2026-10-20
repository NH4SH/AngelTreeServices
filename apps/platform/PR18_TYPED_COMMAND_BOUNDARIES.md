# PR18 incremental command contracts — October 20, 2026

The verified runtime/access package `6accd4e` is pushed to main and its preserved
branch. This follow-up is local on `codex/pr18-typed-command-boundaries`, based on
main `f07af57`. That incoming website update is preserved; its committed
`apps/platform` tree exactly matches the base used for the isolated CRM build.

## Decision and scope

Continue the existing audit's incremental generated-schema adoption. Recent
change-order, invoice preference and notification recovery commands were still
accepting unchecked request objects. A misspelled argument or omitted request ID
could therefore reach the database before being noticed. This pass makes the
compiler check these boundaries without changing their execution.

* `callDeliveryCommand` now pairs a generated function name with that function's
  request arguments using `NoInfer`. This covers 25 existing call sites and 21
  distinct functions, including claims, preparation, acknowledgement, provider
  evidence, office alerts and supervised source-event recovery.
* Both change-order approval paths, the portal change-order response and invoice
  payment preference use `satisfies` against generated request contracts.
* Source snapshots use the generated JSON type; the existing activity redactor's
  return annotation describes its JSON-shaped output. No conversions were added.
* Six named command overrides admit only the specific SQL-reviewed nullable
  parameters. Optional defaults stay optional and required keys stay required.
  The generated file, migration fingerprints and dependencies are unchanged.

This is the existing PR18 schema-contract task, not a replacement roadmap or a
new business feature. All source changes are erased during TypeScript compilation.

## SQL nullability review

Generated argument types do not describe SQL parameter nullability. The following
narrow overrides preserve existing valid callers instead of adding blanket casts.

| Command | Nullable parameters | Existing SQL source |
| --- | --- | --- |
| `approve_change_order` | Contact ID, recorded-by user ID, approval notes | `20261016040341_atomic_invoice_generation.sql` |
| `finish_outbound_delivery` | Provider message ID | `20261016165057_durable_outbound_delivery.sql` |
| `list_outbound_deliveries` | Delivery filter ID | Same delivery migration |
| `record_outbound_provider_event` | Delivery ID, explicitly supplied even when null | Same delivery migration |
| `prepare_customer_activity` | Destination | `20261020060328_atomic_customer_activity_notifications.sql` |
| `prepare_customer_source_event` | Destination, review ID | `20261020064543_durable_customer_source_events.sql` |

For example, an uncertain transport outcome has no provider ID; a provider event
can arrive without a matching delivery tag. These type allowances do not authorize
an accepted send without provider evidence. SQL continues to validate combinations.

## Verification

| Check | Result |
| --- | --- |
| Existing local regression suite | 862 passed; zero failed/skipped |
| New compile-only assertions | 23 rejected invalid examples; valid/default/null cases compile |
| Compiler sensitivity probe | Restoring the old permissive helper in an unlinked copy fails with unused rejection assertions; final file restored and compiler passes |
| Node 22 isolated typecheck | Passed, including final assertion file |
| Optimized Next build | Passed with synthetic-only settings in an unlinked export; no original development build disturbed |
| Generated schema integrity | Current 96-migration and generated-file fingerprints match |
| Emitted JavaScript | All six modified source files identical before/after in ESNext and CommonJS output, 12 comparisons |
| Shared disposable database | All 110 public row sets exactly match; ledger, functions, constraints, policies, buckets and scan switches unchanged |
| Existing local server | Anonymous admin request redirects to login; login remains available |
| Git alignment | Previous package pushed; incoming website-only main update preserved |

The build used the final runtime source edits; the final compile-only test additions
were copied into that same isolated export and rechecked after its build. The
compiler sensitivity probe touched only the export. No database write, hosted database
query, provider send, migration, credential/configuration change or deployment ran.

## Preserved behavior and limits

All server authorization, portal capability/origin/rate checks, receipt validation,
transaction locks, retry/idempotency behavior, timeouts, uncertain outcomes and
private-file access remain as implemented. Employee UI and all prior CRM work are
preserved. No UI or financial behavior changed.

Generated contracts check request structure and primitive types. They do not prove
UUID/timestamp validity, permitted string values, role permissions, payload
semantics or database outcomes. SDK/JSON receipts remain runtime-validated; this
is not a wholesale typed-client rewrite. An `any` originating in legacy code can
still bypass static checking. Existing local security/concurrency tests remain
necessary, and this pass does not establish hosted runtime/CDN acceptance.

The scanner server, paired file/database recovery, operator and hosted staging
acceptance gates remain open. No readiness flag was promoted and no production
release is implied. Continue incremental adoption when modifying remaining legacy
commands; do not replace runtime guards with generated types.

Private logs, compiler probe, runtime comparison and preservation receipts are in
`/Users/noelsierra/Documents/Codex/2026-10-20/typed-command-boundaries/`.
