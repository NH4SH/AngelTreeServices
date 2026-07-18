# Stripe Payments Implementation Report

The platform uses Stripe-hosted Checkout, server-calculated full invoice balances, signed webhooks, and idempotent provider identifiers. No card or bank details are stored in the CRM.

The July 18, 2026 payment-options migration adds separate principal, surcharge, provider total, fee, net, funding, and refund fields. `amount_cents` remains invoice principal so surcharge cannot over-credit an invoice.

ACH uses `payment_method_types: ["us_bank_account"]`. Checkout completion is processing only; asynchronous success is authoritative. Card Checkout uses `payment_method_types: ["card"]` only when `STRIPE_UNSURCHARGED_CARD_ENABLED=true` has been explicitly approved.

Automatic credit-card surcharge is not active. Stripe's automatic Checkout surcharge is a public-preview, account-gated capability, and the installed SDK does not expose a typed Checkout surcharge parameter. The application does not fake a fee, trust customer card classification, or move global Stripe calls to a preview API version.

See `STRIPE_SURCHARGE_COMPLIANCE_CHECKLIST.md` and `STRIPE_PAYMENT_OPERATIONS.md` before production changes.
