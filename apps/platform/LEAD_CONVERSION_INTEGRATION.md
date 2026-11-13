# Lead capture validation and follow-up diagnostics

Selecting Email without an email address is already rejected by the public browser form. The server parser now enforces the same requirement, including requests that bypass browser validation. Phone/text/no-preference requests may still omit email. Existing origin checks, spam handling, duplicate receipts, office notices and public acknowledgements are unchanged.

The pure follow-up policy is prepared for the existing office queue. It is deliberately not attached to a production read or write path by this change. It highlights urgency, inactive/missing owners, overdue actions, expired proposal/link metadata and unresolved terms. Unknown lifecycle values and invalid/future completion timestamps require review. It performs no I/O and cannot send, book work, create tasks or change payments.

## Validation

From the repository root, using the approved CRM runtime and existing lockfile installation:

```sh
node --test apps/platform/src/lib/leads/lead-follow-up-policy.test.mjs apps/platform/src/lib/leads/lead-contact-preference.test.mjs
npm --prefix apps/platform run test:unit
npm --prefix apps/platform run typecheck
npm --prefix apps/platform run build
```

The unit runner discovers both new .test.mjs files automatically. The 61 policy cases passed in isolated V8 before this source integration; actual Node, parser and application results must be recorded from CI rather than inferred from that run. The 10 parser cases transpile the actual intake.ts, use synthetic fields, reject unexpected imports and replace persistence with a throwing stub. They cannot access a database or call a provider.

CI's existing CRM regression workflow checks supported Node 22/24 runtime floors, unit tests, framework/runtime guards, generated schema consistency, typecheck/build, public-site checks and monitor classifiers. It uses no production environment or provider credentials. No CI workflow, dependency or lockfile changes are included here.

## Existing queue integration

Use the existing staff authorization, queue filters, pagination and active-task state. Do not create another task system or infer eligibility from HTTP 201: the existing route intentionally acknowledges some blocked/spam outcomes without creating jobs.

| Policy input | Confirmed committed source | Adapter rule |
| --- | --- | --- |
| id | jobs.id / office_follow_up_queue.job_id | Keep queue task id separately for task commands; reject mismatched relationships. |
| eligible | Existing authorized current job/task reads | Exclude archived/disallowed jobs, completed/cancelled tasks, blocked/spam and unavailable records. Never add a service-role read to bypass existing scope. |
| ownerId / needsOwner | assigned_to_user_id / needs_owner | Use the active-owner check even when the assignee ID is non-null. Unknown ownership state needs review. |
| nextActionAt | queue.next_action_at | Generated as coalesce(snoozed_until,due_at); do not recompute from due_at or write this generated field. |
| stage | jobs.status plus current source quote and schedule context | new_lead maps to new. An accepted/scheduled job with approved quote and no qualifying job schedule maps to quote_approved. A current qualifying job schedule maps to work_scheduled. Confirm every other lifecycle value; task open/waiting is not a job stage. |
| scheduledAt | Current qualifying job schedule event or appointment | Reuse existing scheduling predicates. An estimate visit or stale date does not establish booked work. |
| quoteValidUntil | Current quotes.expires_at | Do not revoke an already approved agreement because its proposal deadline has passed. Flag unresolved terms separately. |
| portalExpiresAt | Existing authorized get_quote_link_state result | Use safe state metadata; never include raw bearer links, hashes, encrypted values or token hints in diagnostics/logs. |
| noticeState | Current jobs notification status/outcome and saved delivery state | Explicitly map uncertain/failed states. One delivered recipient is not proof of batch completion. Never resend from diagnostics. |
| hazardPresent | Trusted urgent job context | Intake assigns urgent priority for hazard/emergency requests. Highlight conservatively; priority does not prove a particular hazard. |
| firstContactAt / hazardReviewedAt | Existing verified domain event if available | No direct jobs columns were established. Do not invent fields or equate office-notice delivery with customer contact. Future completion dates require review. |
| quoteTermsNeedReview | Current revision and existing office review state | Contradictory scope or terms require review before recommending scheduling. |

Attach optional diagnostics to existing staff rows behind a disabled feature flag after mapping acceptance. Preserve snooze deadlines and existing queue ordering. Rendering must remain read-only. Use update_office_handoff with task id and exact p_expected_updated_at for authorized edits. SQLSTATE 40001 requires refresh and operator reconciliation, not blind replay.

The committed owned-scheduling-handoffs migration already provides active-owner views, optimistic updates, scheduling-task deduplication and approved_work_handoff_gaps/ensure_scheduling_handoff repair. The expired-proposal-followups migration already rechecks eligibility at admission and after the delivery lock wait. Preserve both; this change needs no migration.

## Connected acceptance before release

Use the established disposable harness in tests/README.md, with customer delivery disabled and no production credentials.

- Submit Email preference with missing/valid email through the real route; missing email must fail before persistence.
- Lose a successful response and retry the identical submission ID concurrently; verify one logical receipt/job and no repeated office notice.
- Preserve edits made during an uncertain send according to the website owner's existing snapshot/retry behavior.
- Simulate provider acceptance with a lost response; saved lead remains, uncertain delivery goes through existing reconciliation.
- Deactivate a synthetic task owner; needs_owner must flag it. A stale ownership/snooze save must conflict without overwriting.
- Give an overdue due_at a future snoozed_until; next_action_at must honor the snooze.
- Combine urgent context with an unmapped stage, invalid date or future review timestamp; urgency must survive and require human review.
- Reconcile an approved quote repeatedly; reuse the established scheduling task and resolve it only on a qualifying job booking.
- Exercise distinct proposal/link expiry and unresolved approved scope, unauthorized access, consent rejection and existing payment regressions.

A source contract does not prove the corresponding definitions are installed in production. Existing CRM owners must reconcile the current branch and deployed schema. Keep their uptime/backup, receipt, runtime, scanner and payment work separate from this source change. The website owner retains timeout recovery, accessibility, draft behavior and release testing; do not overwrite newer website source from main.

## Release and rollback

Reconcile with the existing CRM branch, run CI and connected acceptance, and record the exact source/build plus current backup/health evidence under the existing release process. Enable only the optional diagnostics after acceptance. A regression is handled by disabling their feature flag or reverting the isolated parser code. Preserve every accepted lead, receipt, task, notification, consent record and audit event. No production deployment, migration, task creation, customer message or payment operation is part of this PR.
