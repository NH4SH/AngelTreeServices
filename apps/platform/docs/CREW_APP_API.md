# Angel Tree Crew App API Contract

Status: foundation contract for a future native iOS or React Native crew app.

API version: `2026-05-31`

The crew API is a deliberately small boundary over the protected CRM. It is not a general CRM API. Responses expose only the field information needed to complete assigned work.

## Authentication

The future native app should use the official Supabase client to sign in with email and password. Supabase Auth returns an access token and refresh token. The Supabase SDK should own token refresh.

Send the current access token to every crew API request:

```http
Authorization: Bearer <supabase_access_token>
```

The Next.js route handler validates the token server-side with Supabase Auth, loads role assignments from `public.user_roles` and `public.roles`, and performs database queries with that same user token so RLS remains active.

Crew API access is available to:

```text
owner
admin
estimator
crew
```

The API does not use `SUPABASE_SERVICE_ROLE_KEY`. Customer and property-manager accounts are rejected.

## Response Envelope

Successful responses:

```json
{
  "data": {},
  "meta": {
    "apiVersion": "2026-05-31"
  }
}
```

Errors:

```json
{
  "error": {
    "code": "authentication_required",
    "message": "Provide a Supabase access token."
  },
  "meta": {
    "apiVersion": "2026-05-31"
  }
}
```

Every crew API response uses `Cache-Control: no-store`.

## Implemented Endpoints

### Today's Jobs

```http
GET /api/crew/jobs?scope=today&date=2026-05-31
```

Supported scopes:

```text
today
upcoming
active
```

`date` is optional and uses `YYYY-MM-DD`. If omitted, the server uses the current `America/New_York` date.

Example response:

```json
{
  "data": {
    "date": "2026-05-31",
    "scope": "today",
    "jobs": [
      {
        "id": "job-uuid",
        "status": "scheduled",
        "serviceType": "trimming",
        "priority": "normal",
        "scheduledStartAt": "2026-05-31T13:00:00.000Z",
        "scheduledEndAt": "2026-05-31T16:00:00.000Z",
        "scope": "Crew-visible requested scope",
        "customer": {
          "name": "Customer name",
          "phone": "Customer phone"
        },
        "serviceLocation": {
          "label": "Front yard",
          "street": "Service address",
          "city": "Fredericksburg",
          "state": "VA",
          "postalCode": "22401"
        },
        "photoSummary": {
          "before": 0,
          "after": 0,
          "issue": 0,
          "completion": 0
        },
        "actions": {
          "callUrl": "tel:...",
          "directionsUrl": "https://www.google.com/maps/search/?api=1&query=...",
          "messageUrl": "sms:..."
        }
      }
    ]
  },
  "meta": {
    "apiVersion": "2026-05-31"
  }
}
```

Assigned crew receive assigned jobs only. Owner, admin, and estimator accounts can inspect all crew jobs for office support.

### Job Detail

```http
GET /api/crew/jobs/{jobId}
```

The detail response adds:

```json
{
  "completedAt": null,
  "serviceLocation": {
    "label": "Front yard",
    "street": "Service address",
    "city": "Fredericksburg",
    "state": "VA",
    "postalCode": "22401",
    "accessNotes": "Crew-visible access note",
    "gateCode": null,
    "serviceNotes": "Crew-visible service note"
  },
  "crewVisibleNotes": [
    {
      "id": "note-uuid",
      "body": "Field note",
      "createdAt": "2026-05-31T12:00:00.000Z"
    }
  ],
  "completionChecklist": {
    "persisted": false,
    "items": [
      {
        "label": "Before photos uploaded",
        "completed": false
      }
    ]
  }
}
```

Checklist values are intentionally marked `persisted: false`. The current web checklist is local UI state.

### Private Job Photos

```http
GET /api/crew/jobs/{jobId}/photos
```

Returns private job-photo metadata and short-lived signed preview URLs:

```json
{
  "data": {
    "photos": [
      {
        "id": "photo-uuid",
        "photoType": "before",
        "caption": "Optional field note",
        "createdAt": "2026-05-31T12:00:00.000Z",
        "signedUrl": "temporary-signed-url"
      }
    ],
    "warning": null
  }
}
```

Storage paths are not returned. The `job-photos` bucket remains private.

### Upload Photo

```http
POST /api/crew/jobs/{jobId}/photos
Content-Type: multipart/form-data
```

Multipart fields:

```text
photo       required image file
photo_type  required: before | after | issue | completion
caption     optional, maximum 240 characters
```

The server validates the authenticated user, job assignment, MIME type, 6 MB maximum file size, photo type, private storage path, and metadata insert. If metadata insertion fails after upload, the uploaded object is removed.

Example success:

```json
{
  "data": {
    "message": "Photo uploaded and attached to the job.",
    "photo": {
      "caption": "Optional field note",
      "photoType": "before"
    }
  }
}
```

Refresh the photo list after upload to receive a temporary preview URL.

## Planned Endpoints

These contracts are documented but intentionally not active yet.

### Update Job Status

```http
POST /api/crew/jobs/{jobId}/status
Content-Type: application/json
```

Request:

```json
{
  "nextStatus": "in_progress"
}
```

Allowed transitions:

```text
scheduled -> in_progress
in_progress -> completed
```

Before activation, add a narrow database policy and transition guard for assigned crew updates. Do not broadly grant arbitrary job updates to crew accounts.

### Persist Completion Checklist

```http
PUT /api/crew/jobs/{jobId}/checklist
Content-Type: application/json
```

Proposed request:

```json
{
  "items": [
    {
      "key": "before_photos_uploaded",
      "completed": true
    }
  ]
}
```

Before activation, add a `job_checklist_items` table with assignment-scoped RLS, audit fields, and stable item keys.

### Offline Field Notes

```http
POST /api/crew/jobs/{jobId}/notes
Content-Type: application/json
```

Proposed request:

```json
{
  "clientMutationId": "device-generated-uuid",
  "body": "Crew note captured offline",
  "capturedAt": "2026-05-31T12:00:00.000Z"
}
```

Before activation, add idempotency support for `clientMutationId`, conflict handling, retry rules, and assignment-scoped insert policies. New field notes must default to `crew_visible` unless an office workflow explicitly promotes them.

## Minimal Data Boundary

Crew API responses may include:

- Assigned jobs.
- Customer name and phone needed for the active job.
- Service location and directions link.
- Requested scope.
- Crew-visible notes only.
- Private photo status and temporary previews.
- Local checklist shape.

Crew API responses must not include:

- Unrelated jobs or customer history.
- Customer email, billing records, invoice values, payments, or quotes.
- Internal-only notes.
- Marketing analytics.
- Storage paths.
- Service-role credentials.

## Native App Product Notes

- Put today's jobs first.
- Use large tap targets for Directions, Call, Photos, Start, and Complete.
- Make camera upload the shortest path in the app.
- Keep typing optional and brief.
- Queue uploads and field-note mutations locally when offline support is introduced.
- Show sync state clearly: pending, uploaded, failed, or needs attention.
- Treat signed photo URLs as temporary and refresh them when needed.

## Security Assumptions

- Apply `supabase/migrations/0004_job_photo_storage.sql`.
- Create `job-photos` as a private Supabase Storage bucket.
- Keep RLS enabled.
- Keep the bucket private.
- Do not expose `SUPABASE_SERVICE_ROLE_KEY` to the native app or browser.
- Continue checking assignment in both the app layer and RLS.
- Add narrow policies and server validation before activating status, checklist, or note writes.
