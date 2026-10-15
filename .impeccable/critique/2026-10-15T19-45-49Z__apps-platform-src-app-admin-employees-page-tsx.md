---
target: employee management
total_score: 27
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 2
target_identity: "file:/Users/noelsierra/Developer/AngelTreeServices-pr02-offboarding/apps/platform/src/app/admin/employees/page.tsx"
target_fingerprint: "sha256:905f6bcd9cc2e56d91ad549fbec8a4e05b5dfc3a015bc29a049e4300bdeae377"
target_path: /Users/noelsierra/Developer/AngelTreeServices-pr02-offboarding/apps/platform/src/app/admin/employees/page.tsx
timestamp: 2026-10-15T19-45-49Z
slug: apps-platform-src-app-admin-employees-page-tsx
closed: true
---
Method: dual-agent (A: /root/employee_critique_design · B: /root/employee_critique_evidence)

# Employee management critique

The redesign is substantially clearer. The remaining weakness is the meaning and outcome of actions: the interface needs to explain what changed, why a task is recommended, and what remains possible for an inactive employee. No application code, business records, permissions, migrations or production services were changed during this critique.

Mode: Operate. Target: apps/platform/src/app/admin/employees/page.tsx, with directory, detail, editor, onboarding, records, history, offboarding and account-control views inspected in the disposable local application.

## Design specificity

Crew, PPE, employment status and separate CRM/time-clock access make this appropriate for a working tree-service company. The warm paper, serif names and ruled rows are quieter than the previous form-heavy layout. Evergreen branding still connects the employee workspace to the rest of the CRM. The most valuable next improvement is clearer task meaning and recovery, rather than another visual identity change.

The bundled detector returned exit code 0 and exact JSON `[]`: zero mechanical findings and no false positives. Native screenshots, DOM inspection and source review supplied the workflow evidence. No browser overlay was available because the documented evaluation API is read-only.

## Heuristic score

This is an expert heuristic judgment, not a user-study result. All ten heuristics apply; none were excluded. Assessment A scored 28/40. Synthesis lowers error recovery by one point because Assessment B identified an unhandled offboarding-save result in source.

| Heuristic | Score /4 | Main observation |
| --- | ---: | --- |
| System status | 3 | Employee and access states are clear; some task results are not. |
| Real-world language | 3 | Mostly plain language; onboarding summary conflates two concepts. |
| Control and freedom | 3 | Back, Cancel and Escape work in inspected flows. |
| Consistency | 3 | Coherent rows, sections and disclosures; some lifecycle wording differs. |
| Error prevention | 3 | Required reasons and confirmations protect consequential actions. |
| Recognition | 3 | Identity/access stay visible; some daily-readiness information requires navigation. |
| Efficiency | 2 | Search/filtering help; comparing time-clock permission is per employee. |
| Minimalism | 3 | Much less clutter; mobile browsing still begins below substantial controls. |
| Error recovery | 2 | Onboarding has result messages; offboarding save lacks equivalent feedback. |
| Contextual help | 2 | Consequence copy is useful; inactive-account controls need prerequisites explained. |
| **Total** | **27/40** | **Acceptable; targeted workflow fixes needed.** |

## What works

1. Name, position, status, CRM access and time-clock access can be read before opening settings.
2. Deactivation confirmations name the employee, explain both access removals and retained history, require a reason, and provide reliable exits. Escape returned focus to the trigger.
3. Saved records come before entry forms. Native controls and disclosures reduce clutter while preserving capabilities. Inspected mobile fields and permission labels met 44px touch-height expectations; keyboard focus was visible.

## Priority issues

### P1 — Offboarding save does not reliably tell the user what happened

This is source-backed, not an induced failed submission. Onboarding reports action results through alert/status messages. Offboarding offers Saving… and revalidation, while updateSeparationItem ignores its update result/error and returns no user-facing result. A failed write therefore lacks a reliable task-specific recovery path. Source: apps/platform/src/app/admin/employees/actions.ts:246 and EmployeeActionDialog.tsx's EmployeeSubmitButton.

Fix: provide explicit success/error feedback, preserve the entered note after a failure, and confirm the write before recording successful completion. This needs a small result-handling change in the existing action; preserve its authorization and lifecycle boundaries. Suggested command: `$impeccable harden employee offboarding feedback`.

### P1 — History cannot explain who changed access or why

Both assessments observed event names and timestamps without actor, reason or before/after state. An owner investigating an access reversal cannot answer why it happened in this view. Parent source verification confirmed that the existing data query already selects actor_user_id and metadata_json, and the lifecycle command already records the reason and prior/resulting state. The current renderer displays only event type and timestamp. Sources: apps/platform/src/app/admin/employees/[employeeId]/page.tsx:839; apps/platform/src/lib/data/employees.ts:98; supabase/migrations/20261015042649_reliable_employee_offboarding.sql:1408.

Fix: present the recorded actor, reason and relevant access changes using existing authorized data. Do not dump technical metadata or expand visibility rules. Suggested command: `$impeccable clarify employee access history`.

### P2 — Employment status, checklist progress and historical offboarding are mixed together

In the disposable fixtures, “54 onboarding” counts unfinished checklists rather than employees whose status is Onboarding. Active Alex is shown at 0% onboarding, retains an offboarding checklist, and can open Start onboarding, which changes employment/access state. Retaining those tasks is correct; their presentation lacks the context that separates past work, incomplete paperwork and a new status transition. Sources: directory page.tsx:105 and [employeeId]/page.tsx:372,493.

Fix: name the summary Incomplete onboarding checklists; distinguish retained offboarding tasks from current recommended work; label the status-changing command clearly as restarting/changing onboarding. Keep every task and command available. Suggested command: `$impeccable clarify employee lifecycle wording`.

### P2 — Inactive accounts still advertise sign-in actions without explaining prerequisites

The inactive sample displayed CRM Disabled and Time clock Disabled while offering administrator promotion, editable permissions and an enabled Send reset email. The reset handler selects active profiles, so the visible action has a source-backed prerequisite the UI does not explain. No reset or permission change was submitted. Sources: apps/platform/src/lib/actions/access-requests.ts:456 and [employeeId]/page.tsx:443.

Fix: explain that reactivation is required before a password reset, and clarify when any retained-account permission edits take effect. Preserve existing server restrictions and legitimate account-management capabilities. Suggested command: `$impeccable harden inactive employee controls`.

### P2 — Daily readiness takes too much navigation on mobile

At 390×844, the first employee name began around y=725. The directory has no time-clock signal, so comparing several employees requires opening each record. On the mobile overview, Next steps follows all contact/employment/emergency/notes content. The desktop hierarchy is clearer than the mobile task order.

Fix: shorten the mobile pre-list area and show useful next actions earlier. Surface a compact time-clock signal where the existing user is authorized to read it; do not represent unavailable data as Disabled or expand permissions. Suggested command: `$impeccable adapt employee daily workflow`.

## Cognitive load and emotional journey

Two of eight checklist signals need attention: chunking and choice density. Thirteen onboarding tasks and seven advanced-filter dimensions remain large groups; the five section links also require mobile scrolling. Single focus, related grouping, visual hierarchy, one-at-a-time editing, retained employee context and progressive disclosure generally work. The counts are prompts to improve grouping, not a rule to remove useful options.

The entrance is calm and the access summary builds confidence. Confidence dips when an Active employee is simultaneously directed toward onboarding and offboarding. The consequential-action dialog is reassuring; the weak ending is History, where an important change is recorded without its explanation.

## Persona checks

- **New office administrator:** must reconcile Onboarding status, 0% checklist progress and Start onboarding before acting confidently.
- **Busy owner:** cannot investigate an access reversal or compare several employees' time-clock permission quickly.
- **Distracted crew leader on a phone:** must scroll through the directory controls before reaching people; next actions follow secondary detail.

## Minor observations and technical evidence

- Mobile section navigation scrolls within its own strip. The measured strip was 362px wide with 444px of content; Offboarding can be initially clipped. There was no document-level horizontal overflow.
- Some selected advanced-filter text truncates in the phone's two-column layout.
- Some permission vocabulary could use short descriptions; do not replace clear words with icon-only controls.
- Inspected mobile text inputs were about 46.8px high, selects 44px high, and input text 16px. Full permission-checkbox labels were at least 44px high; their smaller checkbox glyphs are not a tiny-target defect.
- Full screen-reader behavior, failed network writes and external delivery were not tested. The feedback issue above is explicitly based on source review.
- Fixture data is synthetic and unusually incomplete; no production data-quality conclusion is implied by the counts.

## Questions to consider

1. Should onboarding progress be shown separately from employment status, or should the summary count only employees currently in the Onboarding status?
2. Should the next pass address feedback/history/wording first, all five priority issues, or only mobile efficiency?

Evidence is retained at /Users/noelsierra/Documents/Codex/2026-10-14/pu/outputs/employee-critique/, including independent desktop/mobile screenshots and assessment-b-detector.json.
