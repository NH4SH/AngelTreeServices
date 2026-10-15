# Local verification and runtime expectations

Use the committed npm lockfiles and `npm ci`; root/public tooling and this app
have separate dependency installations. Never copy production environment files
into CI. Ordinary checks work with no `.env.local` and no provider credentials.

The existing production Netlify function runtime was observed on Node 22 during
the October 2026 audit. The transferred developer setup uses Node 24.4.0 / npm
11.10.0. CI explicitly verifies Node 22.23.3 / npm 10.9.9 and Node 24.4.0 / npm
11.10.0. Both satisfy the pinned
Next.js and sharp engines. This change does **not** set `NODE_VERSION`, add an
auto-detected runtime file, or change a Netlify environment/configuration.
Keep the production runtime decision separate from this baseline patch.

From `apps/platform`:

```sh
npm ci
npm run test:unit
npm run typecheck
npm run build
npm audit
```

`test:unit` discovers all `src/lib/**/*.test.mjs` and `tests/**/*.test.mjs`, except
files explicitly named `*.integration.test.mjs`. It includes existing security,
money, notification, email, scheduling, Calendar, portal and mobile tests as well
as isolated PGlite migration/RLS tests. No network Supabase instance or real
emails, payments, Calendar writes or customer data is used. See `tests/README.md`
for the separately provisioned Supabase Auth/Mailpit and browser checks.

From the repository root:

```sh
npm ci
npm run test:public
node --test .github/scripts/*.test.mjs
git diff --check
```

The public-site build requires Python 3.12+ syntax; CI uses Python 3.13. Neither
package currently defines a lint script. Typecheck and the existing regression
tests are required; no new lint configuration is introduced by this patch.

## Photo policy migration review

`20261015040735_job_photo_category_parity.sql` changes only the existing private
job-photo INSERT policy. It allows exactly the six upload categories, validates
the generated path shape, and retains `private.can_access_job_photo_object` for
staff/assigned-job authorization. Bucket settings, metadata RLS, SELECT/DELETE
policies and signed-URL lifetime do not change.

`npm run test:photos` runs application upload validation and real PostgreSQL RLS
in an isolated in-memory PGlite database using repository policy/helper SQL.
It proves the old category failure and the new allow/deny behavior. PGlite is not
the Supabase Storage HTTP service: a separate disposable full-stack Storage API
smoke test remains useful before a future approved deployment. Never use a
production customer job for that test. Read `SUPABASE_MIGRATION_RECONCILIATION.md`
before applying any migration; this patch does not apply it to a hosted project.
