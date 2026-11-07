---
version: 1
slug: firewood-checkout
primary_target: scripts/firewood-checkout/checkout.html
related_targets: [scripts/firewood-checkout/checkout.css, scripts/firewood-checkout/checkout.js]
---

Mode: Operate. Local-only, uncommitted checkout prototype.

THESIS: Choose a cord size, add stacking, enter delivery details and see one
clear total before continuing to a test payment. No cart or customer account.
Quantity savings labels compare the delivered tiers with the equivalent amount
at the half-cord rate: full 25%/$150, two cords 30%/$360. A shared baseline note
states that these savings are included in the displayed prices, before stacking.
Keep the labels quiet and within the radio choices.

OWN-WORLD: Inherit the site's Poppins, deep green, cream, quiet separators,
native form controls and rounded green actions. No new imagery or visual identity.

STORY: Quantity and optional stacking lead; delivery details follow. The total
updates without resetting entered information. Cancellation and declines preserve
the order; a successful test clears its form fields while retaining the private
test record and confirmation previews.

FIRST VIEWPORT: Compact Angel Tree Services header, visible test notice, short
heading and the three approved cord amounts. Desktop has a quiet order summary beside the
form; mobile stays in one reading column with the total before payment.

FORM: Native radios/checkboxes, labeled contact and address inputs, optional
instructions, accessible status/error text. No delivery eligibility, distance, ZIP-area,
availability or scheduling gate. Address validation only checks field format.

BOUNDARY: Served only by a loopback-only local server. Nothing is added to the
normal public build or sitemap. An explicit local payment simulator works without
credentials. The optional Stripe adapter accepts a dedicated test key only,
never generic CRM credentials or live keys. No analytics/consent/CRM edits.

FACTS: Full cord $450 delivered; half cord $300 delivered. Two cords $840
delivered. Delivery is free/included for every size. Stacking adds $150 once per delivery,
including two-cord orders ($990 stacked total). The owner removed the checkout's
veterans checkbox and automatic reduction; published offer terms are unchanged. Wheelbarrow-accessible
stacking location within reasonable truck distance. Owner manages stock and
receives order notifications at info@angeltreeservice.org. Customers receive a
delivery date within one week of ordering and may call for specific scheduling.
Full refund for cancellation at least 48 hours before delivery; less notice is
non-refundable. Tax treatment and production order handling still need review.

## Current follow-up — October 25, 2026

The local test now implements the revised two-cord price with 30% savings and
no veterans control. The summary shows the wood price, delivery included and optional stacking;
price calculation is protected from stale discount requests. Choices and entered instructions
survive cancellation. Delivery/refund terms appear before the payment action.
This preserves the same visual world and responsive layout. The earlier dated
sections below record the previous review and do not describe the current
provider-test status: isolated Stripe card testing previously passed, including
the now-superseded discounted amount. The latest price revision has local
provider-contract and simulator verification; no new Stripe transaction.
Current free-delivery line-item evidence is under
`outputs/firewood-checkout/free-delivery-correction/` in the chat workspace.

## Final comparison and outcome — October 24, 2026

The implemented checkout extends the existing public-site world. Poppins,
primary green (#287228), deep green (#163f19), cream (#f6fbf2) and ink (#173a1b)
match current site styles. Quiet borders, white supporting surfaces, pill actions,
visible labels and 54px minimum fields carry the established form language.
The task-focused layout uses an 1120px wrapper, a desktop form with a sticky
summary, and a single reading column below 760px; choices and field pairs also
stack below 370px. It adds no imagery or shipping raster assets. Review captures
are evidence only, not public assets.

Reviewed captures: desktop, mobile and mobile-top; mobile at 320px with 200% text;
mobile decline and success; and desktop/mobile validation. The final validation
correction keeps the summary and places the structured server error beside the
affected field, with stable labels, `aria-invalid`, `aria-describedby` and focus
on that field. The finish review returned **pass**, disposition **ship**, for this
correction within the local-prototype scope. This disposition does not approve
live payments or a public release.

Recorded verification passed 239 existing Node tests, 9 existing Python tests
and 22 checkout tests, including all four price combinations. Browser evidence
covers keyboard controls, quantity/stacking changes, validation, decline,
cancellation, retry, successful detail cleanup
and the reviewed viewport/text sizes. Full cord remains $450 delivered, half cord
$300 delivered, and stacking adds $150 once per delivery. Address fields check
format only; no delivery eligibility gate is present.

The working payment flow is the explicitly labeled local simulator. The optional
Stripe test-only adapter passed mocked contract tests; no dedicated isolated
Stripe sandbox key was available, so the actual provider screen and a real
sandbox transaction remain unverified. Analytics, consent and CRM are unchanged.
The ordinary 19-page public build remains unchanged and contains no checkout
files, links or endpoints. No live payment, commit, push or deployment is included
in this outcome.

Preexisting documentation drift: PUBLIC_SITE_DESIGN_GUIDE.md lists primary green
as #2f8e2f, while overrides.css and site-pages.css use #287228. The checkout follows
the current styles. The guide and global design context were not repaired.

Final regression review, October 24: no UI, photo, wording, price or layout
changes. Two server-side payment-attempt timing failures were reproduced and
corrected; a stale verification cannot confirm a changed order, and returning
during replacement-session creation remains a valid draft. Checkout coverage
is now 24 tests; total coverage is 272 passing tests. Mobile browser review
reconfirmed all four totals, retained instructions after decline/cancellation,
and cleared details after simulated success. Actual Stripe sandbox testing and
the live-order business decisions remain pending.

## Durable local orders — October 25

Test orders now persist privately on this Mac, with a stable FW-TEST reference
and customer/owner confirmation captures. No email is sent. The result disclosure
explains that the form clears while the private test record remains. Keep the
confirmation behind a native details disclosure and use textContent for supplied
content. The customer preview requires its completed browser session; owner
records are available only through the private local CLI. Production storage,
backups and email delivery still need setup before release.

## Local CRM invoice status — October 25

The test receipt adds one quiet status paragraph: saved CRM test invoice, pending
sync, or office review. Keep it secondary to the test payment summary and preserve
wrapping for the long TEST-FW invoice reference at 320px/200% text. It never asks
for another payment. Customer and owner messages still use local captures, with
Website as their single authority. The browser-tested payment fixture is wholly
synthetic and separate from actual Stripe sandbox verification.
