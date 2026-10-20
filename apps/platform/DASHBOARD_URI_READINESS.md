# Dashboard URI warning: local fix and verification

**Published October 20:** verified dashboard fix `06f768d` is pushed to main and
`codex/dashboard-query-bounds`, with `[skip netlify]`. The dated local verification
below precedes that push. The next local work is in `CUSTOMER_PORTAL_ACCEPTANCE.md`.

October 20, 2026. Based on current main `b2a0b22`, which contains the verified
permissions/private-file package pushed with `[skip netlify]`. The dashboard fix
is local and pending push. No deployment or production write was performed.

## Cause and change

The dashboard calls `getEmployeeDashboardSummary`, which uses `getEmployees`.
The operational directory includes retained former employees. Three enrichment
queries placed every linked account UUID in a single GET filter: user roles,
profile status and time-clock permission. Actual local requests reached 81,138
characters and each failed with HTTP 414. The dashboard displayed the returned
`URI too long` error. This was not a browser address or malformed user input.

`src/lib/data/employees.ts` now deduplicates account IDs and reads each enrichment
in batches of at most 100. Each stream reads its batches sequentially, with the
same three streams running alongside the existing pending-request read. It uses
the original caller's client and RLS. It preserves directory order, every employee,
multiple roles, employment/onboarding separation and existing clock/access
presentation. Empty account lists issue no account queries. A failed batch is
still reported, later batches remain readable, and unknown clock access cannot
be displayed as enabled. No error message was hidden or replaced with success.

No new RPC, migration, privileged client, cache, authorization rule or business
write was added. Command/file access remains independently checked by its existing
live authorization rules. No retained fixtures or history were deleted.

## Verification

- Reproduced all three original HTTP 414 failures against the current real local
  stack before editing the source. Longest URI: **81,138 characters**.
- Seven new live scenarios pass (eight results including the parent). The four
  office roles each retain **all 2,317 visible employees**, matching the direct
  authorized directory RPC in the same order. Account enrichment uses 63 requests,
  none longer than **3,996 characters**, all HTTP 200. The full dashboard employee
  summary also returns without an error.
- Crew, customer and anonymous readers gain no staff directory. A real local
  read with an injected middle transport failure preserves rows and reports the
  failure. The same original estimator JWT loses directory access after the
  existing offboarding command; reactivation restores its role without restoring
  clock permission. All six actors are signed out and disabled afterward.
- Four new unit cases pass using real Supabase URI encoding and controlled
  responses, including a 2,251-row directory, final batches, missing/shared
  account links and each enrichment stream's middle failure.
- **805 normal CRM regression results pass**, with no failures or skips.
  Typecheck and optimized Next build pass in an isolated copy of the current
  application source, with synthetic credentials/configuration only. The running
  review app is preserved. Offline schema contract passes. Public website code
  and deployment configuration were not changed by the dashboard fix.
- Reloaded the user's existing signed-in local dashboard: Dashboard and Employee
  readiness render, with neither `URI too long` nor a Database notice. The session
  and current dashboard tab remain available.
- Fingerprints from before the reproduction through the final live tests confirm
  that **all pre-existing rows in all 110 public tables** remain present, with no
  changed original fingerprints. Migration ledger, application functions,
  policies, constraints, scan settings and bucket configuration remain unchanged.
  This pass does not repeat the earlier role-timestamp exception. The shared
  iterative stack's native migration ledger remains intact; no reset/replay ran.
- Read-only Netlify metadata after the requested main push confirms the existing
  production deploy is still `6ad6ecfc6c03786554247e4a`, state ready. No new build,
  deploy, hosted migration, environment change or production business write was
  requested. Existing scanner/staging/restore release gates remain unchanged.

Private evidence is in
`/Users/noelsierra/Documents/Codex/2026-10-20/dashboard-uri/`.
The tracked safe summary is `staging/DASHBOARD_URI_VERIFICATION.json`.

## Scope and follow-up

This bounds request size without truncating an operational directory. The existing
directory RPC still returns its full authorized projection; total payload/work
will grow with retained employees. A future need for server-side dashboard-only
aggregates can be measured separately. It does not justify discarding employees
or changing permissions in this fix.

Continue the established protected-staging runtime/access/CDN checklist and the
home-Mac scanner/restore/operator preparation. Neither a larger CRM release nor
scanner activation is authorized by this local dashboard repair. Existing
untracked Impeccable files and the production hotfix worktree are untouched.
