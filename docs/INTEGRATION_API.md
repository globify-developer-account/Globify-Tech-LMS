# Integration API — `/api/integration/v1`

A read-only, service-to-service API for **Hermes** (`hermes.globifytech.com`), Globify's staff operations platform. Browsers and the mobile app never call it. It is separate from `/api/v1`, which serves signed-in people.

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

## Routes (all `GET`)

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

## Not in v1

No write routes (enrollments, student tasks, notifications). They will arrive behind a separate `HERMES_INTEGRATION_WRITE_ENABLED` switch after the read API has run in production. `/api/integration/v1` is frozen once Hermes depends on it; breaking changes go to `/v2`.
