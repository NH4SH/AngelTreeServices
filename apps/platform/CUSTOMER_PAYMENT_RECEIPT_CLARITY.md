# Customer payment receipt clarity

October 23, 2026. Local customer-experience follow-through based on current main `0a2d148`. Review-request draft safety is pushed to main. This receipt batch remains committed locally, pending a separate push/release request. No application was deployed and production was not changed.

## Change and preservation

The existing customer-experience review identified receipt traceability as an open P2 finding. The actual pre-change generated HTML omitted the recorded payment method and presented all facts as one paragraph. Source inspection also confirmed that the processor replaced a missing `paid_at` with the current time, making an absent historical payment date look like today's payment.

Receipts now show a readable table with invoice reference, recorded payment method/date, amount applied to the invoice, existing surcharge when present, total received, existing manual reference and remaining invoice balance. HTML and plain text carry the same facts. Missing/unknown methods and missing/invalid dates say **Not recorded**. No payment date is invented or backfilled. Card is labeled **Card**, without guessing credit/debit funding. Cash/check receipts say **Total received**, rather than claiming a card was charged.

The receipt uses the existing transactional email palette and central public business name, service description and office phone. It includes reply/call help, readable 16px text, a named data table with row headers, wrapping for long values and an ordinary keyboard-accessible phone link. No secure document token is minted and no new pay link or tracking image is added. Existing Stripe internal references remain withheld; manual references remain plain escaped text.

The processor change only reads the existing `payment_method` column and passes the recorded method/date to the template. Payment amounts, surcharge calculation, total collected, complete-principal balance calculation, successful-payment requirement, recipient selection and manual-reference rule are unchanged. No schema, migration, RLS, role, grant, Auth, credential, runtime, scanner or hosted setting changed. Employee UI, dashboard, prior customer work and the separate runtime branch at `06580f6` are preserved.

The other communications template bodies and the shared legacy branded renderer are byte-identical to the base. Their styling/content is outside this receipt batch. Test adapters were updated to inject the new presentation helper, without changing their scenarios or expectations.

## Duplicate and history safety

This is a future receipt presentation change, not a request to resend existing receipts. The source-event identities, stable `customer-communication/<id>` key, queue claims, frozen payloads, provider outcomes, history repair and delivery transactions are unchanged. Reprocessing a sent communication still makes no second transport call. Pending, processing, failed and refunded payments still cannot generate a successful-payment confirmation.

A focused test passes the new receipt through the real durable sender against an earlier accepted/uncertain frozen request. A changed payload remains a conflict; no provider dispatch or overwrite is permitted. The earlier saved content remains intact and may require the existing Delivery review workflow. No retry key is rotated to force a new message. These tests use controlled storage/transport adapters; no real email was sent.

## Verification

| Check | Result |
| --- | --- |
| Full CRM suite on patched locked dependencies | **2,428 passed**, zero failures/skips |
| New receipt regression tests included above | Ten tests covering facts, missing/invalid details, escaping, method mapping, processor behavior and saved-request conflicts |
| Route types, TypeScript and optimized build | Passed on Node 22.23.4 / Next 16.4.2 / React and DOM 19.2.9 |
| Isolated build environment | No copied environment files/provider credentials; zero external application requests |
| Installed staging database assertions | Eight passed; all synthetic records rolled back |
| Actual processor/template with staging-produced payment inputs | Seven scenarios passed using mock transport only |
| Actual generated-email browser acceptance | Recorded/missing/long Unicode cases, 390/768/1280px, no horizontal overflow, keyboard focus and no console errors |
| Text contrast and responsive markup | Checked palette pairs exceed 4.5:1; 16px facts/body text and semantic row headers |
| Source-copy parity, neighboring template preservation and whitespace | Passed |

The staging fixtures cover card with surcharge, ACH, check/reference, cash with a settled balance, missing legacy details, pending and refunded payments. They call the actual installed complete-principal routine and carry those returned records through the real processor/template. Successful cases retain the expected balance and stable identity on repeat; ineligible cases produce no receipt. The adapters retain synthetic party/queue context; this does not claim hosted staging HTTP, live RLS recipient certification or provider delivery acceptance.

Before/after staging evidence matches the existing exact 118 contract: native ledger, all 5,110 catalog objects/permissions, 49 protected business/Auth/history sets, immutable terms bindings, no-send Auth guard and settings. Automatic sending, appointment notices and recurring generation remain OFF in staging. `supabase/verification/customer_payment_receipts.sql` is rollback-only verification, not migration 119.

The focused Impeccable scan reported two font warnings, both intentionally retained: the new receipt and unchanged legacy renderer use the established Arial email-safe fallback stack. External webfonts would reduce mailbox compatibility and add network dependencies; no global detector suppression was added. Browser HTML acceptance is not Outlook/Gmail/Apple Mail, physical-device, 200% browser-zoom or assistive-technology certification. The phone link was focused and inspected, not dialed. Existing test-harness typeless-module notices are unchanged.

## Remaining work and evidence

Continue the existing customer-communications follow-up with remaining appointment-email contact/branding consistency and actual mailbox/device/assistive-technology acceptance. Contractual policy/override decisions in `CUSTOMER_TERMS_REVIEW.md` remain with the owner. This change does not choose business terms or modify payment behavior. The separate Netlify runtime follow-up remains separate; production's Node patch was not verified and no support message was sent.

Sanitized receipt: `staging/CUSTOMER_PAYMENT_RECEIPT_VERIFICATION_20261023.json`. Private evidence: `/Users/noelsierra/Documents/Codex/2026-10-23/customer-payment-receipt-clarity/`, including source preimages, build/test logs, rollback staging snapshots, processor evidence and generated HTML. Representative screenshots: `before-desktop.png`, `before-mobile.png`, `after-desktop.png`, `after-mobile.png`, `missing-mobile.png`, `long-desktop.png`. Raw logs/synthetic records stay outside Git. The owned loopback preview was stopped, its temporary tab closed and viewport restored after acceptance.

At the owner's subsequent request, this verified receipt batch was pushed normally to `origin/main` as `1f250dac4ae2605f15c06d19c87b7e52a397fdeb`. The verification receipt remains the historical pre-push record. No deployment, production change or customer send accompanied the push. Appointment-email branding/contact consistency continues locally in `APPOINTMENT_EMAIL_CONSISTENCY.md`.
