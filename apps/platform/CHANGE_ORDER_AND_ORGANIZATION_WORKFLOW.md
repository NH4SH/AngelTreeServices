# Change Orders And Organization Workflow

## Deployment

Review and apply these migrations in order before deploying the change-order application code:

1. `supabase/migrations/20260716222258_crew_job_closeout_workflow.sql`
2. `supabase/migrations/20260717005036_business_reporting_profitability.sql`
3. `supabase/migrations/20260717012234_materials_inventory_operations.sql`
4. `supabase/migrations/20260717015652_change_orders_and_organization_parity.sql`

The change-order migration adds no secrets or environment variables. It reuses `PORTAL_TOKEN_ENCRYPTION_KEY` for recoverable customer links. Keep `app_private` out of the Supabase Data API exposed schemas, refresh the PostgREST schema cache after applying the migration, and rerun Supabase Security Advisor.

## Workflow

- Staff create change orders from a work order, approved quote, office request, or crew closeout additional-work request.
- Crew descriptions and closeout context stay internal until staff deliberately writes customer-visible scope.
- Staff save drafts, return them for clarification, approve them internally, and send them for customer approval.
- Customer links use hashed tokens for lookup and encrypted token recovery. Editing a change order does not revoke or regenerate its active link.
- Customer or organization-contact approval is atomic and idempotent. It snapshots added scope into the linked work order and updates projected job value without modifying the accepted quote.
- Approved additions appear separately from original scope on staff and crew work-order views. Crew responses never include prices or internal costs.
- Staff explicitly attach approved, unbilled change-order lines to a draft invoice. The source-line constraint prevents the same addition from being invoiced twice.

Admin routes:

- `/admin/change-orders`
- `/admin/change-orders/[changeOrderId]`
- `/admin/change-orders/[changeOrderId]/edit`

Customer route:

- `/portal/change-order/[token]`

## Security Decisions

- Change-order, line-item, scope-snapshot, and portal-token tables have RLS enabled.
- Anonymous database access is not granted. The public portal resolves a validated token through server-only code.
- Portal pages select current customer-visible record data and never select internal costs, margins, crew notes, or raw tokens.
- Change-order approval and invoice attachment use narrow fixed-search-path RPCs with explicit grants.
- The crew scope RPC verifies the signed-in user is staff or the assigned crew member and returns no pricing.
- Normal edits do not mutate token rows. Revocation and regeneration are explicit confirmed actions.

## Safeguards

- The original approved quote and its approval history are not modified.
- Approval cannot create duplicate work-order scope rows.
- Invoice attachment only accepts draft invoices, only includes approved/unbilled changes, and keeps source-line links.
- Additional work reported during closeout does not become approved or billable automatically.
- Schedule-impact fields create an office warning; they do not silently reschedule the work order.
- Supporting crew photos remain attached to the job/closeout instead of being copied into a customer-visible change order.

## Organization Parity Audit

| Workflow area | Current organization support |
| --- | --- |
| Organization record | Name, type, status, payment terms, tax-exempt metadata, notes |
| Contacts | Multiple contacts, multi-role labels, preferred contact method, active state, optional property assignment |
| Service locations | Organization-owned locations without a fake individual customer; multiple properties supported |
| Change orders | Organization, requested-by contact, approval contact, billing contact, service location, portal approval |
| Work orders | Organization and service-location links persist from source quote/change order |
| Invoices | Organization, billing contact, service location, payment terms, and change-order source links |
| Portal display | Organization name, attention contact, service location, and current approved/additional totals |
| Activity | Organization and change-order history remain linked to their source records |

Broader audit results:

| Area | Organization ID | Contact selection | Property retained | Result |
| --- | --- | --- | --- | --- |
| Leads / estimates | Indirect through customer/job | Existing communication recipient choices | Yes through schedule/job | Partial: organization-first lead intake remains focused follow-up work |
| Customers | Optional organization relationship | Individual contact fields | Multiple customer locations | Existing behavior preserved |
| Organizations | Direct | Multiple contacts and roles | Multiple direct organization properties | Improved in this migration |
| Quotes | Direct field/backfill | Recipient and approval fields prepared | Direct service-location field | Partial: current editor still starts from a customer |
| Quote portal | Record-scoped token | Existing customer recipient behavior | Current quote location | Partial for organization-only authoring; no broad organization access |
| Change orders | Direct | Requester and approval contact | Direct service location | Complete for this release |
| Work orders | Direct field/backfill | Onsite/property-manager fields prepared | Direct service location | Partial: current manual creator still starts from a customer |
| Schedule / closeout | Through work order | Crew sees operational data only | Work-order property retained | Existing behavior preserved |
| Invoices / payments | Direct field/backfill | Billing/AP fields prepared | Billing address stays separate from service location | Partial: current manual creator still starts from a customer |
| Invoice portal / Stripe | Record-scoped token | Existing billing recipient behavior | Current invoice/job location | Existing customer-backed behavior preserved |
| Reminders / email | Organization ID logged | Change orders use selected approval contact | Related record retained | Change-order path complete; quote/invoice selectors remain follow-up |
| Materials / deliveries / disposal | Existing organization destination/vendor fields | Not a document recipient workflow | Job/location relationships retained | Existing behavior preserved |
| Equipment | Job and schedule relationships | Operational assignee only | Job/location relationships retained | Existing behavior preserved |
| Reports / CSV | Direct organization grouping added by reporting foundation | Contacts are not customer identities | Location dimensions retained | Verify with production data after migration |
| Activity history | Direct organization and subject IDs | Actor/contact IDs where applicable | Related subject retained | Improved for change orders |

The migration also adds explicit recipient/contact fields to quotes, jobs, and invoices so later UI work does not need to overload one generic contact. The following focused interfaces remain future work and should not be treated as complete organization-only parity in this release:

- creating a quote from scratch for an organization without first selecting a customer in the current quote editor
- dedicated quote recipient and approval-contact selectors
- dedicated job onsite/property-manager selectors
- dedicated invoice billing/AP/CC contact selectors
- a guided supplemental-invoice flow for already sent or paid invoices

These gaps do not require fake customer records at the database layer. Organization-owned properties and contacts are preserved for the focused UI pass.

## Smoke Tests

Individual customer:

1. Create a draft from a work order, add multiline lines, approve internally, and generate a link.
2. Edit and reopen the same link; confirm it shows current data.
3. Approve twice; confirm one approval and one set of added work-order scope rows.
4. Attach approved additions to a draft invoice twice; confirm each source line appears once.

Organization:

1. Create two organization contacts with different roles and two organization-owned service locations.
2. Create a change order for the correct work order/property and select the approval contact.
3. Open the portal signed out; confirm organization, attention contact, and property are correct.
4. Approve and confirm the added scope appears for assigned crew without pricing.

Security:

1. Confirm an anonymous Supabase client cannot list change orders or portal-token rows.
2. Confirm unassigned crew cannot call `get_crew_change_order_scope` for another job.
3. Explicitly revoke a link, then regenerate it; confirm the old URL fails and the new URL works.
4. Confirm duplicate change orders contain copied draft scope but no portal token, approval, or invoice link.
