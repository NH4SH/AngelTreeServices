# Separate Firewood production profile implementation review

Prepared October 29, 2026. **The local Website and CRM implementation candidates pass their scoped checks. Keep activation off.** This is an implementation/review result, not a production installation or permission to collect money.

## Delivered

The Website has a separate live source, signing domain, complete accepted terms and price snapshots, immutable order/invoice identity, durable retry/recovery behavior and atomic held confirmation outbox. The CRM supplies the matching contract, authenticated invoice preparation/status/renewal, exact office-approval authority, separate reviewed SQL and collector guards. The three shared canonical modules match byte-for-byte.

The default Website runtime and the CRM live dependency loader remain unavailable. Environment flags cannot activate them. Actual database/release/credential/recovery bindings remain null. The Website test service accepts only an owned disposable database, in-process signed fixture transport and synthetic contacts. No live keys or production service were loaded or modified.

Full customer wording is part of the terms hash, and the browser submits the hashes it actually displayed. Multiline instructions are retained. A saved preference or browser return cannot establish payment. Lost preparation responses and restart retries retain one invoice. Refunds retain original paid evidence and hold repayment/fulfillment. First verified payment atomically captures one confirmation and two held messages; retries cannot send or duplicate them. The candidate has no email transport.

## Results

| Evidence | Result | Limit |
| --- | --- | --- |
| New Website profile | 16/16 passed | Isolated local database/fixtures; no real provider payment |
| Retained sandbox/staging handoff | 31/31 passed | Original `launch/` source hashes unchanged |
| Actual Website client → actual CRM handler | Prepare/replay/renew/status passed; one invoice, nine operations | In-process database double; zero network/provider/email calls |
| Public build and validation | 19 approved pages passed | New checkout candidate excluded from public artifact |
| Browser review | Desktop, 320px mobile, multiline details and saved order at 200% text passed; no horizontal overflow observed | Controlled isolated paid/refund fixtures; full enlarged-text form was not rechecked in this round |
| Design detector | No findings; no suppressions | Bounded review, preserving the inherited design |
| CRM-owned verification | 685/685 focused checks; typecheck, worktree and production-version focused build passed | Local SQL fixture; exact native concurrency/installation still pending |

The Website preview/database stopped cleanly with one synthetic order, one confirmation and two held messages. Zero emails were sent. Original sandbox/staging files and public SEO/estimate/analytics/consent inputs remain unchanged. The old sealed CRM capsule remains a historical inactive packet; it was not relabeled as this live implementation.

## Remaining before launch

- Finish and review office approval and coordinated cancellation/refund workflows. The CRM chat has begun this separately with direct owner approval; their completion is outside this report's tested snapshot.
- Rehearse the exact disabled CRM/Website installation with real native database permissions, concurrent access tests and preservation checks.
- Supply the guarded runtime/session/database/HTTPS bindings, actual live provider/shared receiver and source-aware confirmation sender. Verify account ownership, eligibility and surcharge support; do not activate from flags alone.
- Certify the actual new paired recovery topology, key custody and continuous off-device freshness within five minutes before writer admission.
- Obtain approval for the concrete installation and activation package. Keep orders, collection, sending, workers and public checkout promotion closed meanwhile.

No additional pricing clarification is needed for this implementation. No commit, push, production migration, deployment, subscription, live order/payment, credential creation or outgoing email occurred in this round.

Implementation notes: [live profile README](scripts/firewood-checkout/live/README.md). Complete dated evidence, source manifest and incremental diff: `/Users/noelsierra/Documents/Codex/2026-10-16/files-pasted-by-the-user-you/outputs/firewood-checkout/production-profile-implementation-20261029/REPORT.md`.
