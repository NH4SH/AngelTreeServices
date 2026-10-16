# PR03 invoice financial write boundary

This continues the guarded invoice-void slice. The invoice financial boundary is
implemented locally; it does not declare all quote/payment/communication roadmap
work complete. No production migration, deployment, or provider operation is part
of this implementation.

## Commands and authority

| Operation | Authority and writable inputs | Database responsibility |
| --- | --- | --- |
| `create_invoice_draft` | Active owner/admin/estimator/payroll staff; whitelisted billing/source header and lines | Validate party/source/location/contact links, line arithmetic, create header + lines + creation audit together. Always draft, no payment history, computed subtotal/tax/total/balance. Caller IDs/status/balance/timestamps/provenance cannot override these. |
| `generate_job_invoice` | Same active internal staff; stable UUID and one job/approved quote, or whitelisted custom job invoice details | PR04: locked source lookup, complete draft + approved additions/tax/fees + completion + audit + durable result in one transaction. Existing/void invoices and repeated commands return the retained invoice. See [atomic generation](../invoices/ATOMIC_GENERATION.md). |
| `save_invoice_details` | Same active internal staff; invoice, expected `updated_at`, due date, complete lines | Parent lock, stale-version rejection, paid/void/checkout/pending-payment fences, owned unique line IDs, arithmetic, net-payment minimum. Replace lines + update derived header + structured audit in one transaction. Existing retained material/change-order references survive. |
| `reconcile_invoice_balance` | Active internal staff, or a server `service_role` request without a user sub | Parent lock + current successful net principal + balance/status/paid time in one transaction. No caller supplies amounts or state. |
| `record_invoice_delivery` | Active internal staff for email delivery; owner/admin for explicit manual marking | Lock non-void parent, set delivery time, derive payment state and audit atomically. Unsent partial prepayments remain draft until delivery; fully paid invoices stay paid. |
| Manual payment/correction/restore | Existing owner/admin commands | Existing live-access authorization, parent locks, ledger and audit retained. |
| Void/review/restore | Existing guarded owner/admin commands | Existing owned checkout attestations, leases, money-history fences and audit retained. See `INVOICE_VOID_SAFETY.md`. |

All public authenticated financial commands use the existing PR02 effective-access
predicates. Private helpers have no API execution grants. Definer functions have
an empty search path and narrow grants. Existing RLS read/account restrictions
remain installed. No general service-role replacement for staff commands exists.

After enforcement, staff cannot INSERT invoice headers or directly UPDATE
financial/source/delivery fields, or INSERT/UPDATE/DELETE lines through PostgREST.
The existing metadata paths retain only column UPDATE grants for automatic
reminders and archive metadata, with existing RLS. SELECT access is unchanged.
Permanent deletion retains the owner/admin draft path; delivered invoices and
payment/checkout/document/active-lease history cannot be removed. Payment foreign
keys already prevented deletion even for failed payment rows; the guard now
explains preservation instead of relying on that foreign-key error.

Server invoice creation, job/quote generation, duplication, editing, manual sent,
email delivery, and shared payment reconciliation now use these commands.
`attach_approved_change_orders_to_invoice` retains its live staff check, draft
parent lock and source idempotency. Its balance now deducts existing net payments;
adding scope cannot erase a draft's prepayment. It also refuses an active checkout
or pending payment.

## Preserved policies and interaction details

- Existing roles are retained; no new commercial permission model is introduced.
- Existing invoice editing sets tax to zero. This behavior is preserved. Draft
  creation/duplication/source generation retain their tax input and compute totals.
- Quantities must fit the existing positive two-decimal column; cents and line
  totals must agree with rounded quantity × price. Zero-price lines remain valid.
  Invalid legacy source amounts require review rather than silently copying a
  contradictory invoice. No stored historical row is rewritten by the migration.
- The form freezes its originally loaded version until its own successful save;
  a background data refresh cannot silently authorize a stale form. Successful
  saves return new line IDs/version for repeated edits without reloading.
- Billing controls are disabled while saving. Errors retain the user's form.
  Conflict errors request a reload; there is no automatic overwrite/retry.
- Invoice update history retains structured before/after totals/due date, actor,
  category, record label, destination and organization, now in the same transaction.

Net principal is successful invoice principal minus refunded principal and lost
principal disputes, clamped at zero per payment. Surcharges and failed/pending
payments never satisfy principal. Balances are nonnegative; edits cannot lower a
bill below its actual net successful payments. Parent locking matches existing
payment/checkout write fences. This does not make webhook payment writes and all
side effects one transaction; PR06/PR07 remain necessary.

The delivery command is an authorized metadata operation, not a cryptographic
attestation that a provider accepted an email. The existing server email flow
calls it only after success. Durable provider acceptance/recovery and customer
communication fencing remain PR10/PR14; no automated sender is activated here.

## Staged rollout — later approval required

1. Install command migration `20261016010829_invoice_financial_write_boundary.sql`
   after the guarded void baseline. This phase retains older table write grants.
2. Release and verify all updated web/worker callers; drain old application
   instances, in-flight financial requests, and any old native/import writer.
   Current native invoice routes are reads; no native invoice writer was found.
3. Apply `20261016012251_enforce_invoice_financial_write_boundary.sql` separately.
   It withdraws old direct writes and installs the history-delete guard.

Do not run an indiscriminate production migration push that applies both phases
before the new callers are live. The local disposable environment intentionally
has both phases installed. Schema iteration did not change local migration
history. Original migrations, dependency locks, CI and employee/offboarding code
are preserved. Future rollback must retain money/audit/checkout history and these
boundaries: use a compatible app version or pause financial writes for repair.

## Existing roadmap

This completes the **invoice** F02 direct-write boundary and brings the required
invoice header/line transaction and conflict portion of PR05 forward. PR05 still
owns quote saves/protected quote states, a broader revision strategy and conflict
comparison UX. PR04 still owns source-job locking, generation request idempotency,
approved-addition inclusion in the same creation transaction and job-completion
semantics. Customer creation/notes/job completion remain outside draft creation.
Do not call those workflows atomic end to end.

Continue with PR06 recoverable webhook receipts, then PR07 authoritative ordered
refund/payment reconciliation. Preserve their higher priority over generation
conveniences. Reminder families/recipient revision/acceptance recovery remain the
independent communications phase. This change does not repair an already
stranded receipt, out-of-order refund snapshot or late payment-status downgrade.

Verification commands and environmental safeguards are in `tests/README.md`.
Database design references: [column privileges](https://supabase.com/docs/guides/database/postgres/column-level-security),
[function security](https://supabase.com/docs/guides/database/functions).
