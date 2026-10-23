# Customer document branding and contact consistency

Verified locally and against rollback-only staging inputs on October 22, 2026. This batch is committed locally, pending push/release. No deployment or production change is authorized or performed.

## Result

Proposal response outcomes (`c67f0e3`) were pushed to main through `a2732f6`, preserving the concurrent public-site changes (`61d9d3c`). This batch builds on that shared main commit.

- A small public-only brand module supplies the established name, phone, website, region and service tagline. It contains no environment reads, credentials, internal recipients or provider settings.
- Proposal/invoice documents and newly generated single/combined proposal and invoice emails/previews use the existing configured `EMAIL_REPLY_TO` mailbox for their public contact. Plain text, HTML, composer previews and document footers agree. Display-name mailboxes are reduced to their address for display; malformed settings fall back to the established public mailbox. Mailto punctuation is encoded and HTML remains escaped.
- The established email default remains `info@angeltreeservice.org`; the website remains `angeltreeservices.org`. Their different spellings are preserved deliberately, rather than guessing a replacement address or changing sender/domain settings.
- Change-order printable documents now retain office contact details. Newly prepared change-order emails include the same public contact signature. Their existing source snapshot, atomic preparation, recovery-before-recomposition and saved delivery behavior remain intact.
- Shared proposal/invoice headers say “Tree service and landscaping.” The generic completed-job marketing invitation no longer advertises lawn care, following the owner's confirmed public-offering change. Historical lawn-care service enums, records and record-specific email descriptions remain intact.
- Document and composer footers wrap long public contact addresses. Portal recovery and reminder phone links use the same public phone source. Existing layouts, logos, scope/pricing presentation, action hierarchy and recovery behavior are retained.

## Preserved behavior

No contractual wording, price, discount, tax, surcharge, payment option, balance computation, document state, transaction, RLS policy, grant, capability, approval rule, schema, migration or retention setting changed. No provider credentials, `EMAIL_FROM`, `EMAIL_REPLY_TO` settings, internal routing or scanner configuration changed. Draft edits cannot replace the generated public contact mailbox. Old drafts remain compatible through the existing public fallback.

Saved delivery payloads/history are not rewritten. Existing recovery dispatches the frozen payload and envelope; a changed new composition cannot silently replace a previously prepared email. Already accepted/unknown deliveries still require the existing review/copy workflow. This batch sends no real or synthetic provider email and makes no duplicate-send authorization change.

## Verification

- **2,365 CRM checks passed**, zero failures/skips. Six new tests cover default/configured contacts, malformed values, encoded mailto punctuation, server HTML/text parity, uneditable contact fields, combined-link recovery, financial/scope preservation and the shared document footer. Existing change-order sending tests additionally assert the configured signature and retained financial/link facts. Targeted final send suite: 15 passed.
- Typecheck and an isolated optimized Next build passed. Source digests match the preview and build copies. No separate lint command is configured; `git diff --check` passed.
- Six short/long proposal, invoice and change-order inputs were created and read on **both the owned disposable database and staging `gbyhdsuiqeslgjdnbqng`**, with every acceptance transaction rolled back. Installed invoice principal remains $20 paid / $80 due; change-order original/additional/combined figures remain $500/$100/$600. All scope markers remain present.
- Exported installed records passed through the actual document/portal and email renderers using controlled adapters: seven TAP checks per target. This is staging database plus renderer verification, **not a deployed staging browser test**. No staging app deployment occurred.
- Before/after staging fingerprints match for business/financial records, notes/materials, work orders, delivery history, communications, source events, Auth/session and role rows, settings, routine definitions and migration ledger. Both staging sending switches remain disabled. The ledger remains 116 migrations, latest `20261022194856`.
- Real isolated local browser: all six documents at 1280px and 390px; no page or footer horizontal overflow. All three document types also passed the long-address phone check. Actual single-proposal/invoice and combined-proposal composer components show the configured contact; invoice HTML/plain-text preview switching and full-preview keyboard close worked. Composer fixtures are private preview-only routes, absent from repository/build source; no send button was submitted.
- Actual Safari PDF exports: short change order (1 page), long proposal (4 pages), invoice (2 pages), all with complete contact details and expected scope/financial facts. Private capability URLs and print-control help are absent from the saved documents. Last pages were rendered and visually inspected for clipping/overlap. Safari headers/footers were restored to on, backgrounds remained off, and the existing router tab was preserved.
- One mechanical design scan reported 24 incumbent global CSS findings, none on changed lines. They were not used to expand this focused batch into a redesign.
- Staging security advisors are unchanged: 33 RLS-policy notices, 79 authenticated security-definer function warnings and one leaked-password-protection warning. This batch does not resolve that existing baseline.
- Read-only Netlify snapshots confirm unchanged production/staging published deploys and build linkage. No production database writes, real provider calls, account/key changes, automatic sends or scanner changes occurred.

## Files and evidence

Application changes are limited to `src/lib/company-brand.ts`, customer draft/render/template plumbing, their server composer callers, shared document/contact components, the change-order document/signature and footer wrapping in `src/styles/globals.css`. Existing strict fixture dependency maps were updated for the new public module/config imports. New acceptance files are `tests/customer-document-branding*.mjs` and `../../supabase/verification/customer_document_branding.sql`; this SQL is verification only, not a migration.

Machine-readable summary: `staging/CUSTOMER_DOCUMENT_BRANDING_VERIFICATION_20261022.json`.

Private local evidence: `/Users/noelsierra/Documents/Codex/2026-10-22/customer-document-branding/`. Synthetic capability indexes, contact-test fixtures, logs and PDFs remain outside Git. Screenshots include `change-order-desktop.png`, `quote-mobile.png`, `invoice-mobile.png`, `change_order-mobile.png` and `invoice-email-preview.png`. Preview/build used local-only environment values and a non-deliverable `example.invalid` reply-to. Temporary preview routes were not committed. Owned preview/stack stopped after acceptance; retained volumes and unrelated local apps preserved.

## Remaining follow-up

Continue the existing customer-experience roadmap with owner-approved authoritative business/contract wording, followed by real mailbox-client, screen-reader and physical-device acceptance. This batch deliberately does not invent warranty, validity, debris, payment or other contractual policy. Mailbox clients and physical devices have not been certified by the browser/PDF checks. No new environment variable is required.
