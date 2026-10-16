---
name: Angel Tree Services document library
description: Private operational documents within the existing CRM.
colors:
  forest: "oklch(0.285 0.068 154)"
  page: "oklch(0.987 0.004 154)"
  surface: "oklch(0.998 0.002 154)"
  charcoal: "oklch(0.215 0.008 154)"
  muted: "oklch(0.47 0.012 154)"
  border: "oklch(0.77 0.012 154 / 0.58)"
typography:
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'
    fontSize: "14px"
rounded:
  panel: "14px"
  control: "10px"
---

# Document library

## Overview

Mode: Operate. Scope: `/admin/documents`, its upload form, file-check feedback, and download action. This is a small extension of the existing green-and-neutral CRM, not a new visual identity. The CRM shell and the employee workspace design remain authoritative outside this route.

Staff should find a document, understand whether it can be opened, and upload or link a file without learning about scanner infrastructure. Keep file access classification and file-check state separate: a passed check does not grant broader access.

## Colors

Use the shared CSS custom properties in `src/styles/globals.css`. The frontmatter records the incumbent colors; it does not introduce route-specific tokens. Forest marks primary actions, charcoal identifies content, muted text explains secondary details, and neutral surfaces and borders group records. Every file-check state has a text label; color is never its sole signal.

## Typography

Inherit the CRM system sans-serif stack, page heading, card title, field label, and muted helper styles. Keep the established hierarchy: Documents, document title, labeled facts, then actions. Mobile inputs, selects, and textareas use at least 16px text through the scoped stylesheet. Do not add a display typeface or a competing heading scale.

## Layout

Preserve the search/type filter row, record list, and upload aside. The shared CRM grid uses the available desktop width and stacks for smaller screens. Labels sit above upload controls. Actions wrap, and long titles and uploader details stay within their record.

The upload form uses the existing CRM form layout rather than an undefined form class. Its employee-sensitive checkbox is a compact horizontal control with its own label; it must not inherit the full-width text-input geometry. The scoped stylesheet keeps document actions at the shared 44px touch target and mobile form text readable.

## Elevation & Depth

Retain the CRM's white surfaces, subtle borders, and existing shadow treatment. File-check states do not need additional cards, alert stacks, decorative gradients, or overlays.

## Shapes

Use the shared panel and control radii. Later shared form styles supply the incumbent 12px form-control corners; do not override them with a separate document theme. Preserve native select, date, file-input, checkbox, and link behavior.

## Components

**Document record.** Retain title, type, Staff/Restricted classification, linked record, uploader, upload date, expiration, and archive action. Add one labeled File check fact within the existing details grid.

**File-check state.** Use the implemented plain labels: Passed, Checking file, Quarantined, Check unavailable, and Not checked yet. When checks are enabled, held files have a short explanation instead of a download link. Quarantined files ask for a safe replacement. Do not offer a manual “mark clean” action.

**Check file.** An explicit retry stays beside the affected record. Disable its submit button while pending, change its label to Checking file…, and announce its result through the existing live message pattern. Preserve the server's authorization and scan decisions.

**Open / download.** Request the download route when clicked, using the existing authenticated session. The server checks current access and issues a 60-second signed URL; the page does not preload signed links for the entire list. A visible link is not the authorization boundary.

**Upload.** Retain required title, type, optional linked record and expiration, restricted classification for authorized users, accepted file types, and the 25 MB limit. Preserve pending/error/success feedback and successful form reset. Copy must accurately distinguish enabled file checks from workspaces where checks are not enabled.

## Do's and Don'ts

- **Do** reuse the existing shell, tokens, CRM form, record details, and secondary actions.
- **Do** keep classification, file-check state, and download availability understandable as separate facts.
- **Do** keep pending and error feedback next to the action that produced it, with keyboard-accessible native controls and visible focus.
- **Don't** describe a passed check as a guarantee that a file is harmless.
- **Don't** expose scanner credentials, leases, hash comparisons, or infrastructure choices in everyday UI.
- **Don't** imply all CRM uploads are scanned. The first guarded bucket is `platform-documents`; employee-file, equipment-file, and receipt flows remain outside this extension.
- **Don't** treat this local UI as production activation. The migration defaults file checks off; only the disposable review environment enables them during this work.
