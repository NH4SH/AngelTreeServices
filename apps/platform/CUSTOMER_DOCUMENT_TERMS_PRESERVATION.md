# Customer document terms preservation

Verified October 22, 2026. The migration-117 staging reconciliation is pushed to main as `e956e25`. This next batch follows finding 6 in `CUSTOMER_TERMS_REVIEW.md`: preserve the current document wording before correcting defaults or per-record overrides. It includes main through `810ecf1`, preserving its independent public-site mobile changes and all completed CRM work. The new batch remains local, pending a separate push/release request.

## Result

The current five proposal clauses and thirteen invoice clauses are retained, character for character, in the fixed `legacy-2026-10-22` rendering version. Arrays and clause objects are frozen, and an independently captured pre-change digest pins each family. Existing quote expiry/date formatting and the undated 30-day wording remain unchanged. No fee, deposit, warranty, payment deadline, surcharge rate, debris rule, scope, amount or email wording was changed.

Migration 118, `20261023030829_preserve_customer_document_terms.sql`, adds a non-null `document_terms_version` to quotes and invoices, with the legacy version as its constant default and only supported value. Existing rows acquire that baseline without application UPDATE statements or timestamp/revision changes. A private invoker trigger rejects attempts to relabel an existing document; checks reject unsupported, blank and null bindings on insertion. No public RPC, new client grant, RLS rule or financial command was added or widened.

The actual proposal and invoice components select terms by the saved record binding. Records read from a pre-118 schema have no version field and retain their existing legacy rendering. Unsupported explicit versions fail rather than silently displaying unrelated/current clauses. The internal identifier is not shown in the customer UI. Future wording requires a separately reviewed version and creation/revision workflow; ordinary edits cannot relabel older records.

This is a versioned rendering baseline, not a reconstruction of the wording originally accepted years ago. It does not replace historical PDFs or saved emails, and does not certify that every past document originally used today's clauses. Saved email payloads remain frozen under the existing delivery system. The current record-specific payment/debris, invoice-date, surcharge and undated-validity discrepancies remain open pending business policy decisions. Freezing this baseline does not approve or resolve those clauses.

## Verification

| Check | Result |
| --- | --- |
| CRM unit suite, Node 22.23.3 | 2,394 passed; zero failed/skipped |
| Focused document/branding/print tests | 18 passed |
| Historical/current staging-candidate tests | 19 passed |
| Installed-schema local terms upgrade | 30 assertions passed; candidate DDL and fixtures rolled back |
| Installed-schema local expiry regression after native 118 installation | 30 passed |
| Installed-schema staging terms candidate plus expiry regression | 30 + 30 passed; all DDL/data rolled back |
| Actual local/staging synthetic records through document renderer adapters | 4 cases passed |
| Fresh schema generation, independent check and offline contract | Passed |
| Isolated route types, TypeScript and optimized Next build | Passed |
| Final build/preview application source parity and whitespace check | Passed |

The local replay started a new seed-free disposable stack at the original 117 migrations. The test created eight existing draft/sent/approved/cancelled proposal and draft/sent/paid/void invoice records before applying the candidate inside one transaction. The void fixture used the existing begin/finalize lease commands. Every original field, timestamp, revision, custom instruction and financial value was unchanged after the added binding. Unsupported insertion/relabel attempts rolled back. Actual quote and standalone-invoice creation/retries ignored forged version fields and retained one draft; normal quote/invoice editing retained the binding and expected scope/totals. The private trigger stays invoker with empty search path, no direct API-role execution and no new authenticated column UPDATE grant.

After that transaction rolled back, the original migration was installed natively only on this new disposable local stack for schema generation and browser acceptance. Its ledger is 118; a repeat local upgrade changed nothing. The generated public contract adds only the two version columns (row/insert/update types). The schema manifest pins all original 118 migration sources. Historical migration bytes and staging candidates are unchanged.

The full component tests compare bound and pre-migration documents across six proposal and six invoice outcomes. Unknown/blank versions cannot silently borrow the legacy terms. Actual SQL-produced local/staging records also rendered identically with an explicit legacy binding and the pre-migration fallback; scope, $100 totals and source input were retained. These staging results use actual installed commands plus controlled renderer adapters, not a hosted staging app/browser deployment.

The isolated local browser loaded actual capability-authorized synthetic proposal/invoice records at 1280px and 390px. It found all five/thirteen clauses, the retained scope, one print control, no exposed version identifier, no horizontal overflow and an empty error log. Print, approval, pickup and payment actions were not submitted. Earlier PDF/keyboard acceptance remains documented in its original reports; this batch does not claim new native PDF or screen-reader certification.

## Staging and production boundary

ATS CRM Staging is still `gbyhdsuiqeslgjdnbqng`, at **117 migrations**, latest `20261023015338`. The complete candidate 118 and both synthetic suites ran inside a single rollback transaction. Fresh before/after checks pass the 117 maintenance contract: all native ledger rows and statements, 5,103 catalog objects, approval definition/permissions, 49 protected business/Auth/history sets, settings and the no-send Auth guard are unchanged. Automatic sending, appointment notices and recurring generation remain OFF. No email or provider request was made.

Staging advisor details remain the baseline: 33 [RLS/no-policy notices](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), 79 [authenticated definer execution notices](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) and one [leaked-password protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Those findings are unchanged, not resolved by this candidate; the final advisor read describes the restored 117 target.

No app deployment, production query/write, hosted setting/key change, customer communication or scanner change occurred. No production or application-hosting readiness flag was changed. Candidate 118 is deferred for separate permanent staging reconciliation. The 117 read-only verifier now accepts checksum-reviewed later source additions from the historical deferred inventory while continuing to require the exact 117 installed ledger/catalog/protected state. Unknown sources and altered bytes still fail; no install/deploy path was added.

## Files, evidence and next step

Application: `src/lib/documents/terms.ts`, `src/lib/documents/terms/legacy-2026-10-22.ts`, the two document components, and manual/generated database types. Database: migration 118 and `../../supabase/verification/document_terms_preservation.sql`. Tests: `tests/document-terms-preservation.test.mjs`, the legacy pre-change digest fixture and two existing renderer adapters. Maintenance changes: schema/deferred inventory and historical/current source-inventory checks. No layout, CSS, branding or user-facing terms were rewritten.

Sanitized receipt: `staging/CUSTOMER_DOCUMENT_TERMS_VERIFICATION_20261022.json`. Private evidence is `/Users/noelsierra/Documents/Codex/2026-10-22/customer-document-terms-preservation/`, including original source, native/local/staging SQL proofs, render results, unit/build/schema logs and `quote-terms-desktop.png`, `quote-terms-mobile.png`, `invoice-terms-desktop.png`, `invoice-terms-mobile.png`. Raw capabilities, credentials and synthetic fixture indexes stay outside Git. The temporary browser tab, preview and owned local stack are stopped; volumes and unrelated development services are preserved.

Next: perform targeted permanent staging reconciliation for migration 118. Then obtain the existing customer-review policy decisions before changing proposal payment/debris override precedence, invoice timing/penalties, surcharge disclosures, warranty or the missing-expiry default. This preparation does not silently choose those rules.
