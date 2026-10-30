---
name: Angel Tree Services file checks
description: Attachment review within the existing green-and-neutral CRM.
colors:
  forest: "oklch(0.285 0.068 154)"
  page: "oklch(0.987 0.004 154)"
  surface: "oklch(0.998 0.002 154)"
  charcoal: "oklch(0.215 0.008 154)"
  muted: "oklch(0.47 0.012 154)"
  border: "oklch(0.77 0.012 154 / 0.58)"
  border-strong: "oklch(0.64 0.018 154 / 0.62)"
typography:
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'
    fontSize: "14px"
    lineHeight: 1.42
  headline:
    fontSize: "1.85rem"
    fontWeight: 730
    lineHeight: 1.12
  title:
    fontSize: "1rem"
  label:
    fontSize: "0.82rem"
    fontWeight: 650
rounded:
  control: "10px"
  field: "12px"
spacing:
  tight: "0.5rem"
  section: "16px"
  row: "1.25rem"
  row-gap: "1.5rem"
components:
  action-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.charcoal}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "44px"
---

# File checks

## Overview

Mode: Operate. Scope: `/files`, its attachment-check control, and the Review file checks link used by original records. This is an ordinary extension of the existing CRM. The document-library and employee-workspace guidance remain the visual authority for their own surfaces; this file records only the implemented attachment-review pattern.

Staff find a held attachment, read its state, and take one contextual action. Keep the original record and its access permissions understandable. A passed check does not grant access or guarantee that a file is harmless.

## Colors

The frontmatter snapshots the shared CRM custom properties, rather than introducing a local palette. Forest identifies Apply and keyboard focus; neutral surfaces, charcoal content, muted explanations, and thin borders carry the rest of the page. Keep check states as readable text rather than adding a new badge palette.

**The Plain State Rule.** A file's state is named in words, independently of its action and access permission. Color is never the only signal.

## Typography

Inherit the shared system sans-serif family, body, page heading, field labels, and secondary-action typography. Keep the order File checks, factual explanation, labeled filters, attachment title, area and state, then action. Attachment titles wrap anywhere when needed.

The shared phone heading is smaller (1.55rem, line height 1.16, at 760px and below). The scoped input and select text is readable on phones (1rem at 720px and below). Do not introduce display lettering or a separate type scale for attachment states.

## Layout

Keep the inherited CRM frame and content width. The page moves directly from its ruled heading to Search, Attachment area, and Show controls, followed by one continuous attachment list. Filters use native controls and an explicit Apply action. Clear filters appears when a source, title, or area filter is active.

Each row puts title, area and plain state before its contextual action. Use the row spacing and gap in the frontmatter. Supporting text stays to a readable measure (65ch). On desktop the action region occupies the smaller of 40% and 24rem; at 720px and below, rows stack in reading order with the tighter gap. Shared phone styles stack the filters and make actions full width. Preserve wrapping titles and the shared touch target (at least 44px).

Pagination follows the list and uses ordinary Previous and Next links with the current page stated in text. Avoid inserting metric cards or a second panel hierarchy into this review flow.

## Elevation & Depth

The heading and record list are flat and separated by neutral rules. Reuse the existing field and action surfaces, borders, and restrained state transitions. Preserve the inherited inline success/error message treatment. The attachment extension adds no decorative shadows, gradients, overlays, or motion.

## Shapes

Use the shared softly rounded actions and the later shared form-field corners recorded in the frontmatter. List rows stay unboxed, with a rule between records. Preserve native input, select, button, and link behavior.

## Components

**Filters.** Keep visible labels above the title search and two selects. All three must show the implemented forest keyboard outline (2px, offset 3px). This scoped indicator protects the route from the inherited field outline reset. Retain the shell's visible keyboard focus for links and buttons.

**Attachment record.** Lead with the title, then the attachment area and one of the implemented labels: Waiting for a check, Checking file, Passed, Quarantined, Check unavailable, or Checks not enabled. These are facts within the record, not a new card or colored status system.

**Check file.** Offer an explicit secondary action only when retry is permitted. Disable it while pending and change its label to Checking file…. Keep returned feedback beside the action and announce it through the existing polite live message. When a held file cannot be retried, explain that the uploader or an administrator must check it.

**Open file.** Render the secondary link when the server's current result permits opening. Request the authenticated file route on click. If the check has passed but this account cannot open the file, state that plainly. File-check results never substitute for access authorization.

**Quarantine recovery.** Explain that the file cannot be opened and ask for a safe replacement through its original record. Do not offer a manual mark-clean override.

**Empty and unavailable states.** Reuse the shared empty-state and warning surfaces. Distinguish no visible attachments, no files waiting for a check, and a failed list request. Explain the available recovery: choose All attachments or refresh, as appropriate.

**Review file checks.** Reuse the existing secondary link within the original workflow. A record-specific link retains its source context and includes all of that record's attachments; otherwise the link filters by attachment area. Do not replace the original record's actions or workflow.

## Do's and Don'ts

- **Do** preserve the green-and-neutral CRM, native controls, ruled list, and plain state labels.
- **Do** keep phone controls at least 44px tall, input text readable, long titles wrapped, and keyboard position visible.
- **Do** keep pending, error, and recovery feedback beside the affected action.
- **Do** preserve the distinction between check state, retry permission, and open permission.
- **Don't** expose scanner credentials, queue leases, or infrastructure controls in this daily workflow.
- **Don't** imply every upload is checked or that a passed check grants access.
- **Don't** use this scoped document to revise the CRM shell, employee workspace, global tokens, or production activation policy.

Inherited drift is not canonized here: the document-library guide's original first-bucket scope predates this extension, and shared field styles contain an outline reset. Preserve the local visible-focus repair; changes to older documentation or global styles require their own scope.
