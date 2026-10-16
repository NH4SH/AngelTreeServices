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
- `refund.created`, `refund.updated`, `refund.failed`
- `charge.refund.updated` (legacy compatibility)
- `charge.dispute.created`
- `charge.dispute.updated`
- `charge.dispute.closed`
- `charge.dispute.funds_withdrawn`, `charge.dispute.funds_reinstated`

## Payment States

ACH Checkout completion records a pending payment and a processing Checkout session. It does not credit the invoice. `checkout.session.async_payment_succeeded` changes that payment to succeeded and reconciles the invoice; async failure changes it to failed.

Stripe card and ACH records store invoice principal in `payments.amount_cents`. Provider collection, surcharge, fee, net, funding type, and refunds are separate fields. Invoice reconciliation uses net successful principal after principal refunds.

Pickup and mail choices update only the invoice preference and activity log. They never create a payment or reduce the balance. A failed office email does not roll back the saved preference.

## Refunds And Disputes

The local PR07 handler reads complete individual Refund objects after an invoice observation fence. Only succeeded refunds reduce paid principal; pending/failed/canceled/requires-action refunds remain tracked. Full successful refunds restore all principal; partial refunds allocate principal/surcharge using the existing integer-cent rounding. Failed or canceled refunds can restore the original payment's net credit without creating another payment. Surcharge activation remains unchanged.

Current dispute status is reconciled inside the same invoice transaction. A lost dispute reduces paid principal; won/pending status follows the existing net-principal convention. Observations are fenced so a delayed older read cannot overwrite newer committed provider state. Staff should still compare provider evidence and the CRM before making any correction.

These PR06/PR07 changes are verified locally, not deployed. A future authorized
release must coordinate migrations/callers, drain older financial handlers and
enable/verify the event subscriptions listed above. No Stripe Dashboard event
subscription, production flag, credential or provider configuration was changed.
See `apps/platform/src/lib/payments/ORDERED_PAYMENT_RECONCILIATION.md` for bounds,
manual request identities and rollout/rollback requirements.

## Rollback

Set `STRIPE_UNSURCHARGED_CARD_ENABLED=false`, remove Stripe keys to disable all online Checkout, or keep only ACH available by leaving Stripe configured and card disabled. Do not delete payment rows, token rows, or migration history. Existing manual payments remain available.
