# Hosted staging perimeter and key acceptance — October 21, 2026

The dedicated staging site now serves an isolated, data-free access and runtime-key probe at `https://angel-tree-admin-staging.netlify.app`. Current deploy: `6ad91b1a222514a9c54350c8`. This closes specific hosted-perimeter and actual key-binding observations. It is not a deployment of the CRM or dashboard, and does not establish full Next.js application acceptance.

The owner authorized continuing the existing full release. The application source and production configuration remain unchanged. The source candidate was `1fe4ad48b01a012bf748d48b4a404a8324eafa46`; newer website-only main commit `a0313f6` has the identical committed platform tree. Main alignment preserved that website work.

## Actual deployed artifact

- Existing dedicated Netlify site `d81d923d-6ccf-4c1e-87cc-263f3d51555d`; no new site, account or paid protection was needed.
- Exact existing staging access handler/page/Edge entry, with an isolated minimal target assignment. The shared application `staging/targets.json` is untouched and remains unassigned/false.
- Three harmless static canary files and one diagnostic Function. No CRM routes, customer-facing actions, scheduled workers, database client library, customer records, copied environment files, scanner credentials or production configuration are in the artifact.
- The read-only key probe uses fixed staging HTTPS endpoints only. It rejects wrong site/origin/environment/project, privileged browser-key formats and provider/worker credentials before a request. It permits only GET checks, returns boolean results and never returns/logs keys, Auth users or customer rows.
- Existing nine site variables and zero returned team variables retain their reviewed settings. No key, code, encryption secret or environment value was created, changed or rotated. Runtime secrets stay in Netlify. The local probe's `.netlify` link/build state is gitignored and outside the CRM checkout.
- Bundled artifacts were inspected, including archive members, for the existing private credential values; zero matches. The catch-all gate is before cache, with no post-cache route and `on_error=fail`.

## Hosted observations

All **10 final hosted scenarios passed** on real Netlify HTTPS, Deno Edge, CDN/static delivery and the Node22 Function. These are actual hosted observations, rather than synthetic `context.next` emulation.

| Check | Result |
| --- | --- |
| 13 static, function, portal/framework and worker-path probes × GET/HEAD/POST/OPTIONS | 52 anonymous requests denied with401 and private/no-store |
| Wrong code / cross-origin login |401 /403; no session issued |
| Existing private staging code |303; host-only Secure/HttpOnly/SameSite=Strict four-hour cookie |
| Authorized static canary; subsequent independent anonymous request | Exact authorized bytes; anonymous401; no cached content disclosure |
| Real Edge → Function binary POST | Existing cookie, Bearer header and body retained; gate cookie stripped |
| Actual Function environment | Expected staging site/origin/markers; actual gate keys available |
| Actual staging publishable key | Auth settings accepted over HTTPS; anonymous customer reads remain denied (`42501`) |
| Actual staging secret key | Auth admin GET accepted; empty user list; no Auth writes |
| Deliberately invalid publishable key |401 |
| Wrong, duplicate or bypass-marker session requests | Denied without canary content |
| Current immutable deploy URL |421, including a manually supplied canonical session |
| Two earlier probe deploy URLs | Four additional checks all421, including valid session plus spoofed forwarded host |
| Logout | Same-origin303, scoped cookie cleared; independent anonymous client denied |

A custom-path Function is unavailable at its default `/.netlify/functions/<name>` address. The authenticated404 there is expected Netlify routing, while anonymous requests are blocked by the gate. The actual custom function path was exercised successfully. See [Netlify function path configuration](https://docs.netlify.com/build/functions/configuration/).

The initial browser-key probe expected an anonymous customer query to return an empty array. Fresh direct diagnosis showed that the existing grant boundary correctly rejects that read. Verification was corrected to test valid versus invalid API keys against Auth settings and explicitly assert that customer reads remain denied. No grant or RLS change was made to accommodate the check. Modern keys use the `apikey` header. See [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys).

Local checks: **19** unchanged gate/adapter tests and **10** read-only probe tests passed. The latter check production-target rejection, forbidden provider/worker settings, wrong methods, private browser keys, generic errors and non-disclosure of unexpected Auth rows. Local builds used Netlify Build37.4.3 / Edge bundler16.1.3. No dependency or lockfile changed.

## Preservation and remaining work

Fresh read-only staging database observation:100 migrations, zero Auth users, Storage objects, customers and invoices, and zero enabled attachment-scan buckets. Probe requests are GET only; no migration, business/Auth write, notification or provider send ran. Production remains65 migrations and published CRM deploy `6ad6ecfc6c03786554247e4a`, the earlier CSS hotfix. The dashboard remake is still unpublished.

This artifact contains no Next.js SSR/adapter runtime, real CRM sign-in, uploaded document, scanner call or financial workflow. Exact candidate framework/direct-upload/cache/role/browser-session acceptance, Auth route coverage, scanner TLS/monitoring, paired source-object/database recovery and the coordinated production upgrade remain open. No full-CRM readiness flag was promoted from this limited probe.

The existing Netlify account controls `angeltreeservices.org` DNS; proposed scanner host `scanner-staging.angeltreeservices.org` has not been created. Home gateway is reachable over the LAN, but the in-app browser rejects its local certificate. The owner clarified that their initial “router access” answer referred to Verizon's account website; local router administration and model remain unverified. A short user check of `http://192.168.1.1` in Safari/Chrome is pending. No router, firewall, DNS, public scanner listener or hosting account change occurred.

Sanitized machine-readable evidence: `staging/HOSTED_PERIMETER_ACCEPTANCE_20261021.json`. Reproduction sources, exact bundled manifests, artifact reviews, redacted outcomes and deploy receipts are retained outside Git under `/Users/noelsierra/Documents/Codex/2026-10-21/staging-perimeter-acceptance/`. This directory also retains the earlier outcomes; access codes, key values, cookies and raw user responses are absent from the shared evidence.
