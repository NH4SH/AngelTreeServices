# Dashboard attention layout production hotfix — October 20, 2026

The CSS-only correction is live at https://admin.angeltreeservices.org.

- Successful deployment: `6ad6ecfc6c03786554247e4a`, published October20 at
  00:25 Eastern. Netlify production-context hosted build, secret scan passed.
- Release source: `8a510950d1c5dc8a4f6ef1ea4ae3edc3285315df` on
  `codex/production-attention-layout`, based on the previously deployed
  `49a0b82d6a1d028039249aa32a375acbdf8eec2d`.
- Exact source difference from the prior live version: **two CSS lines in
  globals.css**. Expanded attention records use one flexible column; text can
  shrink within the existing header. No application/business-logic or dependency
  file changed. All unreleased main-branch features remain unreleased.
- The equivalent development fix is `fe85bb6`; it remains with the completed CRM
  work on the development/main history. This record is pushed with deployment
  skipped. A future main deployment will publish its full newer application;
  this hotfix does not authorize that migration-dependent release.

## Verification and incident record

The isolated production-baseline build passed locally and its compiled CSS
contained both rules. The local dashboard and390px fixture were checked; pointer
and keyboard expansion worked. Typecheck and layout scan passed. Existing local
workflow/regression evidence is unchanged, not claimed as production test writes.

The first authenticated CLI build/deploy attempt used the wrong monorepo working
directory and failed before publishing. Running from the repository root built
and published `6ad6ebc2c6dfa436a2c06d97` at00:19 Eastern, but a live login check
returned500. Server logs identified an invalid Supabase URL: all four existing
NEXT_PUBLIC settings were marked secret, and the off-host CLI build had inlined
Netlify's masked values. This should have been checked before publication.

The release was corrected forward using the **same source commit**, uploaded as
an immutable source ZIP to Netlify's production build API. The hosted build can
read its existing secret settings correctly. No older deployment was restored;
no secret flag, key, variable value, database schema, role or migration ledger
was changed. No production test account, payment, message or customer record was
created. The initial failed release is retained as operational history.

After the successful hosted build:

- Login returns200 and the browser renders its normal sign-in form.
- Anonymous `/admin` redirects to login and retains no-store behavior.
- `/api/health/live` returns200 with `ok:true`.
- Both corrected layout rules are fetched from the **live origin's CSS**.
- Frame protection remains DENY and MIME sniffing is disabled.
- The server handler, Edge middleware and all five existing scheduled functions
  are retained, with identical schedule expressions.
- Netlify scanned24615 files with no secret matches.

An authenticated production dashboard visual check was not performed; no staff
password was requested or entered. The live sign-in tab was opened for the owner.

The isolated CLI release directory was linked only to the existing production
Netlify site for diagnostics; `.netlify` is already ignored by Git. Authentication
and private operation logs remain outside Git. The build archive excludes local
environment, dependency, linkage and credential files. See safe evidence in
`staging/DASHBOARD_LAYOUT_RELEASE_VERIFICATION.json` and private operational
records under `/Users/noelsierra/Documents/Codex/2026-10-20/dashboard-release/`.
