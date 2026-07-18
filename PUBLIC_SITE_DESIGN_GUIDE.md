# Angel Tree Services Public Site Design Guide

## Purpose

This guide records the visual system already established by the public site. It is a preservation document, not a redesign brief. New public pages should feel like a natural extension of the current homepage.

## Brand Character

The public experience should feel:

- Confident, warm, and locally grounded.
- Premium without becoming corporate or ornamental.
- Calm and readable for older homeowners.
- Direct about the next action: call or request a free estimate.
- Credible through real work, verified credentials, and specific local knowledge.

Avoid generic contractor templates, stock-photo visual language, dashboard-style card grids, fake urgency, dense badge walls, and unsupported claims.

## Core Palette

The current public-site tokens in `overrides.css` are the source of truth:

| Role | Token / value | Use |
| --- | --- | --- |
| Primary green | `--ats-green: #2f8e2f` | Primary actions, selected controls, branded emphasis |
| Dark green | `--ats-green-dark: #1f5a22` | High-contrast green text and hover states |
| Deep green | `--ats-green-deep: #163f19` | Strong text and dark supporting surfaces |
| Soft cream-green | `--ats-green-soft: #f6fbf2` | Form cards and quiet supporting surfaces |
| White | `#ffffff` | Hero copy, action surfaces, dividers |
| Yellow | Existing logo/badge artwork and restrained verified-rating stars | Small trust accent; do not spread into unrelated UI |

Use white and cream to create relief from the green. Keep body copy contrast high. Do not mute the core green into gray-green or introduce unrelated blues/purples.

## Typography

- Primary family: `Poppins`.
- Hero: medium weight, large fluid scale, white, centered, with the established hand-drawn-style underline treatment.
- Body: light-to-regular Poppins with generous line height.
- Labels and action text: medium or bold where scannability matters.
- Navigation: lighter weight, restrained size.

Preserve “Your yard’s best friends.” as the visible brand line. SEO/service context should come from nearby supporting copy and page metadata rather than replacing the brand voice.

## Layout Rhythm

- Desktop content is centered within a wide page gutter and visually organized in full-width bands.
- Hero content uses a strong centered axis: headline, supporting copy, primary CTA, restrained trust block.
- Rounded action surfaces use very large radii (`pill` geometry) without multiplying pills for non-actions.
- Major section transitions use the existing white wave divider.
- Forms use a cream-white rounded card over green, with logical horizontal rows on desktop and single-column stacking on mobile.
- Keep section spacing generous but purposeful. Empty green space should not delay the next useful action.

### Measured Layout Tokens

| Element | Desktop behavior | Mobile behavior |
| --- | --- | --- |
| Site gutter | Approximately `4vw`, constrained by the exported `1500px` site maximum | Approximately `6vw`, with custom content using `20px` minimum side padding |
| Hero headline | `clamp(56px, 7.8vw, 112px)` | `clamp(36px, 9.5vw, 56px)` |
| Form controls | Minimum `54px` tall, `18px` radius | Same touch-friendly height; rows stack |
| Primary actions | Pill radius, wide centered treatment | At least `48px` tall and safe-area aware |
| Form card | Up to `980px`, cream-white surface, `26px` radius | Full available width, `20px` radius |
| Section content | Wide centered bands, generally `980–1180px` for custom content | Single column with no translated or negative horizontal offsets |

The exported Squarespace grid is not a reusable page-layout system. New static sections should use normal flex/grid flow inside a constrained wrapper so content height remains intrinsic.

## Reusable Patterns

### Primary CTA

- White surface, green label, subtle green border.
- On hover: green surface and white label, or a quiet cream-green refinement where the button is already inside a light card.
- Motion should be a short fade/color transition, not a directional swipe.

### Secondary CTA

- Quiet white/cream surface with green text and border.
- Must remain visibly interactive and keyboard focusable.

### Trust Block

- Centered beneath the primary hero CTA.
- One concise verified heading, then the existing ISA Member and ISA Certified Arborist images.
- No unverified qualification text, no fabricated badge, and no badge wall.

### Reviews, Recognition, and Press

- Present customer reviews, local recognition, and media coverage as distinct evidence within one restrained editorial system.
- Use aligned columns, typographic scale, and quiet separators rather than a logo strip or a grid of generic cards.
- A small yellow star line may support a verified aggregate rating, but the numerical rating and review threshold must also be written in text.
- Finalist language must remain visibly qualified; media coverage must never be styled or described as an endorsement.
- Video uses a responsive click-to-load facade and privacy-enhanced embed. Do not autoplay or load a full third-party player before interaction.

### Service Cards

- Real project photography in circular crops.
- Short service title, concise benefit copy, and one pill action.
- Hover should use the established fade between green and white rather than a wipe.

### Estimate Form

- Real labels remain visible above controls.
- Controls are large, rounded, and high contrast.
- Related decisions share a row on desktop and stack on mobile.
- Validation appears next to the affected field and in an accessible summary.
- Submission feedback receives focus; inputs reset only after confirmed success.

### Emergency Callout

- Concise, calm, and high contrast.
- Provides a phone link and a safe alternative request action.
- Warns visitors not to approach power lines without implying utility-line service or unverified 24/7 availability.

### Organic Section Divider

- Major green, cream, image, and footer bands meet through a shallow asymmetric wave with a white stroke.
- The wave is a section transition, not decoration inside a card.
- Use one full-width SVG with `preserveAspectRatio="none"`, a tinted fill matching the section above, and a white stroke between `7px` and `10px` depending on viewport size.
- Keep useful content clear of the curve by balancing the outgoing section’s bottom padding with the incoming section’s top padding. Do not solve overlap by adding a large empty spacer.
- Avoid stacking two unrelated waves at the same boundary or changing the existing divider paths without visual regression review.

### Static Interior Pages

- Use the shared `site-pages.css` system and generator in `scripts/build-public-pages.py`; do not copy the Squarespace export into each route.
- Keep the sticky translucent-green header, compact navigation, cream/white content bands, Poppins typography, rounded actions, and shallow white-stroked hero wave.
- Editorial heroes may use a two-column text/image layout when a truthful real image is available. Use a centered single-column hero when it is not.
- Interior-page body content should remain in normal document flow within the shared `1180px` content constraint.
- Process steps, FAQs, callouts, related links, and final CTAs are shared patterns, not page-specific inventions.
- At tablet/mobile widths the navigation collapses to an accessible native-details menu, hero columns stack, and quick actions remain safe-area aware.
- New service pages should feel calmer and more editorial than a contractor card template; cards support decisions rather than replacing the page hierarchy.

## Motion

- Use the existing underline draw and short color fades only where they communicate state.
- Respect `prefers-reduced-motion`.
- Avoid scroll-jacking, parallax, autoplay chat, directional pill wipes, and decorative motion that delays comprehension.

## Responsive Rules

- Desktop reference: approximately `1440px`.
- Tablet reference: approximately `1024px`.
- Mobile reference: approximately `390px`.
- Mobile actions must be at least `44px` high and must respect safe-area insets.
- No section may create horizontal overflow or rely on a negative horizontal translation.
- The form stacks to one column; the mobile action bar must not cover form controls, consent, or footer content.

## Accessibility Rules

- Maintain one meaningful page-level heading and a logical heading hierarchy.
- Use semantic links for navigation and calls, buttons for actions, and fieldsets/legends for grouped choices.
- Preserve visible focus states in the green/white palette.
- Decorative images use empty alt text; informative work images describe the work rather than stuffing locations/keywords.
- Keep success/error regions live and focusable.
- Never encode meaning through color alone.

## Content and Claims

Allowed only when currently verified:

- ISA Certified Arborist.
- ISA membership.
- More than 30 years of tree-industry experience behind the company.
- Angel Tree Services founded in 2015.
- Serving the Fredericksburg region since 2015.
- Founder with more than 20 years in the tree industry before establishing Angel Tree Services.
- Current Chamber membership.
- Local service-area statements supported by operations.
- Google rating and durable review-count threshold recorded in `PUBLIC_RECOGNITION_SOURCES.md`.
- Best of the Burg finalist status and category recorded in `PUBLIC_RECOGNITION_SOURCES.md`.
- Factual NBC4 Responds coverage recorded in `PUBLIC_RECOGNITION_SOURCES.md`.

Do not publish TRAQ, ratings, review counts, hours, licensing, insurance, guarantees, awards, or 24/7 availability without current evidence and owner approval.

## Asset Direction

- Prefer real Angel Tree Services work and team imagery already in the repository.
- Preserve original files when generating optimized derivatives.
- Provide intrinsic dimensions and responsive sources.
- Only the true hero image receives eager/high-priority loading; below-the-fold imagery is lazy-loaded.
