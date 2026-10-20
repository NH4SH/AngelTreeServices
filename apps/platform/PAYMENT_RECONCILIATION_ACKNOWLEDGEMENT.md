# Payment reconciliation acknowledgement safety — October 20, 2026

The previous generated-command package `18ff283` is pushed to main and
`codex/pr18-typed-command-boundaries`, deployment skipped. This bounded PR07
follow-up is local on `codex/payment-reconciliation-acknowledgement`, based on that
main. It preserves the earlier roadmap and all prior CRM and website work.

## Concrete issue and fix

`reconcileInvoiceBalance` previously accepted any truthy response with no RPC error.
It converted amounts with `Number(...)` and cast the status. Reproducing the
pre-change code confirms these failures:

| Response | Previous result | Corrected result |
| --- | --- | --- |
| Empty object | Success with non-finite balances and absent status; follow-up planning ran | Unconfirmed; no follow-up planning |
| Null amounts with `paid` status | Success with coerced zero; cancellation/planning ran | Unconfirmed; no follow-up planning |
| String amounts | Coerced to numbers and treated as confirmed | Unconfirmed; actual JSONB receipt requires numeric amounts |

No production occurrence or financial loss is asserted. The issue is a missing
application acknowledgement check, not a defect in the authoritative SQL totals.

The helper now requires an object containing a supported invoice status and
nonnegative safe integer balance/principal amounts. Balance must also fit the SQL
integer column. It does not calculate totals or derive a replacement status.
Numeric strings, nulls, missing fields, unknown statuses and non-finite/fractional/
unsafe amounts are refused. A thrown or error response returns a safe unconfirmed
message without exposing transport/database diagnostics.

Unconfirmed acknowledgements cannot start application follow-ups or retry a
financial write. The message directs staff to refresh and review payment history;
it never promises rollback or tells them the money was not recorded. Existing
correction/restore actions retain their explicit “payment was corrected/restored,
but follow-up processing needs attention” message. Ordinary manual payment entry
still uses its atomic request identity and existing recovery flow unchanged.

## Verification

* All **914** regular regression results pass: existing 862 plus 52 focused results
  covering valid receipts, malformed payloads, transport/SQL failures, replay after
  a lost response, and real correction/restore callers using this helper.
* Eight actual local PostgreSQL scenarios pass (**nine TAP results**). Six cover
  draft, unsent partial prepayment, sent partial payment, fully paid, net refund/
  lost dispute principal and overdue invoices. Actual command receipts match the
  invoice/ledger state read in the same transaction and are accepted by the helper.
  Anonymous callers are denied by EXECUTE grants; authenticated requests without
  staff identity are denied by the live function check. Every fixture/write is
  rolled back, including failed-request transactions closed by connection exit.
* Node22 isolated typecheck and optimized synthetic-only Next build pass. The
  existing local development build/process is preserved.
* Current generated-contract and 96-migration offline fingerprints match; the
  previous 23 compile-only command rejection assertions still typecheck.
* Pre/post preservation passed: all 110 shared-local public row sets, ledger,
  functions, constraints, policies, buckets and scan settings exactly match. The
  existing local login remains available (HTTP 200 after its admin redirect).

The loss-of-acknowledgement case uses controlled transport faults; this is not
proof of a real server committing during a network failure. The PostgreSQL suite
tests installed commands directly through local SQL, rather than PostgREST HTTP.
Existing money/concurrency/RLS regression suites remain necessary. No new hosted
acceptance or production rollout is claimed.

## Scope and preservation

Only `src/lib/payments/reconciliation.ts` changes application behavior. It checks
the existing response before returning success or invoking the existing follow-up
path. No SQL, migration, money calculation, transaction boundary, role rule,
webhook flow, idempotency key, financial request or UI layout changed. Valid
receipts keep the same return values. An absent service client or thrown queue
operation retains the existing confirmed financial result.

New focused and opt-in integration tests and their README instructions are added.
No dependency, configuration, credential, production data or deployment changed.
Scanner/recovery/operator and actual hosted staging gates remain open. This small
PR07 follow-up does not create a competing implementation plan or authorize release.

Private before/after reproduction, test/build logs, local SQL receipts and
preservation evidence:
`/Users/noelsierra/Documents/Codex/2026-10-20/payment-reconciliation-acknowledgement/`.
