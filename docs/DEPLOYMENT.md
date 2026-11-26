# Globify Tech — Deployment

## Topology

```
                    ┌──────────────┐
  Users ── CDN ───► │ Next.js app  │ ──► MySQL / MariaDB (Hostinger)
                    │ (2+ replicas)│ ──► Redis (rate limit, queues)
                    └──────┬───────┘ ──► S3-compatible storage (media, PDFs)
                           │
                    ┌──────▼───────┐
                    │ Worker (BullMQ) │ ──► Email / WhatsApp / AI / PDF jobs
                    └──────────────┘
```

Any Node host works (Vercel, Fly.io, Railway, Render, a VPS with Docker). The worker (`pnpm worker`) runs as a separate process. Without Redis the app still runs with in-process jobs (fine for a single instance).

## Environment variables

Copy `.env.example` → `.env` and fill in real values. Never commit `.env`.

| Group | Variables |
|---|---|
| Core | `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `NEXT_PUBLIC_APP_URL` |
| Storage | `STORAGE_DRIVER` (`local`\|`s3`), `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL` |
| Email | `EMAIL_DRIVER` (`console`\|`smtp`\|`resend`), `EMAIL_FROM`, `SMTP_*`, `RESEND_API_KEY` |
| AI | `AI_PROVIDER` (`openai`\|`anthropic`\|`google`), `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `AI_MODEL` |
| Payments | `PAYMENT_PROVIDERS`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PAYPAL_*`, `JAZZCASH_*`, `EASYPAISA_*` |
| WhatsApp | `WHATSAPP_DRIVER`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` |
| Live | `LIVE_CLASS_DRIVER`, `ZOOM_*`, `GOOGLE_MEET_*`, `TEAMS_*` |
| Infra | `REDIS_URL`, `LOG_LEVEL` |

`src/config/env.ts` validates these at boot and fails fast with a readable message.

## Local development

```bash
pnpm install
cp .env.example .env            # set DATABASE_URL
docker compose up -d            # MariaDB 11.8 + Redis (docker-compose.yml)
pnpm db:migrate                 # applies prisma/migrations
pnpm db:seed                    # realistic fictional data (clearly marked)
pnpm dev                        # http://localhost:3000
pnpm worker                     # optional: background jobs
```

Seed accounts (password `Globify!2026` for all):

| Role | Email |
|---|---|
| Super admin | superadmin@globifytech.test |
| Admin | admin@globifytech.test |
| Instructor | instructor1@globifytech.test … instructor5 |
| Student | student1@globifytech.test … student20 |

## Production build

```bash
pnpm verify        # typecheck + lint + tests + build
pnpm db:deploy     # migrations
pnpm start
```

Docker: `Dockerfile` builds a standalone Next.js image; `docker-compose.prod.yml` shows app + worker + MariaDB + Redis + MinIO.

## Backups

- Database: nightly gzipped `mysqldump` (schema, data and triggers) uploaded to the backup bucket (`scripts/backup-db.sh`), 30-day retention, plus Hostinger's own daily backups.
- Media: bucket versioning + lifecycle rules; weekly sync to a second region.
- Restore drill: `scripts/restore-db.sh <dump>` into a scratch database, then run `pnpm test:smoke`.
- Monitoring: the backup job posts to `/api/internal/backup-heartbeat`; if no heartbeat within 26h, an admin alert notification is created and emailed.

## Observability

- `/api/health` returns `{ status, db, redis, storage }`.
- Structured logs to stdout; ship to Datadog/Logtail/etc.
- `instrumentation.ts` registers OpenTelemetry when `OTEL_EXPORTER_OTLP_ENDPOINT` is set.

## Release checklist

1. `pnpm verify` green.
2. Migrations reviewed; destructive changes need a two-step (expand → migrate → contract).
3. Env vars present in target environment.
4. Run `pnpm db:deploy` before switching traffic.
5. Smoke: sign in as student, open a lesson, submit a quiz; sign in as admin, open dashboard.
