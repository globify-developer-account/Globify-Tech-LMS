# Globify Tech — Roadmap

Phases follow the build order in the master brief. Status reflects what is in this repository and what has actually been verified running, not what was planned.

## Verification at the time of writing

| Check | Result |
| --- | --- |
| `pnpm typecheck` | Passes |
| `pnpm lint` | 0 errors, 3 warnings from React Hook Form and TanStack Table |
| `pnpm test` | 122 tests pass across 7 files |
| `pnpm test:db` | Integration tests against a real MySQL / MariaDB (needs a throwaway seeded database) |
| `pnpm build` | Passes; 180 routes, 35 prerendered |
| Migrations | Both apply from an empty database |
| Seed | Runs end to end and is idempotent |
| Runtime | 38/38 admin, 16/16 instructor, 19/19 student pages and the employer portal render signed in, against seeded data |

## Phases

| Phase | Scope | Status |
|---|---|---|
| 0 | Product, database and design-system architecture (`docs/`) | Done |
| 1 | Project foundation, Prisma schema, Auth.js, RBAC, env validation | Done |
| 2 | Design tokens, UI primitives, public shell, app shells | Done |
| 3 | LMS backend: courses, modules, units, lessons, progress, completion engine | Done |
| 4 | Student experience: cockpit, course player, quizzes, assignments, projects, certificates, calendar, attendance, payments, career, portfolio, community, messages, notifications, settings, AI tutor | Done |
| 5 | Instructor Studio: course builder, batches, attendance, live classes, submissions, grading, analytics | Done |
| 6 | Admin Command Centre: dashboard, people, delivery, academics, settings, audit logs, command palette | Done |
| 7 | CMS: pages, section builder, navigation, blog, media, events, testimonials, FAQs | Done |
| 8 | CRM and admissions: pipeline board, activities, tasks, applications, decisions | Done |
| 9 | Finance: fee plans, invoices, payments, receipts, refunds, discounts, scholarships | Done |
| 10 | Certificates: issue, PDF, QR, public verification, revoke | Done |
| 11 | Career: skills, jobs, internships, employers, matching, portfolio, employer portal | Done |
| 12 | AI: provider abstraction, tutor, course builder (draft-gated), admin assistant (permission-aware), success engine | Done |
| 13 | Notifications and integrations: templates, in-app/email/WhatsApp/SMS drivers, payment and Zoom webhooks | Done |
| 14 | Analytics: admin, instructor and student analytics, CSV/Excel/PDF exports | Done |
| 15 | Security and performance: headers, rate limiting, caching, append-only audit log, full-text search | Done |
| 16 | Deployment: migrations, Docker, compose, backups, health, CI, docs | Done |

## Known gaps

These are real limitations, not oversights. They are listed so nobody discovers them in production.

**Payment providers are implemented but not certified.** Stripe and PayPal follow the documented APIs; JazzCash and Easypaisa follow their integration guides but have not been run against a live merchant account. Bank transfer and cash work fully today because they are recorded by staff. Certify the gateways before taking online payment at volume.

**Live class providers other than Zoom degrade to manual.** Zoom uses server-to-server OAuth and its webhooks are handled. Google Meet and Teams accept a meeting link that an instructor pastes in; there is no automatic room creation.

**Translations are stubs.** The i18n architecture is complete, including right-to-left support, and every string goes through it. The Urdu, Arabic and Punjabi bundles currently fall back to English and need a translator.

**AI features need a provider key.** Without one, the tutor, course builder and admin assistant show a clear "not configured" state rather than failing. That is deliberate, but it means those features are unproven against a live model in this repository.

**Exams have no proctoring.** Attempts are timed, shuffled and logged, but nothing prevents a student opening another window.

**No end-to-end browser tests.** Pages were verified by signing in and requesting every route, and the engines are unit tested, but there is no Playwright suite driving the interface.

## Next

- Native mobile apps consuming `/api/v1`, which already covers courses, the student dashboard, progress, notifications, payments, leads, applications and certificate verification.
- An OpenSearch driver for `SearchProvider`, which is already an interface.
- Production certification for JazzCash and Easypaisa.
- Live proctoring for exams.
- Urdu, Arabic and Punjabi translations.
- SCORM and xAPI import.
- Playwright coverage for the enrolment, payment and grading journeys.
