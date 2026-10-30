# Offline V3 acceptance inventory

This folder is an unbound interface review. No artifact here admits a real target or opens a runtime. Read `GAPS.md` for the shortest bounded implementation path and `PROPOSED_BINDING_SCHEMA.json` for the root evidence handoff. `BINDING_UNBOUND.json` is the only delivered binding instance: every actual evidence field is null.

| Source | Verified count | Immutable pin |
| --- | ---: | --- |
| Operative CRM V3 source | 701 files | `cf6f065c4d42ef1fd299733be959e150135b9ff9d0c24334b23d252b0fa9d765` |
| Website offline acceptance derivative | 50 files | `13670db46efb393e5ca69867d19c1b1fae900cc0d6a7a69baf03f9ad5c358351` |
| Prior acceptance source lock | 14 modules + 6 SQL units | `b278318e9ee804fd3ef63c3ed82e9ff96064a698c2fe1dd37c6d55a79d00b04e` |
| Required SQL unit preimages | 11 units | Per-unit hashes in `INVENTORY.json` |

All fourteen prior module preimages still match V3. The required additions are the guarded runtime and separate acceptance gate, collector admission/policy, document accounting/server RPC, receipt source/server RPC, office command/workspace RPCs, and ACH metadata identity. The six acceptance API route locations and matching type/import closure must be included. Twenty files have direct acceptance identity or runtime boundary candidates; three further files contain unrelated production-host references that are explicitly excluded from automatic edits. `INVENTORY.json` records exact byte offsets and lines, with candidates clearly distinguished from an approved transformation allowlist.

| SQL unit | Minimum acceptance change |
| --- | --- |
| document-terms | Unchanged body; exact bound target envelope; reviewed transaction controls |
| payment-receipt-102 | Unchanged body; exact bound target envelope; reviewed transaction controls |
| boundary | Contract/source/environment/account/mode/RPC/advisory identities; review stop and envelope |
| office-workflows | Matching financial/office/RPC/advisory identities; review stop and envelope |
| accounting | Private financial/RPC namespace; preserve original shared financial branches; review stop/envelope |
| reporting-accounting | Financial namespace and report credit-row identity; preserve dates/math; review stop/envelope |
| website-office-v2 | `fwofficev2_` storage/helper/constraint namespace to `fwofficeacceptance_`; envelope |
| document-accounting | Matching derived collector/financial namespace and test identity; review stop/envelope |
| receipt-admission | Matching derived source/account/mode/RPC names; preserve claim preimage and finish command; review stop/envelope |
| public-boundary-rehome | Three native role names; six database-specific `postgres` spans; exact effective-permission proof; review stop/envelope |
| website-native-access | Website storage/helper names, all three role DDL/ACL/RLS names, one exact DB literal; review stop/envelope |

Native role proposals are `ats_firewood_acceptance_{request,worker,health}_<same database suffix>`. Role names are not created or observed. Preserve `postgres` ownership, `supabase_admin` operator/native helper ownership, exact grants/grantors, native guards and existing authorization. No global replacement is safe.

The pure `binding-contract.mjs` checks the proposed DB/role/account/native observation subset and an exact restricted test-key fingerprint, while returning all authority fields false. It validates no signed admission, recovery proof, credential custody, origins or ingress and constructs no provider or database client. The six tests use only labeled synthetic in-memory fixtures plus the null handoff instance. The successful combined native QA postimage remains a production-candidate QA result, not acceptance evidence.
