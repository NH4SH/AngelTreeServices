# Reliable communication-default saves

October 23, 2026. The verified reminder-link fix is pushed normally to main as `da5aef7`. This focused follow-through preserves that work and the subsequent website-only main update `8158e7c`. The new settings-save implementation is a verified local candidate, awaiting a separate push and targeted staging reconciliation for migration 122. No production query/change or app deployment occurred.

## Confirmed problems and resulting behavior

The saved original action reported success when an update affected no row. It also ignored the version of the form being edited, allowing an older form to overwrite a newer setting, including a master switch another operator had disabled. Both outcomes were reproduced through the actual original action with controlled synthetic writes; this is not evidence of a production incident.

A separate native staging test confirmed that the reviewed migration-121 permissions grant authenticated users SELECT but no UPDATE on `communication_settings`. A legitimate synthetic owner therefore received `42501` through the original update path despite the existing owner/admin RLS policy. The fresh local Supabase bootstrap has broader table grants and does not reproduce that permission denial. Production was not inspected, and its permissions are not inferred from either environment.

The form now keeps its original database version paired with its editable values. A refresh caused by another action, such as searching leads, retains the draft and its original version together. Saving performs one user-scoped UPDATE matching both the singleton and that version, then checks the returned row and timestamp. Only a confirmed save advances the form version. A stale or unavailable row asks the operator to reload, retaining the draft. An unsuccessful or uncertain acknowledgement gives a safe warning without claiming success or advancing the version.

After a committed save whose acknowledgement is lost, retrying the old form cannot write again. Two concurrent saves of one version produce one successful writer; a save queued behind a newer edit cannot overwrite it. Missing/blank numeric values are rejected rather than becoming zero, while the supported zero-day invoice reminder remains valid. Existing limits and timezone validation remain in force.

## Narrow permission reconciliation

Migration `20261024010036_communication_settings_edit_permissions.sql` normalizes this one table: authenticated SELECT plus UPDATE on exactly the 17 existing editable settings columns. It removes broad authenticated table privileges where local bootstrap defaults supplied them. It does not allow INSERT, DELETE, table-wide UPDATE, maintenance or identity/timestamp writes. On the reviewed staging catalog, the only prospective differences are the 17 editable column grants.

Existing owner/admin and fresh effective-access RLS policies remain byte-identical and authoritative. There is no service-role fallback, privileged routine, default-privilege change or RLS rewrite. Signed-out users, nonadministrative roles, disabled profiles, separated employees and removed memberships remain denied, including existing signed-in sessions. JWT user metadata cannot supply a stored role.

The original migration sources and generated database types are unchanged. The schema fingerprint adds only migration 122. Its exact source hash is recorded in the deferred staging inventory with `productionReady: false`; staging remains at 121. Migration 122 was installed only in the newly owned loopback test database, after rollback-only local and staging rehearsals. Targeted permanent reconciliation on staging is the next step, before a separate application release.

## Verification

| Check | Result |
| --- | --- |
| Complete CRM regression suite | **2,635 passed**, zero failures/cancellations/skips |
| New action/form behavior tests included above | **18 passed** |
| Route types, TypeScript, optimized build | Passed on Node 22.23.4 / Next 16.4.2 / React and DOM 19.2.9 |
| Build isolation | No ignored environment files or provider credentials copied; zero external application network attempts |
| Native candidate SQL on local 121 | **47 assertions**, candidate and fixtures rolled back; exact before/after state |
| Native candidate SQL on staging 121 | **47 assertions**, candidate and fixtures rolled back; exact before/after state |
| Installed migration 122 on owned local database | **47 assertions**, fixture rollback; original 121 full ledger entries preserved; catalog matches reviewed candidate |
| Local security advisors | No issues found before/after |
| Actual Supabase/Auth/PostgREST/action acceptance | **16 scenarios / 17 TAP results passed**, including observed native lock waits and a lost committed HTTP acknowledgement |
| Actual rendered local form | Keyboard save, unrelated search refresh, stale refusal with draft retention, reload, and confirmed subsequent save passed |
| Concurrent main website compatibility | 239 Node + 9 Python checks, public build and 18-page validation passed with `8158e7c` included |

The API cases use real synthetic Auth identities, stored roles, native permission checks and actual settings writes. Controlled HTTP faults occur before a selected write or replace the response after the actual write commits. The tests do not invoke a sender. Queue, outbound-delivery and email history counts remain unchanged; automatic sending and appointment notices stay OFF. SQL verification uses ten synthetic identities, protected-column denial, metadata-spoof denial and native constraints. All staging changes, including the prospective grants, were inside caller-owned rollback transactions.

Browser verification used the actual local CRM and a synthetic owner. At the initial 640-by-360 viewport, Enter saved a benign reminder offset. An unsaved draft survived a real lead-search server refresh; submitting it after a newer local edit produced the intended conflict and retained the draft. Reload showed the current value, and the final confirmed save restored the original offset. Both sending switches remained OFF and the browser error log was empty. The temporary tab was closed. A final screenshot could not be saved after the background app window collapsed to a zero-size viewport; full responsive, physical-device and screen-reader acceptance is not claimed. No layout or CSS changed.

The first public compatibility attempt selected macOS's older Python 3.9 and failed parsing an existing generator construct. Repeating with the installed Python 3.13.16 passed without changing source. This was a test-runtime selection issue, not a CRM or website regression.

## Preservation, evidence and next step

ATS CRM Staging (`gbyhdsuiqeslgjdnbqng`) remains at **121 migrations**, latest `20261023232306`, with **5,111 catalog objects** and **49 protected business/Auth/history sets**. Its complete native ledger, catalog, records, settings and staging no-send Auth guard match the original pinned baseline after rollback. Automatic sending, appointment notices and recurring generation remain OFF. A fresh final read-only snapshot is recorded in the sanitized receipt.

The local environment replayed the original migration chain without a shared reset, then applied only 122. SQL fixtures rolled back exactly. Separate real API/browser tests retained synthetic records and benign settings only in that owned local database; its preview and database were stopped with data preserved. Shared databases, services and the separate runtime-security checkpoint `06580f6` were untouched.

Sanitized receipt: `staging/COMMUNICATION_SETTINGS_SAVE_VERIFICATION_20261023.json`. Private evidence: `/Users/noelsierra/Documents/Codex/2026-10-23/communication-settings-save-safety/`, including original-source reproductions, native permission checks, rollback fingerprints, clean test/build logs, API results and browser verification. Credentials, raw snapshots, Auth identities and diagnostics remain outside Git.

The next implementation step is **targeted staging reconciliation for migration 122**, preserving the same source and testing installed permissions through real user sessions. Do not use an unrestricted database push. Existing owner-policy decisions, real mailbox/device/assistive-technology acceptance and the separate managed-runtime follow-up remain in the current roadmap.

This batch changes only settings-save acknowledgement, stale-draft protection, input validation and the narrow permissions needed by the existing form. Financial behavior, per-record automation, delivery claims, queue preparation, worker logic, templates, historical messages, employee/dashboard design and all previous security remain intact. No customer email/provider request, historical retry, activation, deployment, production query/change, key rotation or support contact occurred.

## Push and staging reconciliation follow-through

The verified implementation is pushed normally to main as `d5a3940`. The unchanged migration 122 is now installed and verified on ATS CRM Staging. See `STAGING_COMMUNICATION_SETTINGS_RECONCILIATION.md` for failed-upgrade rollback/repeat, 47 candidate and installed assertions per environment, exact preservation of the original 121 native ledger entries, protected state and OFF controls, fresh schema/type checks and 2,645 passing CRM results. This completes the targeted staging database step only; no app deployment, production change or customer communication occurred. The reconciliation checkpoint remains local pending a separate push request.
