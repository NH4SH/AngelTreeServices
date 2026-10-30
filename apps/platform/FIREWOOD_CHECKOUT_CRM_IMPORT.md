# Firewood checkout → CRM: isolated test contract

Status: isolated test implementation only. The verified October 26 dispute-ID follow-up is recorded in `FIREWOOD_DISPUTE_ID_FIX.md`; the original CRM-only findings below are retained as dated historical context. No commit, push, deployment, staging installation, production change, live charge, or real customer communication is authorized by this work. Candidate migration 127 is `20261026015704_firewood_test_paid_import.sql`. It enables no source and contains no credentials.

## Ownership and effects

CRM owns customer/location resolution, the immutable imported order snapshot, invoice, payment and audit. Website retains its order/payment attempts and durable CRM-sync retry status, not a second invoice ledger. No additional hosted database is provisioned.

A newly verified successful payment produces one standalone **test** invoice and records the **existing** Stripe payment in the same database transaction, with paid status and zero balance. Invoice numbers have the explicit `TEST-FW-<order UUID>` prefix. Wood is one priced package line (including two-cord savings); stacking is one $150 line per delivery. Delivery is free. No surcharge, extra package discount, new veterans checkbox, charge, payment request, job, scheduled delivery or completed delivery is created. Customer/access instructions remain private. Existing customer contact details are never overwritten.

Website is the single customer receipt and owner-confirmation authority (`info@angeltreeservice.org`). CRM enqueues and sends neither. Website must use its own durable logical notification identities/provider idempotency, independent of CRM availability; local captures are not evidence of real email delivery. Imported invoice automatic reminders remain off, including after refunds/disputes.

| Package | Without stacking | With stacking |
| --- | ---: | ---: |
| Half cord | $300 | $450 |
| Full cord | $450 | $600 |
| Two cords | $840 | $990 |

USD cents are integer values. Zero tax is **an unresolved test assumption**, not an approved live exemption. Existing household Firewood invoices and tree-service terms retain their original text. A separate immutable test terms family states delivery contact within one week (not completed delivery within one week), wheelbarrow/reasonable-carry stacking access, the 48-hour cancellation policy, and no second payment request. Existing veterans eligibility is unchanged.

## Endpoint and configuration

`POST /api/integrations/firewood/test-import` is a Node server route, disabled by default. Dedicated local-only configuration is required; generic CRM credentials are never fallback values:

- `FIREWOOD_TEST_IMPORT_ENABLED=1`
- `FIREWOOD_TEST_IMPORT_SOURCE_ID`, `FIREWOOD_TEST_STRIPE_ACCOUNT_ID`
- `FIREWOOD_TEST_IMPORT_KEY_ID`, `FIREWOOD_TEST_IMPORT_SHARED_SECRET` (at least 32 random characters, server only)
- `FIREWOOD_TEST_PROJECT_ID` matching `ats_fwimport_<12 lower-case hex characters>`
- `FIREWOOD_TEST_SUPABASE_URL` (explicit-port HTTP `127.0.0.1` only), `FIREWOOD_TEST_SUPABASE_SERVICE_ROLE_KEY`
- `FIREWOOD_TEST_STRIPE_KEY` (test key only, for the expected test account)
- Optional `FIREWOOD_TEST_STRIPE_API_ORIGIN`: explicit-port HTTP `127.0.0.1` only, used by the synthetic HTTP provider fixture. Never a hosted override.

Do not put these values in a browser, source control, chat, Website public configuration or logs. This implementation has no hosted/production mode. A private enabled source registry entry must independently match the disposable environment and account before any import intent is claimed. The migration creates no entry. Only the isolated test operator creates a synthetic one. Database context/claim/finish/release RPCs allow `service_role` with **no end-user subject**, never anonymous users or office-user impersonation; private tables have RLS and no API table grants. Existing invoice commands and RLS policies are unchanged.

Authentication headers:

```text
Content-Type: application/json
X-ATS-Key-Id: <configured key ID>
X-ATS-Timestamp: <10-digit Unix seconds; within five minutes>
X-ATS-Signature: v1=<lower-case HMAC-SHA256 hex>
```

Sign the following exact UTF-8 bytes, without an extra trailing newline:

```text
<timestamp>\nPOST\n/api/integrations/firewood/test-import\n<raw JSON body>
```

The path must match exactly and have no query. Body limit: 16 KiB. Sign the final serialized body; the signature is not over the normalized object. Each retry can have a fresh timestamp/signature but must retain its business identity and payload.

## Immutable request

Use `src/lib/firewood/import-contract.ts` as the executable contract. All listed fields are required; unknown fields are refused:

```json
{
  "contract": "firewood-test-import-v1",
  "source_id": "website_local_test",
  "account_id": "acct_EXPECTEDTESTACCOUNT",
  "order_id": "<UUID>",
  "reference": "FW-TEST-<8–48 upper-case letters/digits>",
  "attempt_id": "<UUID>",
  "session_id": "cs_test_<session>",
  "snapshot_hash": "<64 lower-case SHA256 hex>",
  "order": {
    "quantity": "full",
    "stacking": true,
    "wood_cents": 45000,
    "delivery_cents": 0,
    "stacking_cents": 15000,
    "total_cents": 60000,
    "currency": "usd",
    "tax_assumption": "unresolved_test_only",
    "terms_version": "firewood-checkout-test-2026-10-25",
    "contact": {
      "name": "Synthetic Customer",
      "email": "synthetic@example.invalid",
      "phone": "2025550100",
      "address": "100 Synthetic Way",
      "address2": "",
      "city": "Test City",
      "state": "VA",
      "postal": "22407",
      "notes": "Synthetic access instructions"
    }
  }
}
```

Before opening Stripe checkout, normalize contact strings by trimming, lower-case email, upper-case state, and strip phone formatting/optional leading US `1` to ten digits. SHA256 the UTF-8 recursively lexicographically key-sorted JSON of this **normalized `order` object only**, without whitespace. Arrays retain order. Preserve the snapshot, identifiers and hash durably before payment. `parseFirewoodImport`, `canonical`, `digest` and `stripeSourceMetadata` define the algorithm.

Both Checkout Session **and PaymentIntent** metadata must include:

```text
purpose=firewood_test_only
ats_contract=firewood-test-import-v1
ats_source=<source_id>
ats_order_id=<order_id>
ats_snapshot_hash=<snapshot_hash>
ats_attempt_id=<attempt_id>
quantity=half|full|two
stacking=true|false
```

Session `client_reference_id` is the external `reference`. Preserve original shipping name/phone/full US address on PaymentIntent. Product names must match the existing Website model: `Half cord of firewood — delivery included`, `Full cord of firewood — delivery included`, `Two cords of firewood — delivery included`; optional `Stacking — one charge per delivery`, quantity one. Do not add CRM invoice/reservation/payment-channel metadata: that would mix two payment pipelines.

**Existing Website adapter is not connected yet.** Its inspected metadata (`purpose`, quantity, stacking, attempt) is insufficient, and its current sessions intentionally fail closed. Website must add the agreed snapshot metadata to both provider objects and implement its durable sync adapter as a separate authorized change. Do not retrofit invented evidence onto old payments or claim end-to-end integration from these mocks.

## Payment verification, retries and reconciliation

CRM reads the expected Stripe account, completed/paid test Session, complete line items, independently retrieved succeeded test PaymentIntent and captured paid Charge. It compares account/mode/source/snapshot/contact, exact subtotal/total/currency, zero discounts/shipping/tax, package and stacking lines. It reads **all** refund pages and the supported single dispute, checking bindings and aggregate consistency. Only read APIs are used. Fees/net settlement remain unknown (`null`), never invented. The test record uses the provider Charge creation time as its stable reference timestamp; this is not evidence of bank settlement timing. A live receipt/accounting timestamp policy remains a release requirement. Current locked SDK dependencies are retained.

A private intent and 30-second observation lease precede provider reads; creating an intent creates no customer/invoice/payment. Finish atomically commits customer/location, invoice/lines, captured payment, shared principal/balance reconciliation, mandatory audit, stable mapping and completed lease. Database audit failure rolls all those business writes back. A stale lease cannot finish; identical finished-lease proof is safe to replay after a lost database response. Provider observations occur after claim, and terminal refund/dispute states cannot regress or disappear. Provider IDs cannot be assigned to a second invoice. Changed order facts, attempt/session or reference require review, not an automatically minted identity.

Website imports only independently established payment successes. Opening, canceling, declining or leaving checkout unpaid is never an invoice event. If Website mistakenly binds an unpaid/incorrect attempt to an import intent, do not silently re-key it to a competing attempt: surface it for review. Repairing CRM sync must never initiate another payment.

Responses have `Cache-Control: no-store`; busy/unconfirmed operations use 503 with `Retry-After: 5`. Success is 201 initially, 200 on replay/refresh, containing the submitted contract/source/order/reference/attempt/account/test mode/Session plus stable `payment_intent_id`, `invoice_id`, `invoice_number`, `payment_id`, totals/currency, current status/balance and `replayed`. `original_receipt` always states the verified original paid/zero-balance capture; `notification_authority=website`, `crm_customer_email_sent=false`, `delivery_completed=false`.

Refunds/disputes refresh **the same import identity** and same invoice/payment. Current `refund_cents`, `dispute_status` and `review_required` distinguish a later financial review from the original paid receipt. A partial/full refund or lost dispute can produce a current positive balance under existing reconciliation rules; this must **not** become a new customer payment request or automatic reminder. `review_required=true` is an office-review outcome. Accepted observations have mandatory history. Terminal/missing/stale evidence fails closed; payment success remains recorded.

Website validates every returned identity, amount/currency and stable mapping, not merely HTTP 200. Unexpected/503/lost responses remain CRM-sync pending, retrying the **same** identity with bounded backoff. 401/403/409/422 require configuration/data/office review. Do not expose internal error details. Responses say `payment_retry_required=false`; never substitute a new Stripe charge. There is no automatic hosted refund polling, Website sync queue installation or real email transport in this CRM-only batch.

## Verification and remaining release work

Reproducible tests:

```sh
node --conditions=react-server --experimental-strip-types --test src/lib/firewood/import.test.mjs
FIREWOOD_LOCAL_EVIDENCE_DIR=<private owned local evidence directory> node --conditions=react-server --experimental-strip-types scripts/verification/firewood-test-import.mjs
```

The native harness requires a task-created `ats_fwimport_*` stack on explicitly asserted loopback API/database ports. It never accepts a hosted project. Synthetic fixtures use reserved invalid email domains. Fresh migration replay, API authorization, all six totals, concurrent/expired leases, lost responses, restarted handlers, outages, immutable identity, contact ambiguity/reuse, payment reuse, audit rollback, refund and dispute transitions, disabled-source and no-email/reminder/job behavior are covered. Final execution results are recorded below.

Before any hosted staging/live release: Website adapter and persistent reconciliation/notification work; approved test account/credentials and secret transport; tax/business review and live terms family; separate staging isolation/security verification and migration reconciliation; provider webhook/recovery ownership; supervised office-review workflow and operational evidence. This implementation is deliberately incapable of selecting hosted CRM or live keys. No historical migration/checkpoint is rewritten, and no production activation is implied.

### Verified results (October 25, 2026)

- Final candidate replayed from an empty, newly owned loopback stack through all 127 migrations. Schema/types and deferred source fingerprints match; no source seeded by migration.
- 3,233 CRM unit/PostgreSQL regression checks and 21 separate manual-reminder checks passed, with no failures/cancellations/skips. The final migration-only strict customer/location selection refinement was additionally replayed fresh and passed native/API checks and the 10 historical source-gate tests.
- 16 native integration groups passed, covering authorization/private grants, all six totals, concurrency/lease fencing, immutable/reference/attempt identities, payment reassignment denial, provider outage, unpaid evidence, customer ambiguity/reuse, mandatory audit rollback and refund/dispute terminal ordering. Logical import/reconciliation audits remain single on identical replay. Customer communications, reminder queue, private outbound requests/deliveries, source events and jobs are unchanged.
- Five optimized Next HTTP route groups passed against the real local Supabase API and a synthetic read-only Stripe HTTP server, including signature/body checks, unpaid/live rejection, outage retry, real application-process restart and disabled configuration. Zero provider writes, emails or external application network attempts. This is mock evidence, not a real Stripe sandbox payment certification.
- Node 22.23.4 typegen/typecheck and optimized Next 16.4.2 build passed. One parallel build exceeded its 300-second runner limit; the build was rerun separately and completed successfully. Built application source matches the final working tree.
- Local security advisors returned zero findings. Historical migrations/checkpoints, six read-only Website reference hashes and the separate runtime-security HEAD are preserved. No staging or production access occurred for this integration.
- Code is left uncommitted/unpushed on `codex/firewood-checkout-test-import`, based on the existing verified reconciliation work. No deployment, app settings, live payments or service credentials changed. Only owned test processes are stopped; synthetic volumes are retained.

### Files for review

- `apps/platform/FIREWOOD_CHECKOUT_CRM_IMPORT.md`
- `apps/platform/scripts/schema/manifest.json`
- `apps/platform/scripts/verification/firewood-test-import-http.mjs`
- `apps/platform/scripts/verification/firewood-test-import.mjs`
- `apps/platform/src/app/api/integrations/firewood/test-import/route.ts`
- `apps/platform/src/components/documents/invoice-document.tsx`
- `apps/platform/src/lib/documents/email-drafts.ts`
- `apps/platform/src/lib/documents/terms.ts`
- `apps/platform/src/lib/documents/terms/firewood-2026-10-24.ts`
- `apps/platform/src/lib/documents/terms/firewood-checkout-test-2026-10-25.ts`
- `apps/platform/src/lib/firewood/import-config.ts`
- `apps/platform/src/lib/firewood/import-contract.ts`
- `apps/platform/src/lib/firewood/import-handler.ts`
- `apps/platform/src/lib/firewood/import.test.mjs`
- `apps/platform/src/lib/firewood/verify-test-payment.ts`
- `apps/platform/src/lib/types/database.generated.ts`
- `apps/platform/tests/customer-document-print-fixture.mjs`
- `apps/platform/tests/customer-invoice-fixture.mjs`
- `apps/platform/tests/document-terms-preservation.test.mjs`
- `apps/platform/tests/firewood-invoice-terms.test.mjs`
- `apps/platform/tests/fixtures/firewood-import.mjs`
- `apps/platform/tests/staging-appointment-candidate.test.mjs`
- `supabase/migrations/20261026015704_firewood_test_paid_import.sql`
- `supabase/staging/deferred-migrations.json`

### Verified follow-up — October 26, 2026

Migration 128 (`20261026182017_firewood_test_dispute_ids.sql`) corrects actual `du_` Stripe dispute IDs without changing the applied migration or the other transaction/access/payment guards. The Website connector now exists and its retained paid dispute order passed real sandbox evidence checks and HTTP 201/200/200 queue replay: seven stable invoice/payment pairs, fourteen local confirmation copies unchanged, no recharge or customer message. Fresh 128-migration replay, 3,233 CRM tests, twenty native groups, five optimized HTTP groups, schema checks, typecheck/build and local security advisors passed. Public types are unchanged. Only isolated local environments were used; hosted staging/production and release settings were untouched. See [the correction report](FIREWOOD_DISPUTE_ID_FIX.md) for exact scope and identities.
