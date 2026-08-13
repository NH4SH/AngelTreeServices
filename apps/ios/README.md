# Angel Tree iOS

Native internal field app for Angel Tree Services. The web CRM remains the full office system; this app prioritizes today's work, schedule context, directions, and customer communication shortcuts.

## Requirements

- Xcode 16.4 or newer
- XcodeGen 2.43 or newer when regenerating the project
- iOS 16.0 or newer
- An existing authorized Angel Tree CRM account

iOS 16 is the minimum because it provides `NavigationStack`, adaptive SwiftUI navigation, and modern concurrency while retaining practical support for older field devices. Supabase Swift 2.55.0 is pinned through Swift Package Manager.

## Project structure

- `AngelTree/Application`: app lifecycle, authenticated state, and tab navigation
- `AngelTree/Configuration`: validated build configuration
- `AngelTree/Models`: access and normalized mobile schedule contracts
- `AngelTree/Services`: Supabase Auth, authenticated API, cache, and photo boundaries
- `AngelTree/Features`: Login, Today, Schedule, Customers, work detail, and More
- `AngelTree/Design`: native color, status, and surface tokens
- `AngelTreeTests`: configuration, access, timezone, mapping, and cache tests
- `project.yml`: reproducible XcodeGen project definition

## Configuration

1. Copy `Config/Local.xcconfig.example` to `Config/Local.xcconfig`.
2. Set `SUPABASE_URL` to the same project URL used by `apps/platform`.
3. Set `SUPABASE_PUBLISHABLE_KEY` to that project's publishable key, or its legacy anon key.
4. Leave `APP_BASE_URL` as `https://admin.angeltreeservices.org` for production builds. For local API testing, override it in `Local.xcconfig` with `http:/$()/localhost:3000`.

`Local.xcconfig` is ignored by Git. Never add a service-role key, Stripe secret, Resend key, database password, or other server credential to this app.

## Generate and run

```bash
cd /Users/noelsierra/ats/apps/ios
xcodegen generate
open AngelTree.xcodeproj
```

Choose an iPhone or iPad simulator and run the `AngelTree` scheme. The Supabase SDK uses its default Keychain-backed auth storage, so an existing CRM session is restored and refreshed by the SDK.

## Data and authorization

The app signs in directly with Supabase Auth using the publishable key. CRM data is loaded through two constrained Next.js endpoints:

- `GET /api/mobile/bootstrap`: resolves the caller's own profile, employee record, roles, and capabilities.
- `GET /api/mobile/schedule`: returns a one-to-seven-day schedule normalized by the existing web scheduler.

Both endpoints require a current Supabase bearer token. They create a request-scoped Supabase client with the publishable key and caller token, so existing RLS remains authoritative. `scope=team` is additionally limited to `owner` and `admin` in the API. Normal crew requests are filtered to the durable employee assignment and the auth identity.

The schedule endpoint reuses the CRM's current handling for:

- `schedule_events` and legacy `appointments`
- migrated appointment de-duplication
- `schedule_event_assignments` and `employee_records`
- cancelled multi-day work sessions
- Day X of Y sequencing
- customers, organizations, jobs, and service locations
- America/New_York schedule boundaries

Existing `GET /api/crew/jobs/[jobId]/photos` is wrapped behind `JobPhotoService` for the next read-only gallery phase. No photo mutation is enabled in this release.

## Current features

- Existing CRM email/password login and secure session restoration
- Active profile, employee, and role resolution
- Today agenda with My work and owner/admin Team scope
- Day and real seven-day week schedule navigation
- Work detail with separate work scope, team notes, and access/service notes
- Directions, Call, and Text system actions
- Scheduled-customer search scaffold populated from loaded field work
- Links to the full web CRM for office-only Jobs, Quotes, and Invoices
- Pull to refresh and foreground access refresh
- Last-loaded Today/week cache with a visible saved-data warning
- Dynamic Type, VoiceOver labels, semantic status icons, and 44-point controls
- V1 uses a fixed light appearance so system controls remain readable when the device uses Dark Mode

## Offline behavior

Today and schedule responses are stored as JSON in Application Support. When refresh fails, the most recently loaded range remains visible and is marked as saved/stale. Cache age is also treated as stale after 15 minutes. The app does not queue offline business or financial mutations.

## Tests

```bash
cd /Users/noelsierra/ats/apps/ios
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild test \
  -project AngelTree.xcodeproj \
  -scheme AngelTree \
  -destination 'platform=iOS Simulator,name=iPhone 16'
```

Choose an available simulator from `xcrun simctl list devices available` if that device is not installed.

## Security rules

- Supabase RLS and server authorization remain mandatory.
- Client role strings only shape the interface; the API and database enforce access.
- No service-role or private server credential belongs in the app.
- The initial app is read-only for financial and privileged CRM workflows.
- Internal/team notes are presented separately and are never relabeled as customer-facing scope.

## Deferred roadmap

1. Full customer search and native customer detail
2. Field job status, closeout, notes, and native photo capture/upload
3. Estimator customer, location, appointment, and proposal workflows
4. Owner/office dispatch and read-only financial overview
5. Push notifications, offline mutation queue, background uploads, deep links, and Face ID convenience unlock

Legacy appointments remain governed by their existing RLS. Crew visibility is strongest for normalized `schedule_events`; any remaining crew-assigned legacy appointment gap should be handled with a narrowly scoped reviewed policy or migration, not a client bypass.
