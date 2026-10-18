# Local rehearsal: no-send Auth email hook

Status: locally verified, not installed or enabled on hosted staging/production.
See `apps/platform/STAGING_AUTH_EMAIL_GUARD.md` for results and the next approved
staging work boundary.

`install.local.sql` creates only a dedicated private invoker function returning an
explicit503; `rollback.local.sql` removes only the exact reviewed function/schema
and rejects drift. `package.json` pins both source hashes and function body.
Both SQL files reject shared/hosted database names and elevated migration roles.
They are outside ordinary migrations and must stay that way.

Use the opt-in native test documented in `apps/platform/tests/README.md`; do not
paste these files into a hosted SQL editor. The harness uses a new synthetic
local database and owned unpublished Auth/Mailpit containers. It never resets the
shared stack. Rollback restores mail only on that owned test service. A future
hosted rollback must first close staging entry points to prevent built-in mail.
There is no hosted install, activation or credential management command here.
