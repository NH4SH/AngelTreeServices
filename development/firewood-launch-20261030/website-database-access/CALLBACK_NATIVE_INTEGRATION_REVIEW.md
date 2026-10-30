# Native callback integration follow-up

The separate fresh owned Unix-only PostgreSQL 17.11 rehearsal passed all 12 permission groups and six additional callback cases. The native cluster is stopped, its three temporary native login roles are NOLOGIN, and synthetic data is retained. No HOME, scanner, production, provider, or actual recovery authority was touched.

The six cases used the real `fwofficev2_native_context()` SQL helper, genuine request SESSION_USER, the current Website `createNativeDatabase()` transaction adapter, the original Ed25519 native-WAL receipt validator, and the current `combineNativeAdmission()` comparison. The test bridge generated an in-memory signing key and descriptor bound to the owned database's SID/boot/topology/epoch/capture facts. It did not create or mount production control files, use a real signing authority, or certify an off-device backup.

- A stable matching native/signed-test context allowed the transaction to commit.
- Pausing after native SQL but before the second context read rejected admission before business work ran.
- Pausing after a business write caused the actual adapter's pre-COMMIT check to reject and roll back the write.
- A coherent mode change between callback reads required retry even with status still enabled.
- A native capture hold after the write rejected pre-COMMIT admission despite an unchanged valid signed-test receipt.
- Closing the native lease after the write likewise rejected and rolled back.

`NATIVE_CALLBACK_INTEGRATION_PROOF.json` preserves the exact callback/validator/Website source hashes, detailed passing cases, original guard definitions, 25-role fixture preservation matrix, final role state, and stopped-cluster identity. Earlier baseline and failed driver-import proofs remain preserved separately. The current `ACCESS_MATRIX.json` was repinned after the Website owner narrowed its general native factory to request/worker roles; health uses its distinct helper. The table/query privilege surface did not change.

`verify-review-artifacts.mjs` now verifies the newer proof: 15 Website tables, 57 exact column grants, 78 runtime SQL literals, 12 native permission groups, and six callback groups. This still does not claim that the 25-role fixture equals the actual 30-role live catalog, that all original 175 tables have been replayed, or that the complete 25-table CRM+Website production postimage is enrolled and recoverable. Those are separate target-bound installation and recovery gates.
