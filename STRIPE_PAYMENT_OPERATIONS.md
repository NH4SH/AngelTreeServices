# Stripe Invoice Payment Operations

## Configuration

Apply `supabase/migrations/20260718200940_invoice_payment_options.sql` intentionally. Do not apply it automatically from an application deploy.

Required server settings:

```env
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
APP_BASE_URL=https://admin.angeltreeservices.org
STRIPE_CREDIT_SURCHARGE_BPS=300
STRIPE_SURCHARGE_ENABLED=false
STRIPE_UNSURCHARGED_CARD_ENABLED=false
BUSINESS_CHECK_MAILING_ADDRESS=
```

Subscribe the production webhook to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `payment_intent.payment_failed`
- `charge.refunded`
- `charge.dispute.created`
- `charge.dispute.closed`

## Payment States

ACH Checkout completion records a pending payment and a processing Checkout session. It does not credit the invoice. `checkout.session.async_payment_succeeded` changes that payment to succeeded and reconciles the invoice; async failure changes it to failed.

Stripe card and ACH records store invoice principal in `payments.amount_cents`. Provider collection, surcharge, fee, net, funding type, and refunds are separate fields. Invoice reconciliation uses net successful principal after principal refunds.

Pickup and mail choices update only the invoice preference and activity log. They never create a payment or reduce the balance. A failed office email does not roll back the saved preference.

## Refunds And Disputes

Stripe Dashboard refunds are reflected by `charge.refunded`. Full refunds restore all principal; partial refunds allocate the provider refund proportionally between principal and surcharge using integer-cent rounding. Surcharge is currently always zero because production surcharge is disabled.

Dispute creation and closure add invoice activity without automatically changing accounting. Staff must review the Stripe Dashboard and CRM invoice before making any manual accounting correction.

## Rollback

Set `STRIPE_UNSURCHARGED_CARD_ENABLED=false`, remove Stripe keys to disable all online Checkout, or keep only ACH available by leaving Stripe configured and card disabled. Do not delete payment rows, token rows, or migration history. Existing manual payments remain available.
