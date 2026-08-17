# Angel Tree iOS App Store Privacy Worksheet

Last reviewed: 2026-08-15

This worksheet is based on the repository and must be reconciled with production configuration and App Store Connect before submission. Apple’s definitions and current forms control if they differ from this document.

Official references:

- [App privacy details](https://developer.apple.com/app-store/app-privacy-details/)
- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Offering account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/)
- [Privacy manifest files](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files)
- [Required-reason APIs](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api)

## App purpose and users

Angel Tree is an authenticated employee/contractor field-operations app. It shows role-appropriate schedules and company records and allows staff to update operational information and job documentation. It is not a consumer quote or payment app.

## Proposed App Store Connect answers

| Apple category | Collected by iOS app? | Linked to user? | Tracking? | Purpose | Basis / caution |
|---|---:|---:|---:|---|---|
| Name | Yes | Yes | No | App Functionality | Staff profile/display name is returned after authentication. |
| Email Address | Yes | Yes | No | App Functionality | Used for Supabase authentication and account identity. |
| User ID | Yes | Yes | No | App Functionality | Supabase user ID and role/access identity. |
| Physical Address | Review conservatively as Yes | Yes | No | App Functionality | Staff can view and may submit customer service-location addresses. Confirm Apple’s treatment of customer data entered by an employee user. This is not device geolocation. |
| Phone Number | Review conservatively as Yes | Yes | No | App Functionality | Customer phone data can be entered or updated in operational workflows. It is not necessarily the app user’s phone number. |
| Photos or Videos | Yes | Yes | No | App Functionality | Staff-selected or camera-captured job photos are uploaded with authenticated job context. |
| Other User Content | Yes | Yes | No | App Functionality | Job notes, captions, customer/business details, and operational updates. |
| Payment Info | No | N/A | No | N/A | The app does not collect raw payment-card credentials. |
| Precise Location / Coarse Location | No | N/A | No | N/A | No Core Location usage or location permission found. Physical service addresses are a separate category. |
| Contacts, Health, Fitness, Sensitive Info | No | N/A | No | N/A | No relevant collection found. |
| Device ID, Advertising Data | No | N/A | No | N/A | No IDFA, ad SDK, or ATT usage found. |
| Product Interaction / Diagnostics | No direct collection found | N/A | No | N/A | No app analytics or crash-reporting SDK is configured. Recheck production dependencies and Xcode privacy report. |

Do not mark data as used for third-party advertising, developer advertising/marketing, or tracking based on the current implementation.

## Tracking

Current answer: **No**.

No code or SDK was found that links iOS user/device data with data from other companies for targeted advertising, advertising measurement, or data-broker purposes. The transitive presence of OpenTelemetry core code does not by itself prove telemetry collection. Reassess if analytics, attribution, advertising, or cross-company identity matching is added.

## Permissions

- `NSCameraUsageDescription`: present and limited to documenting assigned job conditions and completed field work.
- Photo library: the app uses `PhotosPicker`, which provides user-selected items without broad library access. No broad photo-library usage description was found or currently justified.
- Location, microphone, contacts, calendar, Bluetooth, and tracking: no permission request found.

## Account deletion

Account creation applies because employees can create a sign-in/access request through the related web platform even though iOS itself only presents sign-in. The app now links from **More → Privacy & Data** to a verified account-removal/privacy-request process.

The request flow initiates deletion or access removal; it does not silently delete business records. Authentication access, staff profile data, and historical customer/job/accounting/safety records have different retention requirements.

## Privacy manifest and required-reason APIs

No app-authored `PrivacyInfo.xcprivacy` was present during review. No direct app use of a required-reason API category was confirmed. The Supabase Swift package dependency graph and all embedded frameworks must be checked in the final archive privacy report.

A speculative manifest was not added merely to produce a file: an inaccurate empty data declaration would be worse than no app manifest when none is currently required. Before submission:

1. Archive the Release configuration in the submission Xcode version.
2. Review Xcode’s generated privacy report for the app and every embedded SDK.
3. Confirm current Apple listed-SDK signature/manifest requirements.
4. Add an app privacy manifest if Xcode identifies required-reason API use or the release process requires app-level declarations.
5. Keep App Store Connect labels aligned with actual production behavior even when a manifest is not required.

## Device storage

The app caches schedules and limited customer, service-location, job, quote, and invoice summaries for operations. An App Group widget snapshot can include the signed-in user ID, work title, customer/party name, city, status, and time. Sign-out clears schedule/field caches and the widget snapshot. The Supabase SDK uses Keychain-backed authentication storage.

Apple states that data processed only on-device is not “collected” for App Store privacy labels. Data transmitted to Angel Tree/Supabase through app workflows is collected and should be disclosed as above.

## Submission checklist

- Verify the public policy URL is `https://angeltreeservices.org/privacy/`.
- Verify the privacy-request/account-removal URL is `https://angeltreeservices.org/privacy-request/`.
- Test both links from signed-out and signed-in contexts.
- Test camera denial, photo selection, sign-out cache clearing, and account-removal initiation.
- Review the final Xcode archive privacy report and dependency signatures.
- Reconcile these answers with production network traffic and enabled provider configuration.
- Confirm no analytics, crash reporting, advertising, or device permission was added since this review.
