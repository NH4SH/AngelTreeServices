# Staging quote-draft migration 99

## Result

Duplicate-draft protection `301b8bf` is pushed atomically/nonforce to main and
`codex/quote-draft-requests`. This operational follow-through is local on
`codex/staging-quote-draft-99`, based on that main, pending push.

The existing ATS staging project `gbyhdsuiqeslgjdnbqng` is now independently
verified at **99 original migrations**. Only
`20261021032121_quote_draft_requests.sql` was applied. The staging app remains
undeployed; readiness stays false. No production query/write, app deployment,
credential rotation, Auth configuration patch, seed or role import occurred.

## Preimage and rehearsal

Fresh explicit-target reads verified the ATS organization/healthy project,
physical database identity, exact98 ledger/catalog/ACL seals, normal owner,
restricted owned/managed defaults, existing principal/standalone command metadata,
active no-send Auth guard and effective Auth/API configuration. Business records,
Auth users, files and private notification/source/request state were empty;
sending, recurring and scanning switches were OFF.

A new local database replayed the original chain, reproduced the reviewed managed
defaults/permissions and installed the existing local no-send guard. Its complete
98 preimage matched staging exactly. A deliberately failed99 migration rolled
back all additions and its history entry. Applying original99 succeeded; repeating
the native local upgrade was idempotent, preserving defaults and empty/OFF state.

The resulting **4,868-entry catalog** has exactly12 additions: the private quote
request ledger, six columns, constraints/index/deny policy and the staff RPC.
There are **zero previous changes/removals**. All original migration bytes,
historical candidates and seals remain unchanged.

## Local verification

- **1,848 regular results passed**: the preceding1,839 plus nine new verifier
  checks covering exact source inventory/hash chain, metadata/ledger drift,
  physical/organization identity, permissions, configuration freshness, guards,
  empty/OFF state and rejection of production/write arguments.
- **295 pgTAP assertions across15 existing suites passed** on an isolated
  managed-default clone, with TAP plans and failures checked explicitly.
- **19 installed quote-request SQL scenarios /20 TAP results passed**, including
  all office roles, organization contacts, lost-response recovery, closed/edited
  replay, role/actor/payload denials and complete rollback after line, audit or
  receipt failure.
- **Five independent-session committed races /six TAP results passed**: identical
  requests produce one quote/audit/receipt; mismatched payload/actor cannot reuse
  the identity; role revocation and deactivation while waiting produce no quote.
  The race database was dropped. No synthetic rows were committed on staging or
  the shared local review database.
- Isolated Node22 typecheck/optimized build passed with synthetic configuration;
  both final verifier/test overlays match the built bytes. Offline99 schema and
  whitespace checks pass. All110 existing shared-local public row sets, function
  definitions, ledger, constraints, policies, buckets and switches exactly match
  the pre-test baseline.

## Targeted installation and independent verification

A separate unlinked CLI directory contained only the exact99 reviewed migration
files and disabled seeds. The native staging dry run listed only99, no seeds or
roles. Immediately before applying, complete source bytes, catalog, physical
identity, ledger and effective configuration were rechecked against the preimage.
The single native push used explicit staging targeting and skipped Vault updates.

Post-apply ledger preserves its full98 prefix. Catalog/delta exactly match the
local rehearsal, including new quote command metadata and its empty private
ledger. Existing principal/standalone commands, defaults, guard definition and
permissions, Auth/API fingerprints, empty state and OFF switches are unchanged.
Repeat dry run is up to date; migration99 was not reapplied.

The new read-only maintenance verifier independently confirms99 with freshly
captured effective configuration. Fourteen actual read-only denial probes cover
anon/service execution, authenticated callers without a subject or with a
nonexistent subject, and anon/authenticated/service direct private-ledger access
for the new and existing command. Managed Auth role false grants are checked from
catalog; that role was not impersonated. The existing absent-invoice principal
read remains null, and a direct synthetic no-send guard call returns503. No Auth
email, customer communication, provider/payment operation or fixture write ran.

## Hosted advisor decision

The previous **60 WARN /31 INFO** becomes **61 WARN /31 INFO**. All91 existing
findings are unchanged. Exactly one new warning is
`authenticated_security_definer_function_executable` for
`public.create_quote_draft_request`.

Retain it visibly as the intentional authenticated staff transaction boundary.
The command checks live office access before and after waiting, delegates to the
unchanged protected quote transaction, uses a fixed empty search path/lock timeout
and keeps its ledger private with a restrictive false policy and no raw grants.
Local role, revoked/inactive and concurrent denial tests pass, and hosted unbound
callers/direct reads are denied. Do not broaden table privileges, switch to
invoker without redesigning the boundary, or suppress the advisory. There are no
other new hosted findings. The earlier local advisor engine's result does not
substitute for this hosted review.

## Maintenance and remaining gates

Use `scripts/release/verify-staging-quote-draft-candidate.mjs` with a fresh mode0600
effective staging config. It accepts only the assigned staging project and has no
apply/deploy/config-patch/key-retrieval mode. The new
`supabase/staging/quote-draft-candidate-99.json` pins untouched98 and original99,
including shape `deb2abb3832f8249902de6b8e142ab3b`, ledger
`05ae38edded0cb652c2f878774a80ecb` and API ACL
`d10788d41bb14c73cb644de8c7dd1903`. Historical93–98 candidates require their own
exact ledger. The deferred source inventory retains its historical meaning.

Private evidence is in
`/Users/noelsierra/Documents/Codex/2026-10-20/staging-99/`.
This package changes only the new99 candidate/verifier/tests and documentation;
no application runtime or migration SQL changed.

Hosted app/issued-JWT workflow acceptance, TLS/CDN/runtime isolation, populated
Data API access, Stripe/email acceptance, scanner connectivity, source-file restore
and operator review remain separate rollout gates. Staging database reconciliation
does not authorize deployment or make the release ready for production.
