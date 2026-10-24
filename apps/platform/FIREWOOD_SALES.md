# Firewood sales

Verified October 24, 2026. Implementation `fa84edf` was subsequently pushed to `main` at the owner's request; no production change or app deployment. The prior reminder-summary and record-history work is preserved. Main's independent homepage update `7386a9d` is included. Follow-through: `FIREWOOD_TAX_AND_TERMS_REVIEW.md` confirms the county exemption in the current published code and reviews the remaining terms work.

## Staff workflow

Open **Operations → Firewood** to browse existing firewood invoices or create one. Choose an individual customer and Virginia delivery address, or enter a new walk-in customer and address. Select full/half cords, adjust quantities and prices, and optionally add stacking. Confirm the buyer's qualifying domestic use before saving a draft invoice. Saving does not email the customer or take payment.

| Product | Editable starting price | Basis |
| --- | ---: | --- |
| Full cord, delivered | $450 | Per full cord |
| Half cord, delivered | $300 | Per half cord |
| Optional stacking | $150 | Per delivery, independent of cord quantity |

Defaults match the owner's existing `public-firewood.json`. Product descriptions retain the established wood mix, seasoning after splitting, approximate log length and stacking access requirements. Changing cord size restores that product's starting price; prices can then be overridden. Whole quantities from 1–100 are supported. No bulk discounts, pickup prices, delivery windows, inventory or fulfillment promises are invented.

The existing invoice editor, review/send flow, secure customer links, payments, printing, history and archive controls remain available. The delivery address now appears for standalone invoices in the staff preview, print document, customer invoice summary and generated email draft. An invoice-owned location takes precedence; historical job-linked invoices retain their location fallback. Portal queries include only public address fields, with existing capability expiry/revocation and party checks unchanged.

## Tax basis and limits

The owner confirmed that orders are taken at **5802 Ford Rd, Fredericksburg, VA 22407, in Spotsylvania County**. This household-use workflow records a $0 state/local sales-tax basis for qualifying domestic-fuel purchases. It requires staff to record the customer's confirmation for this purchase and residence; the customer being categorized as residential is not sufficient on its own.

Primary sources reviewed:

- [23VAC10-210-630](https://law.lis.virginia.gov/admincode/title23/agency10/chapter210/section630/) defines domestic consumption, the more-than-50% principal-use test, substantiation requirements and order-taking-place local sales-tax sourcing. Its published local-exemption list includes Spotsylvania and is expressly dated “as of 2014.” The initial implementation had not retrieved the county code. The follow-through review now confirms [current County Code §21-137](https://library.municode.com/va/spotsylvania_county/codes/code_of_ordinances?nodeId=COCO_CH21TA_ARTIVRESATA_S21-137EXCEENSO) in the August 28, 2026 publication; see `FIREWOOD_TAX_AND_TERMS_REVIEW.md` for evidence and scope. Recheck sourcing whenever the order-taking location changes.
- [Virginia Code §58.1-609.13](https://law.lis.virginia.gov/vacode/title58.1/chapter6/section58.1-609.13/) leaves local tax applicable unless the locality adopted an exemption.
- [Virginia Tax exemptions](https://www.tax.virginia.gov/sales-tax-exemptions) and [Form ST-15](https://www.tax.virginia.gov/node/408) provide the agency's domestic-fuel substantiation route. Staff confirmation is a sale record, not a signed ST-15. The dealer remains responsible for substantiating exempt sales.

The first wood line records the tax basis. The existing atomic command also stores an internal customer/property note with buyer-use confirmation, delivery address and the order-taking business location. Stacking is treated as an ancillary charge on that qualifying sale; stacking-only invoices are refused. No independent stacking-service exemption ruling is claimed.

Business use, landlord/rental-property purchases, organization purchasers and deliveries outside Virginia are held for separate tax review. A resident buying for their own rented home is distinct from a landlord buying for a rental operation. Taxable sales have not been enabled: the current native standalone-invoice and ordinary edit commands use zero tax, so they must be extended consistently before supporting a taxable Firewood workflow.

## Preservation and recovery

- Reuses `createInvoice` and `create_standalone_invoice`; no new financial transaction, migration, RLS policy, grant, provider transport or automated send path.
- Existing effective internal-staff authorization and caller-scoped property reads apply. The native command rechecks authority and property ownership when saving; browser totals are not financial authority.
- Full/half/stacking lines are validated before the existing invoice action. Unsupported products, stacking-only sales, malformed money, fractional/oversized quantities and oversized notes are rejected. The preparation is deterministic, preserving the original durable request and retry fingerprint.
- New customer, property, invoice, lines and note remain one atomic operation. Concurrent identical submissions or a lost response recover one original invoice; changing a committed request cannot overwrite it.
- Browser drafts have a separate Firewood recovery key. Product/price/customer-selection recovery remains available; the household-use checkbox must be confirmed again. Existing exclusions for new-customer contact details remain.
- Firewood browsing uses caller RLS, native 20-row pages, exact parent counts, stable creation/UUID ordering, a shared five-second deadline and one bounded out-of-range recovery. Errors remain distinct from an empty list. All invoices remain available through the existing invoice section.

The list currently identifies invoices by their standard full/half-cord line names. Renaming every wood line in the general invoice editor removes that invoice from this specialized list; it remains in All invoices with its history intact. A durable SKU/category would be a separate schema decision if catalog/inventory work is later requested. This batch does not reinterpret historical generic invoices as firewood.

## Verification

- **2,897** regular CRM checks passed, including **74** new focused Firewood/address cases; the separate manual-reminder safety suite passed **21**.
- **15 actual local Auth/API scenarios (16 TAP results)** exercised the real Firewood server action, existing invoice action and native command: default/overridden totals, concurrent saves, lost-response replay, changed replay rejection, atomic walk-in creation, full parent-count pagination, out-of-range recovery, read failures, delivery-location join, all staff roles and invalidated/forged/nonstaff sessions. No provider I/O.
- **40 native SQL assertions passed in each fresh local and staging environment**. Staging fixtures ran only inside rollback transactions. Exact pre/post schema, 123-entry ledger, 49 protected sets and OFF controls matched; staging remains at `20261024014934`. No migration or staging app installation was needed.
- Native/offline schema checks, framework security floor, type generation, typecheck and optimized build passed on Node 22.23.4 / Next 16.4.2 / React 19.2.9. No separate lint script is configured. Current main's public-site tests, build and validation also passed.
- Rendered browser checks covered the list/return path, automatic default changes, editable totals, required confirmation, fresh-tab draft recovery with reconfirmation, visible keyboard focus and Enter save, actual saved draft and delivery address, and widths 1440, 768 and 390 with no horizontal overflow.
- Impeccable's final manual detector found no issues in changed UI lines. It reported pre-existing shared-stylesheet findings outside this change, retained as evidence without redesigning unrelated screens.

Sanitized receipt: `staging/FIREWOOD_SALES_VERIFICATION_20261024.json`.
Private synthetic evidence: `/Users/noelsierra/Documents/Codex/2026-10-24/firewood-crm/`, including `firewood-desktop-final.png` and `firewood-mobile-final.png`. Only this task's preview and isolated local database are stopped afterward; their synthetic data is retained.

Staging verification is native rollback-only SQL with simulated caller claims, not a deployed staging application or hosted browser session. Browser viewport/keyboard checks do not replace physical-device, spoken screen-reader or real-mailbox acceptance.

## Existing roadmap and release follow-ups

This owner-requested sales entry follows the completed PR14 reminder-browsing work. Record-scoped document-email delivery/history browsing remains the next communications priority. The separate managed-runtime security checkpoint is untouched.

The current published county exemption is now confirmed. Before releasing Firewood, approve a separate product-appropriate invoice-terms version and the matching unfulfilled-order email wording identified in `FIREWOOD_TAX_AND_TERMS_REVIEW.md`. That review also flags the separate seller-side Forest Products Tax classification/filing question; a qualifying customer's $0 sales tax does not resolve ATS's processing/sourcing tax obligations. Existing immutable invoice terms—including labor warranty, payment timing and late-fee clauses—have been preserved exactly; no firewood-specific legal policy has been invented. Taxable sales, inventory and delivery fulfillment remain separate decisions if requested. No production data, configuration, key or customer communication changed in this batch.
