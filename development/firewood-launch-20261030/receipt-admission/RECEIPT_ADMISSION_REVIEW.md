# Candidate payment receipt admission

The shared candidate sender is now connected to the sending/source gate. The separate native review delta is verified against the exact current 102 claim function and its frozen payment-ID prerequisite. This work is local only: it does not activate workers or source flags, publish a root descriptor, read real credentials, send an email, or change production.

## Exact native boundary

The authoritative retained baseline is `firewood-accounting-repair/target-28956add6ba1/baseline-catalog.private.json`. Its claim definition SHA256 matches the fresh current-source metadata readback. The lineage is:

| Stage | Claim body MD5 |
| --- | --- |
| Exact current immutable102 | `1900fbc1f487cd9847db7fdb32729e5a` |
| Frozen payment-ID prerequisite, SHA256 `f0009ec4c0c51b7e14cf8ec51554d8bec2dc42bb22c896f1cc18e39afba73327` | `300389d99e9409f36610eaa971caee04` |
| Separate live receipt sender guard | `409f0e55cdc9a0075b1e4d42307a567d` |

`finish_outbound_delivery` remains body MD5 `aef215ac8c91811aefba30a8c1798583`, supporting the existing not_attempted outcome. The frozen four Firewood SQL units and the payment-ID prerequisite were not edited.

The new unit inserts only two identical source guards: after the existing source/delivery locks and eligible-state check, and immediately before creating the provider attempt. Removing those two blocks recovers the exact prerequisite postimage. The original function owner, service-only ACL, definer status, empty search path, duplicate-payment predicates, source/family lock sequence and all remaining body bytes are retained. The source row uses SHARE NOWAIT so a source transition introduces no blocking inverse lock. A denied live receipt returns null before changing the prepared row, aliases, attempts or history.

The guard resolves the actual payment's invoice and the saved declared invoice, checks live markers or an actual handoff mapping, and requires a succeeded payment, exact invoice/terms/order/source/account/environment binding and sender_enabled. It does not require collection, surcharge, preparation or fulfillment readiness. A cancelled/credited order can therefore retain a genuine late payment receipt while new collection is held. Unknown or malformed marked-live identities cannot become ordinary mail. Ordinary positively unmanaged invoices keep the original native branch.

An early comparison rejected the older doc-c32 fixture as a claim baseline: it contained additional change-order, appointment and quote-follow-up claim changes. No such changes were blended into this delta. The offline generator stopped on that mismatch before producing a unit; the final unit uses only the authoritative retained 102 body and exact frozen prerequisite. New native QA independently proved every stage on a fresh owned cluster.

## Runtime and provider boundary

`firewood-receipt-admission.ts` reads the actual saved delivery before claim. It resolves payment/invoice records with fixed bounded queries and the existing fixed collector-context read. The operative office-workflow/document collector-context implementation reads source identity directly; enabled/collection affect its allowed field, not the availability of its sender metadata. The receipt gate deliberately ignores allowed, collection and cancellation flags and requires sender_enabled plus fresh fixed readReleasedContext('sending'). A registered handoff missing its live markers is held, rather than accepted as ordinary.

The shared dispatcher runs the read-only check before claim and rechecks the same saved identity/release after a positively acknowledged claim. If held before claim, the prepared delivery, aliases and history are untouched and no attempt is created. If held after claim while this process has not invoked transport, the original finish command completes that same attempt as not_attempted, needs_review and retry_authorized=false. No delivery is reset to prepared and no new provider key is generated.

The real transport checks again after its existing recipient/config validation and immediately before provider IO. It resolves saved context rather than trusting the caller's email-type label; a live receipt cannot disguise itself as an invoice or borrow another frozen payload. A live send needs the saved dispatching attempt, exact payment/invoice identity, original provider key and frozen envelope/body. Legacy direct ordinary payment transport is retained only after a positive actual unmanaged classification; unknown identities are held. Ordinary nonreceipt content/provider parameters remain unchanged.

Once provider IO has started, a timeout or exception remains unknown. A later sending hold does not turn that uncertainty into not_attempted, reset the attempt or authorize another send. Positive acceptance and existing history/provider repair remain recordable with sending/collection held. Already accepted or uncertain saved deliveries follow the existing no-resend path before any source admission check.

## Verification

21 focused tests execute the actual candidate dispatcher, transport, source policy, adapters and deadlines with explicitly synthetic database/context/provider stubs. They cover preclaim and postclaim holds, no attempt/history/alias mutation, source/account/payment/declared-invoice mismatch, missing markers, late receipts with collection/cancellation held, source closure at the actual provider boundary, payload/email-type spoofing, lost claim acknowledgement, provider timeout, positive acceptance after sender closure, repeat no-resend and unchanged ordinary provider requests. Focused TypeScript checking passes with 277 files and zero diagnostics using the existing pinned dependencies without installation.

The separate collector/receipt helper suite now passes 18 tests. Its tiny live-only addition checks current succeeded payment status and exact declared invoice after live classification. Ordinary classification remains unchanged; no financial mutation was added. Previous collector proofs remain preserved, with the current source captured separately as version3.

`NATIVE_RECEIPT_PROOF.json` records eight independent actual native cases on a newly bootstrapped owned synthetic PostgreSQL fixture, alongside the retained 13 financial cases and six document groups. It proves the exact 1900→300389→409f function lineage, direct service-role claim enforcement, sender hold without mutation, late receipt with source enabled/collection/surcharge all held, distinct payments on the same invoice, malformed binding denial, NOWAIT source transition, original uncertainty/not_attempted holds, ordinary receipt behavior and accepted history repair after sender closure. Original selected financial/delivery preimages and permissions were compared against retained gold; only the explicitly reviewed claim delta advances here. All source flags were restored false, no provider was contacted, and the new cluster was stopped. Older clusters were not restarted.

The actual overlay digest remains UNBOUND. Workers and sending must remain off until the parent incorporates this separate source/SQL delta into the final approved overlay, schema/source fingerprints and actual guarded installation, then verifies root mounts/key custody and fresh paired recovery admission. These local tests and synthetic provider identities do not certify actual production email acceptance or grant backup authority.
