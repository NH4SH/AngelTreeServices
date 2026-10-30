# Current V3 acceptance derivation — physical target only

`artifact-v1` is a complete offline derivation of the 701-file operative CRM V3 source, all eleven SQL units, and the owner inventory. It preserves all prior sources and artifacts. Root's physical target evidence is pinned at `a81e4e250c9d937c821492c7782047537d8216bf3eaac0d69a6ad37eef2987cb`; no database connection or SQL execution occurs here.

The target is `ats_firewood_acceptance_c6f62a2c0f61`, OID `23849`, system identifier `7702496746553905162`, marker `5b7af2eb-9889-4663-8992-8560982248fb`, with the exact synthetic-only acceptance purpose/comment. Its database owner remains `postgres`. Proposed native roles are `ats_firewood_acceptance_{request,worker,health}_c6f62a2c0f61`; role OIDs and actual role creation remain unassigned. Website's `web` process maps to the native `request` role; its worker maps to `worker`, with `health` reserved for the separate native health proof.

The immutable `artifact-v1/DERIVATION_MANIFEST.json` SHA-256 is **`5f4bba9b28c483c15cb1e35736718b766de8f6ef1145c69f04517d4b2a3ae373`**. It records 1,244 finite byte spans across 34 changed files, with exact source/output hashes and inverse reconstruction. The complete fourteen old modules plus nine newer integration modules are covered. All other source files are copied from their pinned V3 inputs, with six final API routes relocated into acceptance paths. `artifact-reproduction-v1` reproduces all 716 files byte-for-byte.

The production signed-gate core, filesystem policy and upstream validators remain byte-identical. The derived released-context reader, protected handoff getters, and office getter return null explicitly. No actual signed test authority, registered native proof, admission binding, schema/release runtime pin, origin/ingress binding, or credentials are assigned. Hosts appearing in source are the same unverified proposals as the Website offline derivative. The original Website artifact's unconditional barriers remain untouched. This artifact is not runtime-loadable or provider-ready.

## SQL handoff to Root

`QA_ELEVEN_UNIT_INVENTORY.v1.json` SHA-256:
`c6128617c66f3f3a935ec6193aaec91beda43d30a6a950e97545de8f1713275b`

`QA_INVENTORY_ADAPTATION_PROOF.v1.json` SHA-256:
`20f0e8945599b3f9fbfb0d663828a34ede38809c1003b73703b8eea4b924841b`

The new inventory contains exact absolute paths, lengths and hashes for all eleven derived units. Its 13 renderer adaptations comprise only 11 outer transaction/role controls and the two intentional review stops. Their canonical offsets are translated through the recorded identity spans to the derived byte positions. The six renamed review-GUC predicates stay intact and are listed separately. An in-memory non-executable probe proves adaptation inverse → exact derived bytes → exact canonical bytes for every unit; it assigns no target predicate and emits no runnable SQL.

Root must build a **new** QA renderer fork using these pins, the actual physical target binding, derived owner and name inventories, renamed review GUCs, three role names, and the computed function hashes below. Keep the successful original QA renderer and production candidate untouched. The initial acceptance baseline is 175 protected tables, 265 business routines, 525 original guards, 31 roles, original102 migration count and projected ledger `08f17da6104684ddd835735c7256ab16`. The new source adds 25 tables: 200 protected / 201 captured postimage, with all 15 Website tables named `fwofficeacceptance_` and the financial namespace `firewood_acceptance_`.

Every SQL file remains `.review-only.txt` and retains its original review stops. Root's future new renderer must apply exact physical maintenance predicates, owner transfers, 25 guard triplets, original routine/ACL preservation, rollback/fault checks and independently reviewed postimage approval. This derivation does not execute or authorize those actions.

`artifact-v1/SQL_FUNCTION_HASHES.json` contains source/derived MD5 and SHA-256 for all 66 literal routine declarations, full-unit before/after SHA-256 values and the dynamic receipt stages:

| Stage | Exact `prosrc` MD5 computed offline |
| --- | --- |
| Original102 generic claim | `1900fbc1f487cd9847db7fdb32729e5a` |
| After payment-ID receipt prerequisite | `300389d99e9409f36610eaa971caee04` |
| Acceptance office collector before document delta | `87014f23944e13210eb92a0958fad907` |
| Acceptance document collector after delta | `474e574a349b7d2457e68d7b53652a58` |
| Acceptance claim after two receipt source guards | `604975bb669b08813bb74619d028dae5` |
| Unchanged finish command | `aef215ac8c91811aefba30a8c1798583` |

The document preimage MD5 and final claim postimage MD5 are explicit separate dependency spans in the source manifest. Removing both acceptance receipt guards restores the exact `300389…` claim. Business terms/payment policy hashes, prices, accounting arithmetic, ordinary finance/receipt branches and native ownership identities remain preserved. Seven target-specific SQL database literals change; owner `postgres` and helper/operator `supabase_admin` do not.

## Offline checks

Nine Node22 checks pass: all source/output hashes and inverse spans; seven DB substitutions; dynamic function hash guards; unchanged policies and cross-profile signatures; five null runtime modes; six acceptance routes and retained stops; changed JS/TS syntax; exact artifact file closure; and the new QA inventory's two-stage inverse proof. A separate copy passed a complete static TypeScript check using the already installed V3 dependencies, without dependency installation or runtime startup. This check did not regenerate Next route types or perform a new framework build. No real keys were read and no provider, VM, SSH, DNS or database operations were performed by this derivation.

`derive-current.py <fresh child output>` regenerates the immutable offline artifact only. `build-qa-inventory.py` writes fresh inventory/proof files and refuses overwrite. The standalone closed synthetic acceptance-context contract is a separate review surface; it is not installed into `artifact-v1` and cannot create actual admission.
