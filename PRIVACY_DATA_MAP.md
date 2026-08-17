# Angel Tree Services Privacy and Data Map

Last reviewed: 2026-08-15

This document is the canonical, repository-grounded map of personal and operational data used by the Angel Tree Services public website, customer portals, internal CRM, and iOS field app. It is an engineering and compliance aid, not a substitute for legal advice. It contains no credentials, tokens, customer records, or employee records.

## Identity and account boundaries

- **Website visitor or lead:** may submit a quote request without an account.
- **Customer or customer contact:** may appear in CRM business records and may receive a tokenized quote, invoice, or customer-portal link. Portal access is not a reusable staff login.
- **Employee or contractor:** may request a Supabase-backed account through the web signup flow. Approval and role assignment are separate administrative actions.
- **iOS user:** signs in with the same approved staff identity. The iOS app does not create accounts itself.
- **Marketing subscriber:** exists only when the public lead explicitly selects the optional marketing checkbox.

Disabling or deleting an authentication identity is distinct from deleting historical company business records. Customer, job, estimate, invoice, payment, safety, and audit records may need to remain accurate after account access ends.

## Data inventory

| Data category | Source / subject | Storage or transmission | Purpose and access | Local/cache behavior | Retention, correction, deletion, export | Apple privacy mapping |
|---|---|---|---|---|---|---|
| Public lead identity: name, phone, optional email | Website visitor / prospective customer | Public form to lead API; saved in Supabase-backed CRM; email notification through Resend where configured | Estimate follow-up, lead routing, customer service; authorized office/admin users | Browser retains ordinary form state only while page is open | Manual verified access/correction/deletion request; business records may be retained when legally or operationally necessary | Not collected by the iOS app |
| Public lead request: service, request type, property address, project details | Website visitor / prospective customer | Lead API and CRM | Estimate preparation, service routing, scheduling | Address fragments are sent to the configured Google Places service after autocomplete threshold; selected address is submitted with form | Same verified request workflow; deletion subject to business/legal retention | Not collected by the iOS app |
| Public marketing preference | Website lead | CRM lead record | Send seasonal tips, reminders, or scheduling updates only when affirmatively selected | Checkbox is off by default | Preference can be withdrawn by contacting the company | Not collected by iOS |
| Submission and attribution metadata: submission ID, page URL, referrer, UTM values | Website visitor / lead | Lead API and CRM | Deduplication, source attribution, support, fraud/spam review | Generated/read in browser at submit time | Retained with lead as an operational record; included in verified access review where applicable | Not collected by iOS |
| Website analytics and device/browser events | Website visitor | Google Analytics tag loaded by the public site; processed by Google | Aggregate site performance, page usage, navigation and conversion measurement | Google technology may use browser identifiers or storage according to its implementation and settings | Managed under analytics configuration and provider controls; public policy explains choices | Not collected by the iOS app; no iOS analytics SDK found |
| Authentication identity: user ID, email, session, role | Employee/contractor | Supabase Auth and platform authorization records | Sign-in, approval, role-based access, auditability | Web uses secure auth cookies/session handling; iOS Supabase SDK uses Keychain-backed auth storage | Admin can disable access; verified removal request available; auth deletion does not automatically delete business history | Contact Info: Email; Identifiers: User ID; linked; App Functionality |
| Staff profile: display name, job title, crew, role summary | Employee/contractor | Supabase/platform APIs | Identification, assignments, permissions, team operations | iOS may cache limited profile/access state for app operation | Correct through authorized administration; removal subject to business retention | Contact Info: Name; linked; App Functionality |
| Customer and organization records: names, phone, email, company/HOA | Customer/contact; entered by leads or staff | Supabase CRM; platform APIs | Customer service, estimates, scheduling, communication, billing | iOS can display and submit records; some operational summaries are cached | Authorized correction; verified request and business/legal retention review | Conservative review needed: Contact Info submitted by a staff user for a customer may count as app-collected data tied to the staff account |
| Service locations and addresses | Customer/property | Supabase CRM; Google Places only when staff or visitor uses autocomplete | Dispatch, estimates, work delivery, routing context | iOS caches limited location/job summaries; app does not request device location | Correctable; retained with service/job records as necessary | Location: Physical Address may require disclosure because staff can submit service addresses; not Precise/Coarse device location |
| Jobs, schedules, assignments, statuses, safety/work notes | Customer and staff operations | Supabase CRM and authenticated backend APIs | Dispatch, field execution, safety, customer support, recordkeeping | iOS schedule/field caches; cleared on sign-out; ordinary OS backups may apply according to device policy | Historical operational records retained as needed; access/correction via authorized workflows | Other User Content and possibly Product Interaction; linked; App Functionality |
| Quotes, proposals, invoices, payment status | Customer and company operations | Supabase CRM; Stripe for payment processing; tokenized portals for customer review/payment | Estimates, approvals, billing, reconciliation | iOS can display operational billing status; no payment-card credentials are collected by iOS | Financial records retained for accounting/legal obligations; corrections audited | iOS does not collect payment credentials. Other financial/business records require App Store review if submitted through iOS |
| Payment credentials | Customer | Entered into Stripe-hosted/Stripe-controlled payment components; not stored as raw card data by Angel Tree | Payment processing and fraud prevention | Not cached by Angel Tree iOS app | Subject to Stripe and legal payment-record obligations | Payment Info is not collected by iOS when entered outside the app and unavailable to it |
| Communications, notes, documents, captions | Customer and staff | Supabase CRM; Resend for email delivery; Google Calendar for opted-in staff calendar integration | Service delivery, reminders, internal coordination, evidence, customer communication | Some notes and operational summaries may be cached in iOS; cleared on sign-out | Retained with relevant business record; authorized correction/deletion review | Other User Content; linked; App Functionality |
| Job photos | Customer property; captured/selected by staff | Selected/captured in iOS, uploaded through authenticated backend/storage | Document job conditions, safety, scope, and completed work | Selected image data exists transiently during upload; app cache behavior is limited to feature implementation | Retained with job record as operational evidence; reviewed through verified request process | Photos or Videos; linked; App Functionality |
| Portal tokens and portal activity | Customer/contact | Token hashes and encrypted recovery material in backend; token delivered to customer; expiry/revocation state | Secure access to a specific quote, invoice, or customer portal | Portal browser stores a pseudonymous session marker in localStorage | Tokens expire or can be revoked; records retained for security/audit needs | Not collected by iOS |
| App widget summary | Employee/contractor | App Group container on device | Show a limited upcoming-work summary | Contains user ID, title, customer/party name, city, status, and time; cleared on sign-out | Device-local; cleared on sign-out and replaceable by later snapshots | Data processed only on device is not “collected” for App Store labels |
| Security/audit/technical logs | Visitors, customers, staff | Netlify, Supabase, platform logs, and audit records; providers may log request metadata | Reliability, abuse prevention, incident response, authorization review | Server/provider logs; no dedicated iOS crash/analytics SDK found | Provider and company retention settings apply; security records may be retained for legitimate protection needs | Diagnostics only if transmitted by the iOS app; no direct iOS diagnostics collection found |

## Service-provider and data-flow inventory

- **Netlify:** public hosting, CDN, build/runtime infrastructure, and request logs.
- **Supabase:** authentication, Postgres database, storage, and server-side data services.
- **Resend:** transactional/internal email delivery where configured. A notification failure must not turn an already-saved lead into a customer-facing submission failure.
- **Stripe:** payment processing and related payment records; Angel Tree should not store raw card credentials.
- **Google Places:** address autocomplete; typed address fragments and selected place/address data are sent when this feature is used.
- **Google Analytics:** public-site measurement. The repository actively loads a Google Analytics tag; public disclosures must not claim that the site has no analytics or browser storage.
- **Google Calendar:** optional staff integration for assigned estimates/workdays when connected by the user.
- **Apple:** App Store distribution and device/platform services. Apple’s own platform collection is separate from Angel Tree’s app collection.

## Tracking determination

No evidence was found that the iOS app links user or device data with third-party data for targeted advertising, advertising measurement, or data-broker purposes. The iOS app has no ATT prompt, IDFA use, ad SDK, or direct Google Analytics SDK. Therefore the current iOS tracking answer is **No**, subject to re-review whenever dependencies or data uses change.

The public website does load Google Analytics. That web behavior must be disclosed accurately and is separate from Apple’s App Tracking Transparency definition.

## Permissions and device APIs

- Camera: requested for staff-initiated job-condition and completion photos.
- Photos: selected through Apple’s system photo picker; no broad photo-library permission string was found.
- Location, microphone, contacts, calendar, and tracking: not requested by the iOS app.
- Required-reason APIs: no direct app use requiring a declared reason was confirmed. Swift package privacy manifests and Xcode’s archive privacy report must be rechecked before each App Store submission.

## Retention and request workflow

1. Requests begin at `https://angeltreeservices.org/privacy-request/` and are sent to the published company contact address.
2. Staff verifies identity and authority before disclosing, correcting, deleting, or disabling access.
3. Staff locates records across public leads, authentication, CRM, portals, storage, communications, and applicable provider systems.
4. Eligible data is exported, corrected, or deleted manually. Records required for accounting, contracts, safety, security, legal compliance, or accurate customer history may be retained and explained.
5. Account access can be disabled independently of historical business-record retention.
6. Completion and any retained categories should be documented without placing sensitive request contents into ordinary marketing systems.

## Release-maintenance checklist

Re-review this map when adding a field, integration, SDK, portal capability, analytics provider, mobile permission, background task, export, deletion endpoint, or new use of existing data. Compare source code, production configuration, provider settings, App Store Connect answers, the public privacy policy, and the iOS privacy screen before release.
