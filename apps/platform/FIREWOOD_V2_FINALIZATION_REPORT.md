# Firewood v2 finalization report

October 29, 2026. **The existing production CRM is restored; Firewood v2 is verified in isolated financial tests and prepare-only staging. Live Firewood v2 remains inactive.** No feature push, merge or production feature deployment occurred. Remote `main` was independently verified at `f79f875`.

## Genuine financial verification

Eight genuine sandbox cases are preserved: surcharged US credit with refunds, debit, verified ACH settlement, 3D Secure, asynchronous card dispute, closed-bank failure, post-success ACH return/dispute, and a fresh normal ACH payment with pending then completed refund.

The last case has immutable actual CRM/Website observations: **paid revision 4 → paid-plus-pending-refund revision 5 → refunded revision 6**. Original paid proof remains intact. One payment and one completed attempt survived four duplicate genuine-event replays, with zero new attempts, customer emails or forced financial state. The separate documented fictional funding fixture has no customer/invoice receipt binding and is not counted as another CRM financial case. [Consolidated bank-refund proof](/Users/noelsierra/Documents/Codex/2026-10-29/firewood-finalization/refund/bank-refund-final-proof.json).

The narrow early-ACH-refund fix defers precisely bound pending refunds until original success without creating financial evidence or email work while unpaid. **141 focused assertions and full typecheck passed.** The [engineering review](FIREWOOD_INVOICE_HANDOFF_V2_REVIEW.md) retains the individual genuine outcomes and original four-case history.

## Final paired recovery and deadline

Final native checkpoint `fw-finalization-20261029-2c6437b29a18` restored **190 tables, 334 functions, 19 current capabilities, 28 total token rows and 8 payments** with matching data/catalog/permissions/history. The paired Website checkpoint retains **11 accepted orders: 9 bound and 2 unprepared, plus 5 confirmations**. Unprepared orders were not converted into invoices.

The actual independent deadline stopped only the restored clone at **270.217 seconds**, below the five-minute bound. The long transaction rolled back; cold restore and restart stayed closed. Native QA source/API and recovered-clone services were stopped with all data retained. The fresh encrypted off-device counterpart passed all nine bundle-file hashes, authenticated decryption, wrong-key rejection and tamper rejection. This rehearsal does not replace production kernel deadline enforcement or certify production key custody. [Restore proof](/Users/noelsierra/Documents/Codex/2026-10-29/firewood-finalization/recovery/final-native-d38a5e02413b/restore-proof.json), [fence proof](/Users/noelsierra/Documents/Codex/2026-10-29/firewood-finalization/recovery/final-native-d38a5e02413b/fence-proof.json), [off-device proof](/Users/noelsierra/Documents/Codex/2026-10-29/firewood-finalization/recovery/final-native-d38a5e02413b/off-device/off-device-proof.json).

## Actual managed and hosted staging

Managed staging retains **129 original application entries + 15 existing maintenance entries + installation `20261030005152`**, with original statement history preserved. Dedicated staging deploy `6ae3f7d8dbd1c2f51425e1a6` passed actual HTTPS/HMAC/backend binding, private invoice hold, static assets, first-gate/alias protection and collector denial. No provider credentials, scheduled workers or customer sending were enabled.

The same synthetic invoice is at capability version 4 with four retained tokens, three revoked and one active. Actual managed closed-subset pair `ca46ea2e-9b75-483b-968f-a1684aa6e84e` restored that state exactly: 17 FK references, 13 routine boundaries, four private RLS tables, immutable observation and all four privately decrypted capabilities. Five frozen-history/principal/line guards still reject changes. Its file manifest is empty; 289 unrelated staging objects were preserved and excluded. **This is not a full staging/customer/file recovery claim.** [Staging acceptance proof](/Users/noelsierra/Documents/Codex/2026-10-29/firewood-finalization/staging/STAGING_PREPARE_ONLY_ACCEPTANCE.private.json), [detailed staging record](FIREWOOD_V2_STAGING_PREPARATION.md).

## Current production restoration

The unexpected pre-existing outage came from an empty-file tar reader blocked on Docker stdin, its retained lock, and the independent backup deadline correctly fencing further writes. The separately approved bounded-archive/owned-lock repair restored the **same `8fa9df3` release, 102 migrations, Next 16.4.3 and existing services**. It did not install this feature.

Automatic independently verified backups and the existing worker gate are active under namespace `ats-home-continuous-7445a45dddd9`, generation 3; sequence 13 and public HTTP 200 were independently checked. During restoration, all **79 accepted deliveries, 1 cancellation and 82 idempotency aliases** retained their fingerprints, with **zero duplicate provider messages, new delivery records or manual financial/email actions**. The existing live bank payment was read-only verified as genuinely processing during recovery; no payment retry was issued. Scanner, VPN, credentials, schedules and history were preserved. The parent's independent final HTTP check also verified the live sign-in page, health endpoint and actual JavaScript/CSS assets. [Current production restoration](CURRENT_PRODUCTION_SAFE_RESTORE.md).

## Remaining release boundary

The focused **default-off 105-migration candidate** uses 142 business tables / 278 functions and passed its Next 16.4.3 build without private browser values or outbound compilation requests. It preserves the current production framework floor instead of deploying unreleased `main` wholesale. [Focused release review](FIREWOOD_V2_RELEASE_REVIEW.md).

**Verification and preparation are complete.** The inactive installer's actual database readback now checks normalized business structure, permissions, the trusted production write guard and all three required guard triggers on 142 tables. **31 operations tests and nine real rolled-back database mutation checks passed**, including a one-unit change to an integer sequence limit; the existing 102-migration path remains unchanged. The raw schema export remains provenance, rather than a caller-supplied substitute for observed metadata. [Schema-observer proof](/Users/noelsierra/Documents/Codex/2026-10-29/firewood-finalization/recovery/private-release/SCHEMA_OBSERVER_PROOF.json).

The sealed [inactive release capsule](/Users/noelsierra/Documents/Codex/2026-10-29/firewood-finalization/recovery/private-release/focused102-source-and-inactive-bindings.tar.gz) contains 1,222 verified files and the complete 60-file operations closure, including the backup repairs. SHA-256: `a7a6a9f933af08d8842d45c57b75803fe8e4c26f4bc5444a68f6e7107fe6d1e2`. Its application passed 362 focused tests and the optimized build/typecheck; archive readback and private-value scanning passed.

Live Firewood v2 still needs a separately implemented and reviewed production profile, terms/configuration, actual installation readback, fresh recovery authority and controlled rollout approval. The sandbox/staging adapter must not be relabeled as a live collector. New Firewood collection, surcharge handling and its customer communications remain off; the existing CRM's established automatic workers are restored. Future runtime identities remain unassigned and shared global staging flags remain false. No keys, capabilities, cookies or customer identifiers are included here.
