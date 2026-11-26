# Globify Tech — Technical Architecture

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16 (App Router, React 19, Server Components, Server Actions) | One codebase for SSR marketing pages, app shells and API routes |
| Language | TypeScript (strict) | End-to-end types from Prisma → server → client |
| Styling | Tailwind CSS v4 with centralized design tokens in `src/app/globals.css` | Token-driven, no per-component color decisions |
| UI primitives | Radix UI (via `radix-ui`), shadcn-style components in `src/components/ui` | Accessible by default |
| Motion | `motion` (Framer Motion) | Fast, subtle, purposeful transitions |
| 3D | React Three Fiber + drei (homepage hero only, lazy-loaded) | Used where it earns its place |
| Database | MySQL 8+ / MariaDB 10.11+ (MariaDB 11.8 on Hostinger) | Relational, full-text search, included with the hosting plan |
| ORM | Prisma 6 | Typed schema, migrations, seed |
| Auth | Auth.js v5 (credentials + OAuth-ready), JWT sessions | Works in Server Components, Server Actions, Route Handlers and edge proxy |
| Validation | Zod (shared schemas in `src/lib/validation`) | Same schema on client form and server action |
| Forms | React Hook Form + `@hookform/resolvers` | |
| Charts | Recharts (restrained set: line, area, bar, funnel, progress) | |
| Storage | S3-compatible (`@aws-sdk/client-s3`), local disk driver for dev | Provider abstraction |
| Cache/queue | Redis + BullMQ, with in-process fallback when `REDIS_URL` is unset | Background jobs never block requests |
| Search | InnoDB `FULLTEXT` indexes behind `SearchProvider` | OpenSearch drop-in later |
| AI | Vercel AI SDK with OpenAI / Anthropic / Google adapters behind `src/server/ai/provider.ts` | Never hard-coded to one vendor |
| Email | Nodemailer SMTP / Resend HTTP / console driver | Provider abstraction |
| WhatsApp | Meta Cloud API driver, console driver | Tokens server-only |
| Payments | Stripe / PayPal / JazzCash / Easypaisa / Bank transfer drivers | Provider abstraction |
| Live classes | Zoom / Google Meet / Microsoft Teams / manual link drivers | Provider abstraction |
| i18n | `next-intl` without locale routing, messages in `src/i18n/messages/*.json` | No hard-coded UI strings; Urdu/Arabic/Punjabi ready (RTL aware) |
| Tests | Vitest | Logic, authorization, workflows |

## 2. Source layout

```
src/
├── app/                      # Next.js routes
│   ├── (public)/             # Marketing site + marketplace (CMS-driven)
│   ├── (auth)/               # sign-in, sign-up, reset, verify
│   ├── (student)/student/    # Student LMS
│   ├── (instructor)/instructor/
│   ├── (admin)/admin/
│   ├── portfolio/[username]/
│   ├── verify/[certificateId]/
│   └── api/                  # auth, v1 REST, webhooks, uploads
├── components/
│   ├── ui/                   # Design-system primitives (Button, Input, Dialog…)
│   ├── lms/                  # CourseCard, LessonCard, CourseProgress, AIChat…
│   ├── crm/                  # LeadPipeline, LeadTimeline…
│   ├── admin/                # StatCard, DataToolbar, BulkActions…
│   ├── marketing/            # Homepage sections, page-builder section renderers
│   ├── charts/               # Recharts wrappers
│   └── layout/               # AppShell, Sidebar, Navbar, CommandPalette
├── server/                   # Server-only code (never imported by client)
│   ├── auth/                 # Auth.js config, session helpers, RBAC guards
│   ├── db/                   # Prisma client
│   ├── services/             # Domain services (courses, enrollments, payments…)
│   ├── actions/              # Server Actions (thin: validate → authorize → service)
│   ├── ai/                   # Provider abstraction, tutor, course builder, admin assistant, risk engine
│   ├── providers/            # storage, email, whatsapp, payments, live-class, search
│   ├── jobs/                 # BullMQ queues, processors, worker entry
│   └── audit/                # Audit logging
├── lib/                      # Shared isomorphic utilities
│   ├── rbac/                 # Roles, permissions matrix (pure, testable)
│   ├── validation/           # Zod schemas
│   ├── seo/                  # Metadata + JSON-LD builders
│   └── utils/
├── i18n/                     # next-intl config + messages
├── config/                   # Site config, navigation, env parsing
└── styles/                   # tokens.css (design tokens), globals
prisma/
├── schema.prisma
├── migrations/
└── seed.ts
docs/
```

## 3. Request flow

```
Browser ──► proxy.ts (edge)            : session cookie check, coarse route gating, security headers
        ──► Server Component (RSC)     : getSession() → requirePermission() → service.read()
        ──► Server Action              : zod.parse(input) → requirePermission() → service.write() → audit.log() → revalidate
        ──► Route Handler /api/v1/*    : bearer or cookie session → same services → JSON (mobile clients)
```

Rules:

1. **Services own the business logic.** Server Actions and Route Handlers are thin adapters. Mobile apps call the same services through `/api/v1`.
2. **Authorization is server-side and mandatory.** `requirePermission(session, "courses.update")` runs inside every write path; the UI only hides what the user cannot do.
3. **Every sensitive write is audited.** `audit.log({ actor, action, entity, before, after })`.
4. **Slow work is queued.** Email, WhatsApp, PDF generation, AI summaries, risk scoring and notifications run via BullMQ jobs.
5. **Data is scoped by campus** where the entity is campus-bound (batches, classrooms, staff assignments).

## 4. Authentication architecture

- Auth.js v5 with a Credentials provider (email + password, bcrypt cost 12) and OAuth-ready configuration (Google can be enabled with env vars).
- Sessions are JWTs (HTTP-only, `SameSite=Lax`, `Secure` in production) containing `userId`, `roles[]` and a `permissionsVersion`. Permissions are resolved server-side from the DB on each privileged request, never trusted from the token.
- Email verification and password reset use single-use hashed tokens with expiry (`VerificationToken`).
- Rate limiting on sign-in, sign-up, password reset, apply, contact and AI endpoints (Redis sliding window; in-memory fallback in dev).
- Sessions can be invalidated by bumping `User.sessionVersion`.

## 5. Permission architecture

See `src/lib/rbac/permissions.ts`. Roles map to permission sets; users can hold multiple roles (e.g. `INSTRUCTOR` + `CONTENT_MANAGER`). Permissions are strings of the form `resource.action` (`courses.publish`, `payments.refund`, `certificates.issue`). Row-level checks (an instructor may only grade submissions in their own batches) live in services as `assertOwnsBatch(...)` style guards.

## 6. Application architecture (per surface)

- **Public**: RSC pages fetch CMS content from the database, cached per route with tag-based revalidation (`revalidateTag("page:home")`). Page sections are rendered from `PageSection.type` via a section registry.
- **Student**: mobile-first shell; dashboard aggregates via one service call `getStudentCockpit(userId)`; course player uses client components for video and notes with server actions for progress.
- **Instructor**: desktop/tablet shell; course builder edits drafts; publishing is gated by `courses.publish`.
- **Admin**: desktop-first shell with sidebar, command palette (⌘K) and data tables with server-side pagination.

## 7. Storage architecture

`StorageProvider` interface: `putObject`, `getSignedUploadUrl`, `getSignedReadUrl`, `deleteObject`. Drivers: `s3` (any S3-compatible: AWS, Cloudflare R2, MinIO) and `local` (dev, writes to `.storage/`). Uploads go **direct to storage** via presigned URLs; the server only receives metadata. Every upload is validated (MIME, size, extension) and recorded in `Media`.

## 8. Caching and background jobs

- Redis (optional) is used for rate limiting, session revocation lists and BullMQ.
- Queues: `email`, `whatsapp`, `notifications`, `certificates`, `ai`, `analytics`. Processors in `src/server/jobs/processors`. Worker entry `pnpm worker`.
- Without `REDIS_URL`, jobs execute in-process after the response (`after()`), so dev never needs Redis.

## 9. Mobile readiness

All student and instructor capabilities are exposed under `/api/v1` with bearer-token auth (`Authorization: Bearer <session JWT>`), cursor pagination and consistent `{ data, error, meta }` envelopes. See `docs/API.md`.

## 10. Multi-campus

`Campus` is a root entity. Classrooms, batches, staff assignments and attendance are campus-scoped. Users hold `campusId` memberships via `StaffProfile.campusId`; students inherit campus from their batch. Global roles (`SUPER_ADMIN`, `ADMIN`) see all campuses; campus-scoped roles are filtered by `campusId`.

## 11. Internationalization

`next-intl` without URL locale prefixes. Locale comes from user preference → cookie → `Accept-Language` → `en`. Messages live in `src/i18n/messages/{en,ur,ar,pa}.json`; `dir="rtl"` is applied for `ur` and `ar`. Domain content (courses, pages) is stored per-locale-ready via `locale` columns on CMS entities.

## 12. Observability

Structured JSON logs (`src/server/log.ts`), request IDs, audit logs in DB, health check at `/api/health`, and hooks for OpenTelemetry via `instrumentation.ts`.
