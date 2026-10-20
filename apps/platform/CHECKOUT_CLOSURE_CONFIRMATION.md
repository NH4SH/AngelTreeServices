# Invoice checkout closure confirmation

October 20, 2026 · existing PR03/PR07 follow-up · local verification only

## Decision

Continue invoice collection safety independently of the scanner. The verified
webhook package `1041a17` was pushed to main and its preserved feature branch.
This package starts from that work and also preserves incoming website-only main
`377c935`, whose CRM and migration trees are identical to the tested base.

Controlled before/after tests reproduced three caller problems: an empty or
wrong-row update response could report a checkout closed; a string `already_void`
value (including `"false"`) could report invoice success; and incomplete lookup or
lease receipts could permit downstream work. The first 51 focused cases passed
17 and failed 34 against the old implementation; all now pass, with eight added
confirmation cases included in the final gate. These tests inject malformed
responses; no production incident, financial loss or SQL/RLS bypass is asserted.

## Changes

- A shared checkout guard requires the fields needed to establish provider,
  submission, channel, amount and state. Missing nullable fields are unconfirmed,
  rather than evidence that an attempt has no remote payment. Unsupported or
  malformed legacy rows require review instead of automatic closure.
- Voiding validates the entire checkout list, invoice bindings and distinct row
  identities before any provider request. Review requires the selected invoice
  and attempt to match the returned row.
- A reference binding or closure update must acknowledge the exact selected
  checkout row and explicitly have no error. Empty objects, arrays, wrong IDs,
  missing error status and absent rows do not authorize progress. This shared
  closer also serves existing ACH/card replacement callers; it returns failure
  instead of allowing them to proceed after unconfirmed closure.
- Begin-void accepts the SQL's boolean already-void receipt or its explicit
  false marker and UUID lease. Review requires its own UUID lease shape. Live
  lease checks and finalization require explicit boolean success with no error.
- Uncertain cleanup is logged safely and cannot undo confirmed invoice success.
  `release_invoice_void` returns SQL void, so no invented boolean payload is
  required. The existing expiry remains its recovery safety net.

There is no new automatic payment, resend, request key, transaction or repair
queue. If remote expiry or a database write occurred but its acknowledgement was
lost, the result stays unconfirmed. Existing review/retry rechecks current state;
it does not assume the earlier side effect failed or reverse recorded money.

## Verification

| Check | Result |
| --- | --- |
| Regular regression gate | 1,094 passed, zero failed/skipped: previous 1,035 plus 59 new cases |
| Focused confirmation cases | 59, included above |
| Installed PostgreSQL flow suite | Nine scenarios, ten TAP results |
| Node22 typecheck and optimized build | Passed in a fresh unlinked export using synthetic settings |
| Schema/generated integrity | Current 96-migration fingerprints match; no migration |
| Shared local preservation | All 110 public row sets, ledger, functions, constraints, policies, private buckets and scan switches unchanged |
| Existing local app | Login available, HTTP200 after normal redirect |

The opt-in SQL suite runs the actual application helpers interleaved with
installed database commands through a persistent local PostgreSQL connection.
Authenticated-role RPCs and service-role checkout reads/updates use the installed
permissions and triggers. SQL errors are captured in a temporary invoker helper,
which does not change application functions or grants. Provider responses are
synthetic; there are zero real provider requests or external emails.

Owner ACH void, admin unsubmitted-card closure, interrupted-ACH binding/review,
and repeated already-void receipts work. A closure response lost *after the SQL
update* leaves the invoice sent, then re-verification closes it safely. A final
response lost *after SQL finalization* returns uncertainty, then recovers as
already void with exactly one void audit event and no additional remote expiry.
Crew, disabled-owner and separated-owner SQL denials prevent privileged context;
an expired lease stops provider access. Review retains its audit event and leaves
the invoice unchanged. No payment is created or balance altered in these cases.

Every synthetic Auth/profile/role/employee/customer/invoice/checkout/lease/audit
write rolls back. This is **one outer rollback with per-scenario savepoints**,
not independently committed recovery, actual network loss, HTTP/PostgREST/Auth,
multi-connection concurrency or live Stripe verification. Those existing suites
and hosted acceptance gates remain separate.

## Files and preservation

Runtime edits: `src/lib/payments/checkout-closure.ts` and
`src/lib/payments/invoice-void.ts`. New focused and opt-in integration tests,
canonical lease fixtures in the two existing invoice-void test files, and test
instructions accompany this report. The existing audit roadmap is appended with
this bounded PR03/PR07 decision.

No SQL, RLS/grants, transaction/lock order, lease duration, retry budget, pricing,
payment totals, idempotency rules, webhook flow, offboarding, employee UI,
dependency, configuration or credential changed. Existing website work is
preserved. No hosted query or write, deployment or production action occurred.
The new package is committed locally pending a later push request; the prior
webhook package is already on main. Scanner, paired restore/operator and real
hosted staging gates remain open; this work does not authorize a release.

Private evidence:
`/Users/noelsierra/Documents/Codex/2026-10-20/checkout-closure-confirmation/`.

Current SDK conventions were checked against the
[Supabase RPC documentation](https://supabase.com/docs/reference/javascript/rpc)
and [changelog](https://supabase.com/changelog); installed SQL defines the receipt
shapes used here. No SDK feature or package upgrade is introduced.
