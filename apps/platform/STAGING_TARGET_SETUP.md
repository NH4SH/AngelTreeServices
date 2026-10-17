# Staging target setup — October 17, 2026

**Separate targets are created; staging is not ready to build for hosting or deploy.**
The verified hostname/isolation commit `55b7d6c` is pushed to main and its branch
with `[skip netlify]`. This follow-through continues PR18/F17. No app or scanner
deployment, production setting/credential/data change, DNS change, paid upgrade,
production migration or release was performed.

## Actual assigned targets

| Target | Assignment | Verified state |
| --- | --- | --- |
| Supabase | CRM Staging, `gbyhdsuiqeslgjdnbqng`, ATS organization | Healthy; separate from production; Free plan; us-east-2; Postgres 17.11 |
| Netlify | angel-tree-admin-staging, `d81d923d-6ccf-4c1e-87cc-263f3d51555d`, existing ats/nh4sh team | Empty dedicated project; no published app deploy |
| App hostname | `https://angel-tree-admin-staging.netlify.app` | Reserved built-in hostname; no production-zone DNS change; live app/TLS not verified |
| Scanner | Not assigned | Hosting account/server and maintainer still needed |

The user explicitly chose the existing **ATS** Supabase organization. Creation
completed without a paid-cost confirmation request; the organization reports
Free. No existing project was restored, reset, repurposed or deleted. The old
inactive project remains untouched. The new staging region differs from the
production project's us-west-2, so it is not a production latency benchmark.

The public identifiers and readiness facts are saved in
`staging/PROVISIONED_TARGETS.json`. It is an inventory, **not** the application's
target manifest. The shared production `staging/targets.json` remains unchanged
and unassigned. Only a separately exported staging artifact receives assignments;
never replace the shared production manifest with this inventory.

## What was verified

- A read-only staging catalog check found **0 public application objects,
  0 Auth users, 0 Storage buckets and 0 Storage objects**. Its migration history
  is empty: **0/92** applied. No business data, accounts, sessions, integration
  tokens, queues or files were copied from production or the local review app.
- The staging project's enabled modern publishable key is accepted by its own
  real HTTPS Auth settings API (200); a deliberately invalid key is rejected
  (401). This verifies the **public** key binding only. No service-role/secret
  key was retrieved, manually generated, printed, installed or committed.
- The new site's public settings were saved and verified in the actual Netlify
  dashboard: APP_ENV, STAGING_MODE, APP_BASE_URL and NEXT_PUBLIC_SUPABASE_URL.
  They select the reviewed core-no-providers profile and the new staging targets.
  This legacy Free plan allows all scopes; the values are public configuration,
  with no credentials. No public/server key or provider/worker credential is
  installed on the site. No Git repository or automated deployment was connected.
- The shared-variable connector returned an empty team variable list. This is
  control-plane evidence, not proof of a future built function's environment.
  The runtime/isolation flags remain false pending actual complete verification.
- Production still reports **65 migrations** and its same published Netlify
  deploy `6ad23c757dfc53f702ae00b9`. Its configuration was not modified. All
  existing local application work and the disposable reviewer remain preserved.

The enabled public staging key is kept in a private local evidence file outside
Git for verification. Reports contain no key values. No real email, payment,
calendar or scanner request was sent. API probes were read-only; they did not
create an Auth user or invoke password recovery.

## Concrete blockers and decisions

1. **Command-line authentication is needed before schema initialization.**
   The Supabase connector can inspect/create the project, but the installed CLI
   has no access token. Its migration tool generates new version identifiers;
   using it to import the 92 existing files would not preserve the verified CLI
   migration history. No shortcut, combined baseline, history fabrication or
   repair was used. The requested sign-in command is:

   ```sh
   npx --yes supabase@2.121.0 login
   ```

   Sign into the ATS account, keep tokens private and confirm completion. Then
   use an isolated work directory, an explicit staging project ref, the pinned
   92-file manifest and the supported CLI dry run before applying anything to
   this new empty target. Never use the production checkout's linkage, include
   production seeds, update Vault secrets or run a reset. Check the actual
   supported CLI flags again before execution.

2. **Auth isolation is not configured.** The public settings API confirms fresh
   defaults: signup currently enabled, email provider enabled, anonymous users
   and third-party providers disabled. There are no Auth users. After management
   authentication, disable public signup for this initial owner-controlled test
   environment, set the staging Site URL/exact reset redirect allowlist, inspect
   template redirects, and require isolated mail handling before testing emails.
   No production Auth setting or credential may be copied. Do not set the Auth
   isolation flag based on the successful public-key probe.

3. **Netlify visitor protection is plan-blocked.** The attempt to require team
   access for this new site returned HTTP422. Its actual General → Visitor access
   dashboard says “No protection settings” and “Upgrade to unlock.” No team-wide
   setting or plan was changed. Keep the site empty and undeployed until a
   protection approach is agreed. An app login or an obscure hostname does not
   satisfy the outer visitor-protection gate. Do not upgrade/migrate the shared
   production team or silently substitute a public staging app.

4. **A separate scanner host/operator is unassigned.** Use the existing reviewed
   company-controlled package with at least 8 GiB RAM / 2 vCPU; its container
   memory caps total 6.625 GiB. The only executed image proof is ARM64, so an
   AMD64 choice needs its own build/runtime/capacity proof. A real hostname,
   trusted TLS, independent credential, firewall, maintainer, monitoring and
   paired encrypted source-file/database recovery remain required. Do not
   expose the laptop's local scanner or reuse a production endpoint/key.

5. **Netlify connector writes were not reliable.** Five variable upserts
   reported success, but both readback and the dashboard remained empty. They
   were not treated as completed setup. Four non-secret settings were then
   saved through the real dashboard and visibly verified. The public key was
   deliberately not added through a further unverified write. Future credential
   provisioning must verify actual persistence and scope without printing keys.

## Next step within the existing roadmap

Resume with CLI sign-in and the scanner hosting/maintainer choice. Initialize
and verify the empty staging database using the original migration versions,
default-OFF automation and scan gates, then verify staging-only Auth/API keys,
visitor protection, backup/recovery and the new host. Store private credentials
only in approved private locations. Leave provider and worker credentials absent.

Populate a new exported artifact's target file with these actual assignments;
keep unknown evidence false and scanner origin null. Its preflight must refuse
hosting readiness while the listed blockers remain. No evidence flag grants
permission to build on a linked production site or deploy. Actual app/adapter
transport, cache/access behavior, function inventory and live URL checks remain
part of a later explicitly approved staging deployment.

See STAGING_PREPARATION.md, STAGING_HOSTNAME_AND_ISOLATION.md,
MIGRATION_RECONCILIATION_REPORT.md and SCANNER_HOSTING_AND_RESTORE.md. This is
progress on the existing implementation plan, not a new competing roadmap.
