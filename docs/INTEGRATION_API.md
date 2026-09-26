# Integration API — `/api/integration/v1`

A service-to-service API for **Hermes** (`hermes.globifytech.com`), Globify's staff operations platform. Browsers and the mobile app never call it. It is separate from `/api/v1`, which serves signed-in people.

Code: `src/server/integration/*` (auth, scope, queries, envelope) and `src/app/api/integration/v1/**/route.ts` (thin handlers). Tests: `tests/integration-api.test.ts`.

## Switching it on

The API is **off** until the server has at least one key hash. Without `HERMES_INTEGRATION_KEY_HASHES`, every route answers `501 INTEGRATION_NOT_CONFIGURED`, so deploying this code changes nothing on its own.

1. Hermes generates a key (`pnpm service-key` in the Hermes repository). It prints the key and its SHA-256 hash.
2. The **key** goes only into Hermes's environment (`LMS_SERVICE_TOKEN`).
3. The **hash** goes into this server's environment: `HERMES_INTEGRATION_KEY_HASHES=<hash>` (Hostinger → the LMS app → environment variables), then restart.

Rotation: add the new hash after a comma, switch Hermes to the new key, then remove the old hash.

## Every request

```http
Authorization: Bearer <service key>
X-Hermes-Actor-Id: <LMS User.id of the staff member Hermes is acting for>
X-Hermes-Actor-Type: user | workflow
X-Request-ID: <id>          # optional, echoed back
X-Correlation-ID: <id>      # optional, echoed back
```

Checks, in order: service key (constant-time against every configured hash) → rate limit (600/min) → acting user exists, is `ACTIVE` and not deleted → that user holds the route's LMS permission (`can()`, the same matrix as the admin panel). **The LMS decides what the acting user may see**; Hermes cannot widen it.

Instructors and teaching assistants whose permission comes only from a teaching role see only the batches and courses they teach — the Instructor Studio rule (`services/instructor-scope.ts`).

## Envelope

```json
{ "success": true,  "data": [], "meta": { "requestId": "…", "correlationId": "…", "pagination": { "page": 1, "limit": 25, "total": 24 } }, "error": null }
{ "success": false, "data": null, "meta": { "requestId": "…", "correlationId": "…" }, "error": { "code": "FORBIDDEN", "message": "…", "retryable": false } }
```

Error codes (Hermes vocabulary): `UNAUTHORIZED 401`, `FORBIDDEN 403`, `NOT_FOUND 404`, `VALIDATION_ERROR 422` (+ `fields`), `RATE_LIMITED 429`, `CONFLICT 409`, `INTEGRATION_NOT_CONFIGURED 501`, `INTERNAL_ERROR 500`. Internal messages are never returned.

## Read routes (`GET`)

`page` ≥ 1, `limit` 1–100 (default 25). Dates are ISO 8601. Statuses are the LMS's own enum values.

| Route | LMS permission | Query | Returns |
|---|---|---|---|
| `/health` | service key only | — | `service, api, writeEnabled, time` |
| `/students` | `students.read` | `q` (name, email, student number), `phone` (matches `phone` or `whatsapp` on the last 10 digits), `courseId`, `batchId`, `status` | `id` (StudentProfile), `userId, studentNumber, name, email, phone, whatsapp, status` (User.status), `courseIds[], batchIds[]` (current), `isTestData, createdAt` |
| `/students/:studentId` | `students.read` | — | one student as above |
| `/students/:studentId/enrollments` | `enrollments.read` | — | `id, studentId, courseId, batchId, status, source, enrolledAt, completedAt, expiresAt` |
| `/courses` | none for published; `courses.read` for any other `status` | `q`, `status` | `id, slug, title, status, level, mode, durationWeeks, price, discountPrice, currency, categorySlug, publishedAt` |
| `/batches` | `batches.read` | `courseId`, `status`, `startFrom`, `startTo` | `id, code, name, courseId, status, startDate, endDate, mode, capacity, campusId, instructorId, studentCount` (current members) |
| `/batches/:batchId/students` | `batches.read` + `students.read` | — | current members: `studentId, studentNumber, name, joinedAt` |
| `/attendance` | `attendance.read` | one of `studentId`, `batchId`, `courseId`; `from`, `to` | `summary {totalSessions, attended, present, absent, late, excused, percentage}`, `byStudent[]`, `records[]` (newest 500, `recordsTruncated`), `thresholds {warning, critical}` |
| `/admissions` | `applications.read` | `status` (drafts only when asked for), `courseId`, `from`, `to` (submittedAt) | `id, number, status, courseId, preferredBatchId, applicantName, leadId, submittedAt, reviewedAt, createdAt` |
| `/payments` | `payments.read` | `studentId`, `status`, `from`, `to` (paidAt) | `id, invoiceId, invoiceNumber, studentId, amount, currency, status, provider, method, paidAt, createdAt, isTestData` |

**Attendance:** `percentage` uses the LMS formula (records not `ABSENT` ÷ all records; `LATE` and `EXCUSED` count as attended) and is `null` when nothing has been recorded. Callers must show "no attendance recorded", never 0 %.

**Payments** are read-only. Nothing in this API records, changes or refunds money.

## Student tasks (Hermes Phase 5)

Tasks for students (photo requests, surveys, event confirmations…) are created and tracked in Hermes. **Students never use Hermes**: they see and answer tasks here, on the Tasks page of the student area, and their files stay in this site's storage.

### Two more integration routes

| Route | LMS permission | Notes |
|---|---|---|
| `POST /students/:studentId/notifications` | `students.update` **or** `notifications.manage` (teaching scope applies to `students.update`) | Write. Body `{ title (≤120), body (≤1000), href }`; `href` must be a path in the student area (`/student/…`). Header `Idempotency-Key` (8–200 of `A-Z a-z 0-9 . _ : -`) is required: the same key for the same student returns the first notification with `replayed: true`. Creates an `IN_APP` notification (`event: ANNOUNCEMENT`, `data.hermesKey = key`) directly, so no admin template can replace Hermes's words. Returns `notificationId, channel, status: "SENT", replayed` |
| `GET /media/:mediaId/read-url` | `students.read` | A 10-minute signed link to a student's task upload. Only private files in `student-content/`; for a teaching-only actor, only from students they teach. Returns `mediaId, url, expiresAt, mime, size, fileName` |

**Writes need a second switch.** Every write route answers `501 INTEGRATION_NOT_CONFIGURED` unless `HERMES_INTEGRATION_WRITE_ENABLED=true` (and `/health` reports `writeEnabled`). Turn it on only when Hermes should start notifying students.

### The student side

* `/student/tasks` and `/student/tasks/:assignmentId` read tasks from Hermes's student-portal API server to server (`src/server/hermes/portal.ts`), naming the signed-in student. Opening a task tells Hermes (it stops the "you haven't opened it" reminder).
* The hand-in form (`src/components/lms/hermes-task-form.tsx`) is the brief's §17: upload, optional caption, the two consent statements, Submit, then "Your submission has been received and is awaiting review."
* Uploads use the existing presign → PUT → complete flow into the folder `student-content/`, which `presignUpload` now marks **private** (`isPublic = false`). The submit action (`src/server/actions/hermes-tasks.ts`) sends Hermes only references to the student's own finished private uploads.
* Environment (LMS app): `HERMES_PORTAL_URL=https://hermes.globifytech.com` and `HERMES_PORTAL_KEY=<key>`. Generate the pair with `pnpm service-key portal` in the Hermes repository: the key goes here, its hash into Hermes (`HERMES_PORTAL_KEY_HASHES`). Without them the Tasks page says tasks are not available; nothing else changes.

### Private files

* **Local driver** (`STORAGE_DRIVER=local`): `GET /api/storage/<key>` serves a private file only with a valid read signature (`expires` + `rsig`, HMAC with `AUTH_SECRET`, separate from the upload signature so a read link can never overwrite a file) and `Cache-Control: private, no-store`. Public files are unchanged.
* **S3 driver**: links are S3 presigned GETs. The bucket (or at least the `student-content/` prefix) must **not** allow public reads.
* Production storage is still unproven (see Hermes `HERMES_CODEBASE_AUDIT.md` R7): check where uploads go on Hostinger before students are asked for photos. If `.storage` does not survive a redeploy, use S3-compatible storage.

## Not in v1

Enrollment writes and task creation in the LMS itself. `/api/integration/v1` is frozen once Hermes depends on it; breaking changes go to `/v2`.
