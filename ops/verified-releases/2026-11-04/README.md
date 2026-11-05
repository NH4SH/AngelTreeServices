# November 4 verified repair provenance

This directory preserves exact reviewed source from the live handoff/customer repair, live availability repair, and frozen cancellation/notifications candidate. `MANIFEST.json` records hashes. It is a provenance overlay, **not a runnable deployment bundle or an automatic override of the active application**.

The active forward-port is based on `665b67f`, retaining main’s 129-era application behavior. It does not replace the 194 runtime files that differ from the live 102-era source. The `frozen-app-overlay` has the exact eleven changed application files from the frozen 702-file cancellation/notifications candidate. Its frozen image and full source manifest identifiers remain separate from this branch’s test build. Do not copy those complete files wholesale over main.

The active app includes the notification fix, Firewood office/cancellation commands and UI, coordinated checkout-closure helper, pure handoff contracts/handlers/routes, and the exact fixed-path release-admission and protected handoff/office adapters. Their root-owned readonly mount, schema/source, key, recovery-signature, worker-release and fresh lease checks are unchanged. They stay closed for an unenrolled build; current main has not been enrolled for the live Firewood schema/profile. Collector, portal/card and receipt integration still require a reviewed forward-port against the 129-era source plus actual schema/key/recovery enrollment. The existing main payment modules were not replaced by the older frozen copies. This branch is not a complete live Firewood release. Do not enable it by an environment switch or reuse a 102-era certificate. The review SQL under `supabase/review/firewood-live` is reference/test input, outside the migration ledger, and is not an installer. No SQL was applied to a hosted or primary database by this consolidation.

The generic controller in `apps/platform/scripts/home-hosting` retains main’s service model and receives the tested kernel-lock fix. `availability/primary-controller.production.mjs` preserves the exact live profile-aware controller; it is not silently substituted for main’s generic controller. The paired edge/gateway signature allowlist and safe worker diagnostics are forward-ported actively. No timers, host services or provider configuration are changed by this directory.

The three customer-checkout files are exact already-live simplification source. The public landing page already resides on main; the independent customer checkout service’s full source is preserved on `codex/firewood-launch-source-20261030` (`1586ba9`). That broad archival branch is not suitable for a wholesale merge into active source.

No credentials, private runtime bindings, customer rows, estimate-photo work or new fulfillment workflow are included. Every copied file is inert unless separately used by a reviewed packaging process. This consolidation performs no deployment, migration, replay, refund, email or payment.

## Publish boundary

Both Netlify projects watch this repository’s `main`. The admin project is locked; the public website is not. The tracked workflows run regression checks on pull requests/manual dispatch, and the existing health monitor runs on a schedule/manual dispatch. No tracked push-triggered home-Mac deployment workflow was found. This does not establish the cause of any historical outage or rule out provider/external hooks.

Keep `[skip netlify]` on any integration/merge commit until a deliberate deployment is approved. Do not disable useful regression CI. The original development worktrees and frozen release candidate remain untouched.

The separate collector follow-up is documented in `apps/platform/FIREWOOD_COLLECTOR_FORWARD_PORT_REVIEW.md`. It adds narrow active hooks while retaining all original gate/catalog bindings. This provenance overlay and the frozen maintenance image remain unchanged, and no 129-era runtime is activated by that source work.
