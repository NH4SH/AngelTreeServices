# Staging target setup and verification — October 17, 2026

**Published/follow-through:** staging access/preparation is pushed to main and `codex/pr18-local-staging-access` at `bd206a8`, deployment skipped. The [free scanner hosting review](FREE_SCANNER_HOSTING_REVIEW.md) now recommends a conditional Oracle A1 ARM64 staging candidate. No host is provisioned and all hosted readiness gates remain open.

**Local access-gate follow-through (October 17):** the owner selected a free, custom approach. A staging-only gate is implemented and tested locally; see [local access protection](STAGING_ACCESS_PROTECTION.md). Native Netlify protection is still locked, no plan/team change or scanner purchase is approved, and hosted visitor protection remains unverified. The earlier paid host recommendation is retained as historical review, not the selected budget.

Status: **staging application grants reconciled; managed defaults reviewed and retained; hosting not ready**.
This continues PR18/F17 and the existing roadmap. The user selected ATS and
completed Supabase CLI authentication. Production and the disposable review app
are preserved.

## Actual targets

| Target | Assignment | Verified state |
| --- | --- | --- |
| Supabase | CRM Staging, `gbyhdsuiqeslgjdnbqng`, ATS | Healthy; Free; us-east-2; Postgres 17.11; 92/92 migrations |
| Netlify | angel-tree-admin-staging, `d81d923d-6ccf-4c1e-87cc-263f3d51555d`, ats/nh4sh | Dedicated project; no published app deploy or Git deployment connection |
| App origin | `https://angel-tree-admin-staging.netlify.app` | Reserved hostname; live app/TLS not verified |
| Scanner | Unassigned | Separate host, endpoint and maintainer still needed |

`staging/PROVISIONED_TARGETS.json` is an inventory, not the application's embedded
target manifest. Shared `staging/targets.json` stays unassigned/false. Only a new
isolated export receives actual assignments. The old inactive Supabase project
was not repurposed, restored, reset or deleted. Staging's region differs from
production's us-west-2, so it is not a production latency benchmark.

## Database initialization completed

- CLI **2.121.0** authenticated successfully. Every hosted command used the explicit
  staging ref and an isolated private work directory. The application checkout
  was not linked to either database.
- All **92** original files matched the SHA-256 values in
  `supabase/reconciliation/release-2026-10-17.json`. The first CLI dry run listed
  exactly those files against the empty target. They applied successfully with
  their original versions/names; the actual ledger matches all 92 pairs.
  A second dry run reports **0 pending**.
- Seeds/custom roles were excluded, seed execution disabled and Vault updates
  explicitly skipped. No reset, combined baseline, fabricated history or repair
  was used. Migration sources did not change. Only staging received schema writes.
- There are **0 Auth users, Storage objects, customers, quotes, invoices, jobs,
  payments, customer communications, calendar connections and Stripe receipts**.
  Migration-created lookup/settings rows and eight empty buckets are expected.
  No business rows, accounts, sessions, integration tokens or files were copied.
- All eight buckets are private. Communication sending, recurring generation,
  document scanning and all six attachment scan switches are **OFF**. No invalid
  application indexes, unvalidated constraints or public application tables
  without RLS were found.
- Comparison with the fresh local 92-migration replay finds the same **4,723**
  application catalog objects: 244 routines, 322 policies, 139 triggers, 38 views,
  eight buckets, and matching columns/constraints/indexes. Routine bodies,
  owners, predicates, RLS flags and view options match. **Grants differ** as
  described below; this is not full permission equivalence.

## Auth restrictions and real API checks

The staging Auth config was diffed before writing and checked afterwards. Only
its targeted Auth properties changed; undeclared remote settings were left alone.

- Site URL is the exact staging origin. The sole additional redirect is
  `https://angel-tree-admin-staging.netlify.app/update-password`. No wildcard,
  localhost, preview or production redirect was added.
- Global public signup is disabled. The email/password provider remains enabled
  for future controlled accounts; anonymous and other external providers are off.
  A real signup probe with an `.invalid` address returns **422 signup_disabled**.
  It creates no user and requests no email delivery. Provider enablement and the
  global signup restriction were independently checked after configuration.
- Declared refresh-token rotation/reuse, manual-linking and email-confirmation
  settings match their intended values in CLI comparison. No production Auth
  configuration, SMTP/provider secret or user was imported.
- The staging publishable key works over HTTPS; an invalid key returns 401.
  Anonymous invoice-void, employee-access and webhook-recovery commands return
  **401 / 42501**. The invoice helper below now also denies anonymous execution after reconciliation.
- Anonymous customer/invoice/quote/profile reads return empty arrays on this empty
  database; employee-record reads are denied. These are transport/denial checks,
  **not** a substitute for seeded owner/admin/estimator/crew RLS tests.

Email templates, an approved isolated mail sink, recovery delivery and actual
account/session flows remain unverified. `authIsolationVerified` stays **false**.
No recovery email, customer notification, payment, calendar operation or scanner
request was sent. No privileged API key was retrieved or installed; public-key
binding alone does not establish server-key binding.

## Fresh-project grant reconciliation follow-through

The verified setup commits `58231ef` and `87b6251` are now pushed to main with
deployment skipped. The staging-only reconciliation has removed the extra grants
on **108 public application objects** using 279 explicit REVOKE statements.
All current relation/routine ACLs now exactly match the original 92-migration
fresh-replay contract. Three statements restrict the normal `postgres` owner's
named API-role defaults in `public`, reducing those default grants from 36 to 0.
The redundant managed public-schema USAGE grants are intentionally retained.

The anonymous invoice helper now returns **401 / 42501** before execution;
its staff caller grant is preserved. The security advisor's anonymous definer
warning is gone, with zero public application definers executable by anon.
Original migration history, bodies, RLS, column permissions and all empty/OFF
state are unchanged; a second apply is a no-op.

Three protected `supabase_admin` default ACLs remain unchanged. The normal account
cannot alter them; no privilege escalation was attempted. PostgreSQL's global
implicit PUBLIC EXECUTE also requires explicit per-function revocation in future
migrations; schema-scoped default changes do not remove it. Full provider/default
normalization remains false, separately from the verified current-object and
normal migration-owner results. The completed managed-default review accepts
preserving them for this pinned staging candidate under strict creator/catalog
checks; all 243 public application relations/routines are owned by `postgres`.
No production cleanup is implied. See SUPABASE_MANAGED_DEFAULTS_REVIEW.md.

See **STAGING_PERMISSION_RECONCILIATION.md** and `supabase/staging/README.md` for
the guarded package, test evidence, completed managed-default review and the
existing release gates. Fresh verification adds 714 passing regressions, 160
passing database assertions, typecheck, real HTTPS denials and transactional
rollback/idempotence checks. No application code or production migration changed.

## Remaining release gates

The next preparation pass is documented in
STAGING_VISITOR_AND_SCANNER_PREPARATION.md. The managed-default review `bd6ea2d`
is now pushed to main. Visitor protection was reconfirmed locked on the current
legacy Free staging site. A separate staging-team Private configuration and a
company-controlled DigitalOcean 8 GiB scanner VM are prepared recommendations,
not configured or purchased resources. All unverified flags below stay false.

1. **Visitor protection:** Netlify's legacy Free plan returned HTTP422 when team
   protection was requested. The real dashboard says “No protection settings” /
   “Upgrade to unlock.” No plan or shared production setting changed. A protection
   approach is still needed; do not substitute a public app, obscure URL or app
   login for outer protection.
2. **Scanner host/operator:** the reviewed company-controlled package requires
   at least 8 GiB RAM / 2 vCPU (container caps total 6.625 GiB). Only ARM64 was
   executed locally. Host/TLS/firewall/independent credential/maintainer/monitoring
   and paired source-file/database recovery are unverified. Do not expose the
   laptop scanner or reuse a production endpoint/key.
3. **Hosted runtime/key/mail evidence:** four public Netlify settings were saved
   and visibly verified: APP_ENV, STAGING_MODE, APP_BASE_URL and
   NEXT_PUBLIC_SUPABASE_URL. No keys, providers or worker credentials are installed.
   The variable connector acknowledged writes that did not persist; future
   credential provisioning needs independent verification. No shared team
   variables were returned, which does not prove a future runtime's isolation.
   Auth mail, server-key binding, scanner recovery and protected live origin
   checks remain necessary before readiness flags can change.

## Verification, preservation and next step

Initial setup verification at `87b6251`: real staging migration apply; exact 92-entry ledger;
idempotent dry run; full catalog comparison; security advisor; OFF/private/empty
inventory; Auth readback and HTTPS positive/negative probes; **13/13** existing
migration-review/staging-preflight tests. The actual assigned export must still
fail preflight. Permission follow-through adds 714 passing regressions, 160
database assertions and a fresh typecheck, detailed in STAGING_PERMISSION_RECONCILIATION.md.
Application runtime source remains unchanged; no new app build was needed.
Hosted UI, adapter upload/cache behavior and seeded role/session scenarios need
a later explicitly approved, protected staging deployment.

Production still has **65 migrations** and published CRM deploy
`6ad23c757dfc53f702ae00b9`. No production schema/history, data, configuration,
credential or deployment changed. All previous work, including employee UI and
the local review app, is preserved. Main is included without rewriting history.

Private CLI/config/catalog/API evidence is outside Git under
`work/staging-targets/schema-initialization/` in the existing Codex work folder.
Reports and inventory contain no credentials. These results do not authorize
any app/scanner release or production activation.

**Recommended next step:** finish the existing PR18 visitor-protection and company-controlled scanner host/operator
decisions. Complete isolated Auth/mail,
server-key binding, runtime scopes and paired restore proof before requesting an
actual staging deployment. See STAGING_PREPARATION.md,
MIGRATION_RECONCILIATION_REPORT.md and SCANNER_HOSTING_AND_RESTORE.md.
