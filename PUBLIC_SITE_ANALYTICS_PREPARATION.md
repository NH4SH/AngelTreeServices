# Public website analytics — minimal consent-based launch

## Approved scope — October 18, 2026

After reviewing the consent/privacy patch, the owner delegated the recommended
minimal launch: activate optional public-site Analytics, commit/push with automatic
Netlify builds skipped, publish only the public website and run non-submitting
smoke checks. This supersedes the earlier disabled/local-only hold for this batch.
Keep CRM code, settings, records and deployment unchanged. No production leads,
phone calls, account permissions, account creation or acceptance of terms.

## Verified account and public property

The existing GBP-manager login has Administrator access to the public property
under Default Account for Firebase (account 274168020). The public property is
**angeltreeservices.org**, ID **437728721**; its matching web stream is 7989355946,
measurement ID **G-8WMD200TXP**. The Google tag also shows GT-PHCKD38W and one
Analytics destination. The source now enables this verified public stream.

The separate Firebase property angeltreeservice-e78b9 (387476371; G-X7DMZKR40R),
CRM integration, permissions and account-wide settings remain untouched. No new
terms were accepted. Workspace administration alone does not establish GA access.

## Remote settings applied and verified

- Enhanced measurement master off. Optional history page views, scrolls, outbound
  clicks, forms, videos and downloads off in tag-level automatic event detection.
  Mandatory tag page views remain controlled by the website's send_page_view:false.
- Tag-level user-provided-data capabilities, automatic detection and the individual
  email/phone/name/address selections off. Property setup was not completed.
- Google Signals off; granular location/device collection off; ads personalization
  disallowed in all 307 regions (0 allowed). Existing Ads-link personalization was
  already disabled and remains so. No Google Ads configuration changed.
- Cross-domain measurement has no configured conditions. No CRM domain added.
- Event modifications list empty. Existing ads_conversion_Contact_Us_1 custom rule
  requires page_view with page_path starting /contact. No approved public page
  emits that path: the form is /#contact and fragments are stripped. The existing
  rule/key-event history and purchase definition remain unchanged; neither is a
  claim of verified leads or sales.
- Existing retention preserved: event data 2 months, user data 14 months, reset on
  new activity on. The policy now discloses those settings. No historical data
  retention was reduced or deleted. Account-wide sharing was not changed.
- Tag quality warning identified as no data in the preceding 48 hours while the
  website was disabled. Google may take time to clear it after launch; actual
  DebugView receipt below is the delivery evidence.

## Minimal shipping instrumentation

- One manual page_view per document after consent. Only 15 approved public paths;
  unknown paths become /other/. Query strings, fragments, original titles and
  referrers excluded; the title is the approved path.
- Custom signals limited to phone_link_click and estimate_cta_click, carrying only
  a fixed location label: hero, contact, mobile_actions or site. Explicit send_to
  targets the verified stream. No phone number, link URL/text, form fields, CRM
  data, lead, purchase, navigation/service diagnostics or marketing parameters.
- Google can intrinsically record session_start, first_visit and user_engagement.
  It also processes online identifiers and browser/network information. These are
  not qualified lead counts. A phone click is not a completed call.
- Host-only root cookies, 180-day maximum, no rolling cookie refresh. Ads storage,
  ads user data, Signals and personalization disabled in the site configuration.

## Consent and privacy

All 15 public pages expose footer Privacy settings and an equal Allow/Reject
panel for undecided visitors. No Google tag is loaded before consent. Calls and
estimates work with either choice. Preferences store only version/value/time in
this origin's local storage, expire after 180 days, and do not renew on navigation.
Invalid/expired/future values, version mismatch and storage read failures default
to denied. Restoring saved opt-in requires writable storage; otherwise choices are
page-only with an explanation. Expiry/resume and cross-tab withdrawal are covered.

Withdrawal sets Google's disable flag first, denies analytics/ad consent, stops
custom events, clears bounded campaign attribution and attempts to expire only
_ga and this public stream's root cookie across host/current-domain variants.
Other streams, CRM/auth storage and estimate drafts remain untouched. It does not
claim to delete data already received by Google or inaccessible browser cookies.
The active privacy wording discloses provider processing, preferences, retention,
withdrawal limits and separate draft/marketing choices. Metadata, photos, service
copy, navigation and estimate links are preserved.

## Verification

npm run test:public: 152 tests pass; all 15 public pages validate. Tests cover the
master switch, explicit consent, safe payloads, storage/expiry edge cases, script
reuse, withdrawal/regrant, cookie targeting and existing draft/form interactions.
Mobile and keyboard checks passed in the reviewed consent patch; footer insertion
is scoped to preserve the privacy-request breadcrumb.

The default scripts/qa-public-analytics.py serves two loopback-only inert variants:
mock-enabled uses G-MOCKONLY and an inert local tag; control forces collection off.
Both block external network, forms and calls; neither changes source/dist gates.

Authorized actual-delivery testing uses the separate explicit command:

    python3 scripts/qa-public-analytics-live.py --allow-google --evidence-dir /absolute/local/folder

It serves the built public pages with an in-memory debug marker, CSP-limited
Google collection and hard blocking of forms/calls. It logs bounded event labels
and booleans only, never raw requests, client IDs or contact values. Test URL
DO_NOT_SEND is synthetic. It does not change the shipping artifact.

Actual Google DebugView confirmed receipt of page_view, phone_link_click and
estimate_cta_click, plus Google's session_start/first_visit. Before consent: no
collection attempts or public GA cookies. After consent: sanitized approved path,
no raw query/fragment/referrer, no synthetic canary or contact-data parameters.
Withdrawal cleared the public cookies and subsequent safe clicks added no events;
regrant added no duplicate document page view. Opaque fetch status 0 is not receipt
proof; the Google DebugView events provide that independent confirmation.

Before/after deployment IDs, production GET checks and screenshots are recorded
with the release evidence outside the shipping artifact. Do not submit production
leads to test analytics. Physical-device and spoken screen-reader checks remain
outside the local browser verification; later reports need normal processing time.
