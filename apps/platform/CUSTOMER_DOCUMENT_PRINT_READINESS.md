# Customer document print/save readiness — 2026-10-22

**Final native-PDF confirmation is pending because the development Mac locked.** The implementation, automated checks and staging verification are complete. Do not treat the current final print stylesheet as fully PDF-verified or deploy this batch yet.

The previous invoice-balance commit `99149c3` was pushed to `origin/main`. This work follows the customer-experience roadmap's print/save acceptance priority. It preserves the existing visual identity, financial calculations, terms and customer-response commands. No app was deployed or production changed.

## Changes

- Proposals and change orders now offer the same deliberate print/save action as invoices. Unavailable/throttled links expose no document or print action. Buttons remain keyboard accessible, have 44px targets and never submit a response/payment form.
- Change orders now identify their document as printable. The native baseline PDF had two pages with **no document heading or scope**, because the shared print rule hid the entire page.
- Customer-only print styles collapse interactive page sections, keep the document in normal paginated flow and retain its current status. Staff and schedule print styles are scoped out.
- Long scope text can flow across pages. The final adjustment makes change-order scope full width with separate labeled pricing, compacts paper metadata/footer spacing and uses columns to keep terms intact.
- A short, accessible note explains how to turn off browser headers/footers when sharing a copy. Safari's baseline default included the full secure URL in its footer. The application cannot silently change that browser print option. No URL/history manipulation or new PDF service was introduced.
- The verified invoice balance still drives both customer payment review and the printable invoice. No invoice reconciliation, notification planning, link rotation, approval or payment command was added.

## Completed checks

- **2,321 CRM checks passed**, zero failures/skips. Typecheck and the final isolated optimized build passed. There is no lint script.
- Six short/long document cases from installed SQL passed locally and six in staging, including real change-order capability review and complete invoice principal receipts, followed by local React DOM rendering of those exported results. Hosted staging was not redeployed.
- Staging fixtures rolled back. Fingerprints of business/financial records, capabilities, Auth/roles, audit/delivery history and settings were unchanged. Ledger remains **116**. No migration, persistent grant/RLS change or new public RPC is required. Sending/appointment notice switches remain OFF in staging.
- The first native Safari round exported all six documents. All scope markers survived, every page contained text, no text exceeded paper bounds, and no private capability, print guidance or interactive action appeared with headers/footers disabled. Short change orders improved from two empty pages to one populated page. This round exposed a footer-only second proposal page and narrow long change-order scope; those were corrected afterward.
- Desktop browser checks of all six views passed at 1280px without horizontal overflow, with one printable region and one 44px print control per page. Mobile/tablet and keyboard confirmation for the new controls remain in the final pending browser round.

## Required before calling this batch verified

1. Unlock the development Mac manually. The computer-use tool explicitly reported it locked; no password is needed.
2. Export the six **final** PDFs as `confirmed-<kind>-<variant>.pdf` through the existing synthetic Safari tab. Inspect page images and repeat scope/amount/privacy/bounds checks on these final files. The earlier `after-*.pdf` files precede the last paper-layout adjustment.
3. Complete the final responsive/keyboard check and reset the in-app browser viewport.
4. Restore Safari's original **Print headers and footers = ON** setting, then close only the task-created Safari tab. The test jobs used OFF; restoration was interrupted by the lock.
5. Stop only the task-owned preview/database, disable synthetic actors and retain volumes. Recheck main and save the completed evidence. Do not push/deploy this new batch merely because its automated checks passed.

CRM production/staging published deploy IDs and hosting settings match the starting snapshots. No real provider request, customer email, production write, credential change or physical print job occurred. The user's main app/database and unrelated Impeccable artifacts remain intact.

Private evidence and resume instructions: `/Users/noelsierra/Documents/Codex/2026-10-22/customer-document-print/`. The task-owned loopback preview is `http://127.0.0.1:3146`; the user's existing `3138` app is separate. The staging project is `gbyhdsuiqeslgjdnbqng`; production was never a test target. Test PDFs contain synthetic records; the baseline PDF includes an intentionally synthetic secure URL and stays outside Git.
