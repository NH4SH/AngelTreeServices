# Proposal follow-up expiry safety

October 23, 2026. Existing proposal-expiry and communications eligibility follow-through, based on current main `4e5bd40e911f944c6a6dbd7b77860a2da25c144a`. The verified appointment-reminder recovery batch is pushed to main. This candidate remains local and unreleased. No production query/change or application deployment occurred.

## Reproduced problem and change

Migration 117 and the customer page already honor an explicitly stored proposal deadline. Follow-up planning, preparation and native delivery admission still accepted `status='sent'` without checking that deadline. The actual saved pre-change processor sent an expired synthetic proposal through a mock transport. A fresh native 118 replay independently admitted its follow-up with a still-valid customer link. No real provider or customer was involved.

Automatic planning now excludes proposals at or past `expires_at`. The processor reads the deadline and cancels an expired queued follow-up before rendering or transport, with the plain reason “The proposal has expired. Contact our office for an updated proposal.” Invalid returned expiry data fails safely. Future and undated proposals retain the same recipients, content, timing stages and stable delivery identities. The proposal itself, its amounts and its business status are not rewritten.

Candidate migration **119**, `20261023205744_guard_expired_proposal_followups.sql`, adds the same wall-clock rule to the existing private eligibility predicate. It also rechecks live eligibility for quote follow-ups immediately after the recipient/family advisory-lock wait and before recording a provider attempt. Review found that checking only before that lock would still admit a message whose deadline passed during the wait. Existing source locks, snapshots, claim ownership, duplicate-family checks and attempt records remain in place.

Accepted requests still replay their saved result, and unknown/dispatching requests stay quarantined. The migration does not reinterpret historical acceptance, rotate request keys, create replacement links or resend an email. Ordinary deliberate document sending retains its separate existing rules. Token expiry, revocation and binding remain independent checks; a long-lived link does not extend the proposal deadline.

The checkpoint governs **new admission**. It cannot retract a provider request already admitted/in flight, guarantee the provider's delivery time or recall an older email. No new default validity period, grace period or owner business policy was introduced.

## Scope and preservation

Application changes are limited to the quote-planning filter and quote-follow-up preparation in `queue.ts` and `processor.ts`. Migration 119 replaces one predicate in `app_private.email_source_eligible` and adds one final guarded recheck in the existing `public.claim_outbound_delivery`. Both original routine metadata/privileges are preserved; no new RPC, grant, role, policy, table or public type is added. Other send types keep their existing rules.

All original 118 migration files are unchanged. The schema manifest was regenerated from the final candidate's fresh native local replay through 119; generated public TypeScript is byte-identical. The deferred-migration inventory and its count test now include 119 while historical staging candidates remain pinned to their original ledgers. Prior financial, notification, employee/dashboard, customer-document and scanner work is preserved. The separate runtime branch remains at `06580f6`.

## Verification

| Check | Result |
| --- | --- |
| Complete CRM regression suite | **2,466 passed**, no failures/skips |
| New focused tests included above | Seven tests: past/exact/future/null/invalid deadlines, saved outcomes, automatic planning and expiry after planning |
| Route types, TypeScript, optimized build | Passed on Node 22.23.4 / Next 16.4.2 / React and DOM 19.2.9 |
| Fresh local native upgrade and rollback | Original 118 replay; **27 assertions** with the final candidate fully rolled back |
| Fresh native installation and repeat | Final 119 installed only in the new disposable project; repeat/idempotent application verified; **27 installed-schema assertions** passed |
| Actual concurrent native admission | Three scenarios, four TAP results including parent: observed quote-lock expiry wait, observed family-lock expiry wait, and two simultaneous claims yielding one attempt |
| Staging candidate transaction | **27 assertions** passed; candidate and synthetic fixtures fully rolled back |
| Actual planner/processor with native synthetic inputs | Eight local/staging source scenarios passed; future/null output and identities match the pre-change processor, expired follow-ups stop, repeated planning does not duplicate rows |
| Schema/security maintenance | Fresh schema generation and offline fingerprints passed; public types and local security-advisor findings unchanged |

Native SQL covers independent proposal/token lifetimes, exact/past/future/null deadlines, expiry after preparation in the same transaction, no source/financial mutation, no acceptance before a simulated result, accepted same-key replay and immutable history, unknown-outcome holds, revoked tokens, sending OFF, deliberate document-send compatibility and service-only access denial for anon/authenticated callers. Acceptance/uncertainty evidence is synthetic SQL, not provider contact. Independent lock tests use separate PostgreSQL connections and verify the actual blocking wait before allowing the deadline to pass.

Staging remains exactly at **118** in project `gbyhdsuiqeslgjdnbqng`. Before/after snapshots match its native ledger, all 5,110 catalog objects/permissions, 49 protected business/Auth/history sets, settings and no-send Auth guard. Automatic sending, appointment notices and recurring generation stay OFF. No app was uploaded. Migration 119 is registered as deferred; permanent staging reconciliation is the next database step, not an action completed here.

Local verification used new isolated projects, not a reset/upgrade of the shared development stacks. The initial test project was retained while the final migration was replayed afresh after adding the post-lock check. Native schema generation used a private CLI response-format normalizer; no CLI/dependency/tooling change was committed. Build verification copied no ignored environment files/provider credentials and recorded zero external application requests.

## Evidence and remaining work

Sanitized receipt: `staging/PROPOSAL_FOLLOWUP_EXPIRY_VERIFICATION_20261023.json`. Private evidence: `/Users/noelsierra/Documents/Codex/2026-10-23/proposal-followup-expiry/`, including pre-change source/reproductions, fresh replay/upgrade and concurrency results, staging fingerprints, schema/advisor results and test/build logs. Raw tokens, generated records and detailed logs remain outside Git. Only owned disposable projects are stopped after acceptance, with their data retained.

No template or UI changed, so the preceding visual acceptance remains applicable; actual mailbox/device/assistive-technology acceptance and owner terms-policy decisions remain open. Keep the Netlify managed-runtime issue separate. Nothing was deployed or activated, no production data/settings/keys changed, and no customer email/provider call occurred.

### Push and staging follow-through — October 23, 2026

The verified implementation is pushed normally to `origin/main` as `bf0d794395d98e7af7941e333e3d5875529312bc`, with CI/Netlify skip markers. Targeted native staging reconciliation for the unchanged migration 119 is now complete; see `STAGING_PROPOSAL_FOLLOWUP_RECONCILIATION.md`. Staging has 119 migrations with both expiry checkpoints installed and its prior ledger, protected records, rights and OFF settings preserved. The original local/rollback-only receipt remains historical evidence. No application deployment or production change is implied.
