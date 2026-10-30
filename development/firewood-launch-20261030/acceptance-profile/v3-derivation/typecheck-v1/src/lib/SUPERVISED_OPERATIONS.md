# Supervised recurring and Calendar operations (PR16)

`/admin/recurring/operations` extends the existing recurring, follow-up and
Calendar outbox systems. It does not install a scheduler, enable automatic
generation, create a quote/work order, approve a price, or send a customer message.
Existing production service projects, credentials, encryption keys and feature
flags must be retained. PR numbers name roadmap packages, not GitHub PR IDs.

## Reviewed renewal generation

Office roles read `recurring_generation_preview` with their verified session and
underlying RLS. The security-invoker view is SELECT-only. Active, unarchived
parties/properties and active plan locations within the existing business-day
planning window are eligible. Existing cycles are excluded before the exact count
and 25-row pagination; an excessive offset is clamped with a fresh count. Reading
the page creates nothing. Failures are not presented as an empty queue.

One to 25 checked rows and an explicit confirmation call
`approve_recurring_generation`. The version includes the complete plan/location
snapshots, party/property/settings updates and business date. Settings, plans,
locations and parties/properties are locked in deterministic order; effective
office authorization is checked again after waits. All versions must still match
before any work is created. Price/scope edits, pause/archive and midnight changes
therefore require refreshing the preview.

The original generator is reused through a selected-location overload. It keeps
the existing occurrence key, `review_needed` status, pricing review requirements,
business timezone, task and mandatory audit behavior. Existing occurrences are
counted without locking them while holding a location lock; legacy cycle closing
locks occurrence before location. The one-argument invoker RPC remains compatible
with existing callers and still honors the automatic-generation flag for worker
calls. The supervised UI replaces the old unselected bulk-generation button.

A private receipt binds the request UUID to the actor and normalized selection.
Same-request replay returns the committed result; changed content or actor is
rejected. Receipt, opportunities, review tasks and required batch history commit
or roll back together. The client requires the exact positive acknowledgment,
retains the UUID on an uncertain response, and generates a new one only after
confirmed success. The last ten successful approvals show counts/time only.
There is no pretend worker heartbeat, scheduled next-run time or failed-run
journal: failed transactions leave no partial receipt. Interrupted saves require
checking existing opportunities before trying a changed selection.

## Cycle-close compatibility repair

The existing invoker close command could not call its intentionally private date
helper as an ordinary staff session. The additive migration moves that original
implementation into `app_private`, denies all direct client/service execution,
and exposes a narrow office-only definer wrapper. It rechecks live access after
occurrence/location waits; date helper access remains private. Closing ordinary
renewal follow-ups and the existing cadence calculations are preserved. Automatic
`approved-work-schedule:` task history is excluded so a forged recurring link
cannot bypass PR15 scheduling guards. No financial or scheduling command is
rewritten by this repair.

## Calendar supervision and worker boundaries

Only owner/admin can read aggregate queue counts and the oldest 25 retry/exhausted
items or request a retry. Safe labels identify the employee or schedule entry;
provider account emails, calendar IDs, payloads, tokens and encrypted credentials
are not returned. Last attempt/success comes from actual connection timestamps.
Configuration readiness is boolean-only and is **not proof of a running worker**.
Missing local provider setup is expected until a separate approved rollout.

A retry requires a reason, confirmation, exact revision and `updated_at`. It locks
the row, rechecks live access, requires a usable active account, and refuses
processing, reconnect-required or stale work. It preserves source, attempt count
and prior failure context; it increments revision, clears the lease and queues
one pending retry with required audit in the same transaction. The action makes
no Google request, changes no CRM booking and sends no email. Existing reconnect
and delivery-reconciliation screens remain authoritative for their own problems.

The existing Calendar worker additionally verifies the target's effective CRM
access and allowed role before token refresh/provider work. Its service-only
boolean RPC exposes no account details. Intentional disabled-account disconnect
cleanup retains its explicit existing path. Worker configuration must include
the existing OAuth/encryption/canonical URL values and an isolated, at least
32-character `GOOGLE_CALENDAR_WORKER_SECRET`, different from communication and
health-monitor secrets. Values are never serialized to the operations UI.

Completion and failure acknowledgments now match the outbox key, revision,
`processing` state and exact `locked_at` lease. A reclaimed same-revision task
cannot be finished or failed by its old claimant. Existing deterministic Google
event IDs, source rescheduling/cancellation, backoff and failure budget remain.
The worker summary counts completion only when the current lease acknowledges.
This is not a distributed exactly-once guarantee: live Google behavior and
production worker cadence need separate approved verification. Local recovery
tests use the actual service/repository with a controlled provider gateway.

## Schema and rollout contract

Additive migration: `supabase/migrations/20261016192144_supervised_operations.sql`.
It follows the existing 84 migrations. Public/Storage RLS policies are unchanged.
Public approval/history/retry/close commands require authenticated office/admin
access; anonymous and service execution are denied. The Calendar account check is
service-only. Private receipts/helpers deny direct access. Definer functions pin
an empty search path; the generator/view retain invoker semantics.

A future approved rollout must apply this migration before this app version,
verify grants and retained encryption keys, and review current production state.
Do not reset the database or enable generators/workers to compensate for a schema
mismatch. Do not replay a historical backlog. Activate and verify each automation
separately. This implementation adds no environment variable names or dependencies
and performs no hosted migration, provider operation or deployment.

See `tests/README.md` for loopback-only verification. The public website changes
already on `main` are preserved and validated independently of this CRM package.
