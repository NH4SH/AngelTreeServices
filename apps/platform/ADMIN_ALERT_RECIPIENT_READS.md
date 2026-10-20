# Complete, bounded customer-activity alert reads

October 20, 2026. Staging reconciliation `a7a8543` is pushed to main and its
preserved branch with deployment skipped. This bounded PR14 follow-up is local
on `codex/admin-alert-recipient-reads`. Separate website-only main update `c247604`
was fast-forwarded during verification; its CRM and Supabase trees are identical
to `a7a8543`, so the tested CRM code is unchanged. This package fixes a
reproduced alert interruption without a migration, new service or scanner.

## Failure and change

The previous customer-activity alert path loaded role memberships without paging,
then placed every account ID in one profile filter. A read-only local reproduction
found861 matching memberships and a **33,675-character profile request returning
HTTP414**. The failure was treated as an empty recipient set, so no alert followed.
The same path could also stop at the API representation cap for memberships,
preferences or the notification INSERT response.

The new `notifications/recipient-reads.ts` helpers:

- Read each owner/admin role's memberships in200-row pages, advancing by the
  unique user ID within that role. This avoids offset shifts and row-cap truncation.
- Deduplicate accounts and read profiles/preferences in100-ID batches. The existing
  owner/admin plus active-profile eligibility, preference defaults and opt-outs
  remain unchanged. Inactive profiles remain excluded.
- Keep notification creation as **one atomic INSERT**, then page its rows by ID.
  Before any email is invoked, the returned notification IDs and recipient set
  must match the full intended set exactly. A partial/duplicate/error result
  cannot authorize a partial recipient send.
- Report failed lookups through the existing sanitized review log instead of
  silently converting database errors into an empty set.

Activity recording, unique activity/recipient constraints, three-at-a-time send
fan-out, stable `admin-activity:<notification ID>` provider identities, per-recipient
status acknowledgements and primary-workflow nonblocking behavior are preserved.
A repeated activity still returns without creating or resending old notices.
No notification, financial, employee, RLS, grant or transaction rule changed.

## Verification

- **833 regular CRM regression results pass**, no failures/skips. Nine new cases
  model the API's1,000-row representation cap: a1,250-account directory with
  overlapping roles and20 disabled profiles yields1,230 unique notices, honors
  the late opt-out, and performs1,229 simulated sends with peak concurrency3.
  Late membership/profile/preference/notice-read failures, incomplete/duplicate
  acknowledgements, replay, missing-data and empty/other-category cases pass.
- **Four real local integration scenarios pass**, five results including parent.
  The retained directory returns all114 eligible profiles, matching an independent
  SQL reference; the longest successful lookup is **3,996 characters**. The latest
  run scans862 memberships because an earlier trial actor is retained but disabled.
  No list is truncated to obtain the smaller request size.
- For one owned synthetic account, actual notification INSERT/readback/status
  writes and own-user RLS reads work. Anonymous notice reads remain denied. An
  actual preference opt-out retains the in-app notice and records skipped email.
  A simulated readback503 after a real INSERT retains the pending notice, invokes
  no sender and exposes no injected diagnostic.
- Typecheck and optimized Next build pass with Node22 in a separate current-source
  copy containing synthetic configuration only: no copied env, real credentials
  or Netlify link. The initial typecheck caught a removed type-only import still
  used by the status helper; that import was restored before the successful checks.
- Offline schema fingerprints pass. No migration or generated DB-contract change
  was needed. All original row fingerprints across110 public tables, schema,
  constraints, RLS policies, native local ledger, bucket and scan settings match.

The live directory comparison uses actual SDK/Data API reads. Notification writes
are scoped to an owned synthetic account so original users receive no test notice.
The activity boundary supplies a synthetic saved event, and the email callback is
stubbed. All HTTP destinations in the suite are restricted to the exact local API.
The two trial actors are disabled/separated with zero remaining Auth sessions.
Their synthetic notices/history remain. No real email, provider, dispatcher,
production or hosted-database operation was invoked for this fix.

## Scope and next step

This resolves recipient/read completeness, not the separate crash boundary
between recording an activity and preparing its notifications. An already-recorded
activity with missing notification intent is still a PR14 recovery item. This pass
does not backfill history, enable an automatic retry worker, rotate identities or
resend old/uncertain mail. It does not change account/preference transition policy
during an in-flight send. Local callbacks do not prove provider/inbox delivery.

Review and push this bounded fix next. Continue the existing PR14 atomic notice
preparation/recovery work separately, alongside protected-staging runtime/access/
CDN acceptance. Scanner/restore/operator gates remain parked. Staging remains at
its reviewed94 migrations; no readiness or deployment flag changed. Read-only
Netlify metadata still identifies ready production CSS-only deploy
`6ad6ecfc6c03786554247e4a`.

Safe results: `staging/ADMIN_ALERT_RECIPIENT_VERIFICATION.json`.
Private reproduction, test and build evidence:
`/Users/noelsierra/Documents/Codex/2026-10-20/admin-alert-recipients/`.
SDK references: [bounded reads](https://supabase.com/docs/reference/javascript/limit),
[cursor filters](https://supabase.com/docs/reference/javascript/gt).
