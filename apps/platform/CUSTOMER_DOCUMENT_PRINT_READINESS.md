# Customer document print/save readiness — 2026-10-22

**Local verification is complete, including six actual Safari PDF exports.** This batch is saved locally and has not been pushed or deployed. Production remains unchanged.

The previous invoice-balance commit `99149c3` was pushed to `origin/main`. This work follows the customer-experience roadmap's print/save acceptance priority. It preserves the existing visual identity, financial calculations, terms and customer-response commands. No app was deployed or production changed.

## Changes

- Proposals and change orders now offer the same deliberate print/save action as invoices. Unavailable/throttled links expose no document or print action. Buttons remain keyboard accessible, have 44px targets and never submit a response/payment form.
- Change orders now identify their document as printable. The native baseline PDF had two pages with **no document heading or scope**, because the shared print rule hid the entire page.
- Customer-only print styles collapse interactive page sections, keep the document in normal paginated flow and retain its current status. Staff and schedule print styles are scoped out.
- Long scope text flows across pages in normal block layout. Change-order scope uses the full paper width with separate labeled pricing. Atomic inline blocks keep each contract definition together; Safari did not reliably paginate either grid rows or multicolumn terms. Paper metadata/footer spacing is compact without removing text.
- A short, accessible note explains how to turn off browser headers/footers when sharing a copy. Safari's baseline default included the full secure URL in its footer. The application cannot silently change that browser print option. No URL/history manipulation or new PDF service was introduced.
- The verified invoice balance still drives both customer payment review and the printable invoice. No invoice reconciliation, notification planning, link rotation, approval or payment command was added.

## Completed checks

- **2,321 CRM checks passed**, zero failures/skips. Typecheck and the final isolated optimized build passed. There is no lint script.
- Six short/long document cases from installed SQL passed locally and six in staging, including real change-order capability review and complete invoice principal receipts, followed by local React DOM rendering of those exported results. Hosted staging was not redeployed.
- Staging fixtures rolled back. Fingerprints of business/financial records, capabilities, Auth/roles, audit/delivery history and settings were unchanged. Ledger remains **116**. No migration, persistent grant/RLS change or new public RPC is required. Sending/appointment notice switches remain OFF in staging.
- All six final native Safari PDFs were exported through the actual customer print controls, rendered to page images and visually inspected. Full scope paragraphs (including all 80 repeated sentences in each long fixture), all contract terms, current status, and expected financial amounts survived. There were no blank pages, off-paper text, private capability URLs, print guidance or interactive controls in the final files with browser headers/footers disabled.
- The short proposal now fits on one page, including its footer. Final page counts: proposal **1 short / 4 long**, invoice **2 short / 5 long**, change order **1 short / 4 long**. Long fixtures deliberately include one scope item longer than a page; invoice terms remain complete rather than being shrunk to force one page.
- All **18** rendered views passed at **390, 768 and 1280px**, with no horizontal overflow, one printable region and one 44px print control. Mobile/tablet screenshots were inspected. All three print controls support keyboard focus with a visible outline and linked accessible privacy guidance. Browser error/warning logs were empty during the final responsive round.
- The final optimized build includes the Safari pagination fixes. All **622** tracked application source files (excluding Impeccable design metadata) match the verified preview and isolated build. The focused six print regressions also passed again after the final CSS edits.

## Final preservation and cleanup

- Safari's original **Print headers and footers = ON** setting was restored and verified by reopening its print dialog. The task-created Safari tab was closed; the original Fios Router tab was preserved. No physical print job ran.
- The in-app browser viewport override was reset and only its task-created tab was closed. Existing user tabs were preserved.
- All synthetic Auth actors in the disposable database were disabled. Only the owned `3146` preview and `ats_docmail_30e1592cbeea` test stack were stopped; volumes were retained. The user's existing application, primary database, and Lima VM were not stopped or reset.
- `origin/main` was fetched again and remains `99149c3`; this local batch includes that complete history. No force push, reset, merge to main, or new push occurred.
- Existing staging security-advisor findings remain unchanged: 33 RLS-without-policy info findings, 79 authenticated security-definer warnings, and one leaked-password-protection warning. This presentation-only change adds no schema, grant, RLS or Auth change and does not claim to remediate those existing findings.

## Evidence and limits

CRM production/staging published deploy IDs and hosting settings match the starting snapshots. No real provider request, customer email, production write, credential change or physical print job occurred. The user's main app/database and unrelated Impeccable artifacts remain intact.

Private evidence: `/Users/noelsierra/Documents/Codex/2026-10-22/customer-document-print/`. The accepted final files are `accepted-change_order-{short,long}.pdf` and `verified-{quote,invoice}-{short,long}.pdf`; `accepted-pdf-proof.json` records their SHA-256 hashes. Earlier `after-*`, `confirmed-*`, `final-*`, and `verified-change_order-*` files are intermediate evidence, not the accepted final set. Source, browser, Safari cleanup, hosting and disposable-service proofs are retained alongside them.

The staging project is `gbyhdsuiqeslgjdnbqng`; its SQL was tested with rollback-only synthetic records and the returned data rendered locally. This does **not** claim a hosted staging UI deployment. Native PDF output was verified in Safari on US Letter at 100%; other browsers, physical printers and paper sizes were not verified. The browser headers/footers option remains user-controlled, so the sharing guidance must remain visible.

Implementation files: the three `src/app/portal/{quote,invoice,change-order}/[token]/page.tsx` pages, `src/app/portal/customer-print.css`, shared `print-button.tsx` and `quote-document.tsx`, print fixture/regression/integration tests, the existing invoice test fixture, and `supabase/verification/customer_document_print.sql`. No migration is required. Synthetic PDFs and raw exported capabilities remain outside Git.
