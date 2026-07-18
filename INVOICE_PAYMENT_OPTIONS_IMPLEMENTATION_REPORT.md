# Invoice Payment Options Implementation Report

## Summary

This branch adds a customer-facing “How would you like to pay?” step to the secure invoice portal.

Available choices:

- Bank account (ACH) — recommended, no card surcharge, delayed confirmation
- Debit or credit card — Stripe-hosted card entry
- Cash or check pickup — records a customer preference for office follow-up
- Check by mail — records a customer preference for office awareness

Choosing an offline method does not mark an invoice paid. Staff still record cash and check payments after funds are received.

## Stripe behavior

Card and ACH payments use separate Stripe Checkout Sessions:

- card: `payment_method_types: ["card"]`
- ACH: `payment_method_types: ["us_bank_account"]`

The CRM remains the invoice and balance source of truth. Amounts are calculated on the server from the current invoice balance.

ACH Checkout completion is treated as processing unless Stripe reports it paid. The invoice becomes paid only after an authoritative successful webhook.

## Credit-card surcharge safety gate

This branch does not manually add a percentage fee to generic card Checkout Sessions.

Reason: the business may surcharge eligible credit cards, but debit and prepaid cards must not receive that surcharge. The card funding type is not safely established by a customer selecting a button before entering the card. A manual blanket card fee would therefore risk charging debit cards.

Before production activation of a credit-card surcharge, confirm that the Angel Tree Services Stripe account has a supported automatic-surcharge capability that:

- determines credit versus debit/prepaid authoritatively
- applies the surcharge only to eligible credit cards
- displays the surcharge before confirmation
- excludes debit, prepaid, and ACH
- records principal and surcharge separately

Until that capability is confirmed and implemented, card Checkout remains unsurcharged. ACH is presented as the recommended lower-cost option.

## Offline preferences

Endpoint:

`POST /api/portal/invoice/[token]/payment-preference`

Supported values:

- `cash_check_pickup`
- `check_mail`

The endpoint validates the portal token and invoice status, then writes a non-blocking activity-log event:

`customer_payment_preference_selected`

No payment record is created and the balance is not changed.

The portal does not publish a mailing address because the current remittance address has not been confirmed for public display.

## Database migration

`supabase/migrations/20260718194000_invoice_payment_method_choices.sql`

Adds:

- `invoice_checkout_sessions.payment_method`
- allowed values `card` and `ach`
- Checkout status `processing` for delayed methods
- an invoice/method lookup index

The existing one-active-session-per-invoice index remains in force. Switching methods expires/cancels the previous active Checkout Session before creating another.

## Files changed

- `apps/platform/src/app/portal/invoice/[token]/page.tsx`
- `apps/platform/src/components/invoice-portal-payment-button.tsx`
- `apps/platform/src/components/invoice-portal-payment-button.module.css`
- `apps/platform/src/lib/payments/portal-methods.ts`
- `apps/platform/src/app/api/portal/invoice/[token]/checkout/route.ts`
- `apps/platform/src/app/api/portal/invoice/[token]/payment-preference/route.ts`
- `apps/platform/src/lib/stripe/invoice-checkout.ts`
- `apps/platform/src/app/api/stripe/webhook/route.ts`
- `supabase/migrations/20260718194000_invoice_payment_method_choices.sql`

## Required verification before merge

This connector environment could inspect and update repository files but could not run the local application or database. Run locally before merge:

1. Apply the migration to a local Supabase reset.
2. Run `npm run typecheck` in `apps/platform`.
3. Run `npm run build` in `apps/platform`.
4. Test card Checkout in Stripe test mode.
5. Test ACH submission, processing, success, and failure events.
6. Confirm changing from ACH to card expires the previous open Session.
7. Confirm offline preferences add one useful activity event and never change balance.
8. Confirm paid, void, draft, and zero-balance invoices reject payment attempts.
9. Confirm portal view tracking still works.
10. Confirm no surcharge is charged to debit or prepaid cards.

## Not deployed

No deployment, production migration, Stripe Dashboard change, webhook subscription change, or live payment was performed.
