# Invoice Payment Options Implementation Report

## Delivered

- Four accessible customer choices: recommended ACH, card, pickup, and mail.
- Token-validated, service-role-only preference recording with repeat-selection deduplication.
- Office email attempts for pickup/mail without creating a payment or changing invoice status.
- Stripe ACH Checkout with pending, asynchronous success, and asynchronous failure states.
- Principal/provider-total separation, Stripe fee/net and card-funding metadata, refund reconciliation, and dispute activity.
- Staff invoice display for preference, selection time, processing/accounting details, and refunds.
- Responsive 320-430px chooser styles and server-rendered mailing instructions.

## Files And Migration

Migration: `supabase/migrations/20260718200940_invoice_payment_options.sql`.

Primary code is under the invoice portal API/page, `src/lib/stripe/invoice-checkout.ts`, the Stripe webhook, payment reconciliation, invoice admin detail, and the invoice document component. Environment examples and deployment instructions were updated.

## Surcharge Status

Blocked and disabled. Stripe's automatic Checkout surcharge is preview/account-gated, account eligibility cannot be proven from the repository, and `stripe@22.3.2` does not expose a Checkout surcharge parameter. The implementation therefore does not calculate a browser fee, ask the customer to classify a card, or surcharge all cards. Card is unavailable by default; an owner can explicitly approve the existing unsurcharged flow with `STRIPE_UNSURCHARGED_CARD_ENABLED=true`.

## Notification And Privacy

Offline notices include invoice number, contracting-party name, balance, selection, and an admin URL. They exclude raw portal tokens and financial details. Preference saving survives notification failure and the customer receives safe call-the-office guidance.

## Validation And Evidence

Typecheck, build, local Supabase reset/lint, and diff checks are recorded in the task result. Stripe CLI live webhook evidence and authenticated screenshots require test Stripe credentials and an eligible seeded invoice; they are deployment-gate items, not fabricated here.

## Rollback

Disable card with `STRIPE_UNSURCHARGED_CARD_ENABLED=false`; remove Stripe keys to disable hosted Checkout. Keep the migration and historical payment metadata. Offline preferences and manual payments remain independent.
