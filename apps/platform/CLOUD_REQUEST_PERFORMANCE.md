# Cloud request and partial-load fixes

Initially verified locally and in protected staging on October 26, 2026, before
commit on `codex/cloud-request-performance`. The authorized batch
was subsequently pushed to `main` as `3845305` with CI/Netlify skip markers.
Production was not deployed, reconfigured, or written to.

## Outcome

The principal delay was unnecessary, repeated database work. Ordinary document
lists planned broad cross-record search joins, creation forms loaded lookup data
even while closed, and the dashboard rebuilt its work queues and repeatedly
computed whole reports when changing only the money period. Jobs repeated the
same expensive summary scan five times. Earlier staging logs also recorded
statement cancellations, consistent with the observed incomplete pages.

The final protected staging candidate completed all 18 measured interactions:
six range changes, six list navigations, and six durable synthetic quote saves.
All six list navigations rendered without data warnings.

| Interaction | Before observed | After observed |
| --- | ---: | ---: |
| Dashboard period, complete totals | 4.25 s median (4 samples) | 0.48 s median (6 samples) |
| Quotes list | 4.85 s (1 sample) | 0.80 s median (2 samples) |
| Jobs list | 11.87 s, with a data warning (1 sample) | 0.81 s median, no warnings (2 samples) |
| Invoices list | 6.85 s (1 sample) | 0.82 s median (2 samples) |
| Quote save and confirmed revision | 2.89 s median (3 samples) | 2.82 s median (6 samples) |

These are small Wi-Fi samples from synthetic staging data and protected draft
deployments, not production measurements or capacity guarantees. Before and after
used the same staging database and synthetic owner. The final range samples
ranged from 0.43 to 1.03 seconds. The browser confirmed saved notes after reload;
write transactions and their live authorization were preserved. Save latency is
still a separate performance priority.

## Changes

- Quotes and Invoices load their creation lookup data only when `new=1` opens
  the form. Both creation forms still receive their full existing options.
- Unsearched quote/invoice paging and counts use their base tables under existing
  RLS. Text searches and source-filtered searches retain the existing search view.
- Unsearched Jobs reads use a thin caller-RLS view that retains archive fields and
  existing financial masking. Search continues to use the original search view.
- Jobs' five summary counts now come from one filtered aggregate read. Search,
  date, city, priority, invoice, crew and archive filters preserve their semantics;
  the selected operational view still deliberately does not filter the summaries.
- Dashboard range links update only the money panel through a private, uncached,
  authenticated endpoint. They retain real links, keyboard use, Back/Forward and
  matching Reports links. Superseded requests are aborted and cannot replace a
  newer selection. Loading and errors hide stale financial values and offer retry.
- A bounded dashboard RPC reads the canonical summary once and groups the same
  existing retained-payment source into calendar buckets. It avoids seven extra
  full reports, preserving principal, refund, lost-dispute, timezone and role
  semantics. Estimators receive only their own sales fields.
- Read-only authentication context is shared within a single server render using
  React's request-scoped cache. No cross-request auth or financial cache was added;
  mutation authorization is unchanged.

No visual redesign, feature removal, financial write changes, RLS policy changes,
email sends, payment-provider calls, scanner changes or credential rotations were
introduced.

## Database and release order

Three additive read migrations were replayed from the existing 126-migration base
in a fresh, disposable local database and installed **only on CRM Staging**:

1. `20261026204224_lean_job_list_reads.sql`
2. `20261026211223_batch_dashboard_money_reads.sql`
3. `20261026212535_aggregate_job_index_metrics.sql`

The view is `security_invoker`; both functions are stable `security invoker` with
empty search paths. Anonymous execution is denied. No privileged/service-role
client is used by these application reads. Dynamic Jobs SQL chooses between two
constant view names; all filter values are bound parameters.

Staging verification preserved the old migration-ledger hash, all existing RLS
policy expressions and existing public/private function definitions. Invoice,
payment and paid-principal totals were unchanged. Generated existing table-row
and function contracts also match the base; the new view adds generated
relationship metadata.

The new migrations are recorded as deferred in the historical staging-candidate
inventory, retaining that candidate's frozen source set. For a later authorized
release, apply these read migrations before the dependent application. Do not
deploy the app alone to a database missing them. Reconcile the generated schema
against any separately pending migrations when integrating other worktrees.

## Verification

- 3,204 existing unit/PostgreSQL checks passed; typecheck and production build
  passed. The schema fingerprint check and `git diff --check` passed.
- Native list/RLS parity: 208 comparisons across owner, estimator, crew and
  customer, including search, pagination, archive, operational views, crew,
  invoice, date, city and priority filters; existing tokens denied after disable.
- Native dashboard parity: five windows across four roles, leap-year and DST
  boundaries, every cash bucket, nonzero receipts, partial refunds, lost disputes,
  fully refunded and pending payments, invalid dates, anonymous and disabled
  access. All matched the canonical report reads.
- Staging read-only parity also matched the canonical summary and every cash
  bucket across five windows, plus all five Jobs counts across six filter sets.
- Local and protected staging browser checks passed: one money request and no
  dashboard/queue reload per range change; keyboard, Reports links, Back/Forward,
  out-of-order responses, failed request/retry, both creation forms, desktop and
  mobile overflow, private response headers, role restrictions and disabled
  sessions. No uncaught browser exceptions occurred.
- Actual staging desktop (1280 px) and mobile (390 px) screenshots were inspected;
  the current visual design and responsive layout are preserved. The bounded
  Impeccable detector pass reported no findings in the changed dashboard UI.
- The protected draft contains no scheduled functions or email/payment provider
  credentials. Deployment artifacts were checked for embedded private values.
- All 78 previously pending work-file hashes and the separate runtime-security
  commit were preserved. The branch descends from current `origin/main` and
  includes the prior local staging-reconciliation commit.
- The synthetic staging owner was disabled and banned after verification; an
  existing token then failed access and report checks. Original staged fixture
  rows and both published deployments were verified unchanged. The owned local
  application and database stack were stopped with data volumes retained.

Evidence and screenshots are retained privately in
`/Users/noelsierra/Documents/Codex/2026-10-26/cloud-request-performance/`.
Relevant files include `PERFORMANCE_RESULTS.json`, `native-rls-results.json`,
`native-batch-results.json`, `local-ui.json`, `staging-ui.json`, and the final
preservation/cleanup reports. Raw logs and credentials are excluded from Git.

## Remaining work

Profile the unchanged quote-save path separately; its roughly 2.8-second staging
latency remains visible. Search queries still use the broad search views and need
their own measured optimization if search is slow at larger scale. Production
activation and live verification require a later explicit release instruction.
Existing staging advisories concerning guarded
[SECURITY DEFINER commands](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable),
[policy-less private tables](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
and [Auth leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
were reviewed; none identifies the new view/functions. They were not altered in
this pass.
