# Stripe Surcharge Compliance Checklist

This operational checklist is not legal advice. Obtain current legal, card-network, acquirer, and Stripe guidance before approval.

Production surcharge activation must remain off until every item is reviewed, evidenced, and signed below.

- [ ] Stripe confirms the production account is eligible for automatic Checkout surcharge.
- [ ] The required preview API version and installed Stripe SDK support are verified in test mode.
- [ ] The approved rate is recorded: ____ basis points (maximum configured limit: 300).
- [ ] The rate does not exceed the actual cost of card acceptance or any applicable legal/network cap.
- [ ] Virginia disclosure requirements have been reviewed.
- [ ] Visa acquirer notice and operating requirements have been completed.
- [ ] Mastercard requirements have been reviewed and completed.
- [ ] American Express requirements have been reviewed and completed.
- [ ] Discover requirements have been reviewed and completed.
- [ ] Debit and prepaid cards are automatically excluded by Stripe.
- [ ] Apple Pay and Google Pay treatment follows the underlying funding type.
- [ ] Checkout shows invoice principal, exact credit-card surcharge, and total before confirmation.
- [ ] Stripe receipt and Angel Tree Services wording identify the amount as a credit-card surcharge.
- [ ] Full refunds return the full surcharge.
- [ ] Partial-refund allocation and rounding have been tested and approved.
- [ ] Staff training and customer support guidance are complete.
- [ ] Production test evidence is attached.

Approved by: ____________________

Role: ____________________

Approval date: ____________________

Current application gate: `STRIPE_SURCHARGE_ENABLED=false`. Changing this variable does not activate surcharge code in the current release; implementation must first be updated against Stripe's approved account/API contract and reviewed again.

References: [Stripe automatic surcharge for Checkout Sessions](https://docs.stripe.com/changelog/dahlia/2026-04-22/checkout-sessions-automatic-surcharge), [Stripe card-not-present surcharge configuration](https://docs.stripe.com/changelog/dahlia/2026-03-25/card-not-present-payments-surcharge-configuration-options).
