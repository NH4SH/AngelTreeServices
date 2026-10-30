# Employee workspace

Mode: Operate. Scope: employee directory, employee records, editing, onboarding and offboarding. This does not replace the public website’s PRODUCT.md or the CRM navigation shell.

The daily task is to understand a person’s work status and access, then take one clear next action. Users include the owner, office administrator, estimator and crew leader. Field employees retain their existing self-service workspace and permission boundaries.

## Visual direction

Follow the CRM’s shared tokens in `src/styles/globals.css`: cool neutral page, white surfaces, forest-green actions, muted text, and standard borders. Use the inherited system sans-serif font with the CRM’s heading scale and weights. Use `--radius-panel` and `--radius-control` for grouped panels and controls; use the shared success, warning and danger colors. Employee styles must stay scoped and must not change the global CRM shell.

Use one panel per meaningful group, with ruled rows and native disclosures inside it. Avoid nested panel surfaces. The directory is one continuous list surface. Preserve the simplified workflows, explicit access states, reliable form feedback and all five critique fixes. Status must always have a text label.

The directory is a list, not a card collection. Keep search and employment status visible; put additional filters behind More filters. Move creation into its own view. Keep qualification settings out of daily browsing.

## Record hierarchy

1. Name, position, crew and employment status.
2. CRM access and time-clock access, shown separately.
3. A primary Edit employee action and a clearly named lifecycle action.
4. Overview, Onboarding, Records, History, and Offboarding section links. These are ordinary URL links with aria-current, not partially implemented ARIA tabs.
5. Rare account settings inside Sign-in & permissions. Preserve all existing account commands.

An overview is not a form collection. Keep task editors on their relevant section. Show saved records before creation forms. A checklist initially shows task names and states; open a task to edit it.

The editor prioritizes name, position, crew, status, email and phone. Employment details, number/photo, address/language, emergency contact and notes remain mounted in the same form inside native disclosures. Collapsing a section must never omit its values from submission.

## Consequential actions

Use a native modal dialog for deactivation, reactivation, archive and starting onboarding. Name the employee and explain the actual consequence. Deactivation copy covers CRM access, time-clock access and retained history. Reactivation copy covers retained roles/assignments and separate time-clock review. Keep provider/session/database details in technical documentation.

Reuse the existing server actions and result handling. Required reasons, pending submit states and confirmations are presentation safeguards; the server remains authoritative. Never report success based only on a button click. Offboarding checklist editors are owner/admin only, matching their existing server action; other authorized viewers can read task states.

## Accessibility and responsive behavior

Keep controls at least 44px tall. Use native disclosure and dialog keyboard behavior, named dialogs, required labeled reasons, visible focus, Escape dismissal and focus return. Block dismissing a confirmation while its submission is pending. Use live status/error messages. Body and muted text must meet 4.5:1 contrast; color never carries the only status signal.

Use full-width stacked layouts on phones, two columns only when useful space is available, and wrapping section navigation so every section remains visible. Form inputs are at least 16px on mobile. Keep reduced-motion users supported; avoid ornamental animation in critical access workflows.

## Constraints

Do not change effective-access decisions, RLS, lifecycle transactions, permission boundaries, financial behavior, audit history or external integrations as part of a visual pass. Reuse established server field names. Do not introduce a second authorization model in a client component.
