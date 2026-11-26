# Globify Tech — Security

## Threat model summary

The platform stores personal data (students, applicants), financial records, credentials and graded work. Primary risks: account takeover, privilege escalation (student → admin), data exfiltration through APIs, tampering with grades/certificates/payments, malicious uploads, and secret leakage.

## Controls

### Authentication
- Passwords hashed with bcrypt (cost 12). Minimum 10 characters, checked against a small deny-list of common passwords.
- Sessions: Auth.js JWT in an HTTP-only, `SameSite=Lax`, `Secure` cookie. 30-day max age, rotated on privilege change via `User.sessionVersion`.
- Email verification and password reset use random 32-byte tokens stored hashed (SHA-256) with 1-hour expiry; single use.
- Sign-in, sign-up, reset, apply and contact are rate-limited (5/min/IP + 20/hour/email). AI endpoints are limited per user.
- Account lockout after 10 failed sign-ins in 15 minutes.

### Authorization
- RBAC matrix in `src/lib/rbac`. `requirePermission()` is the only path to a privileged write. UI checks are cosmetic.
- Row-level ownership assertions in services (instructor ↔ batch, student ↔ enrollment, counsellor ↔ lead).
- AI assistants receive a permission-filtered tool set; they cannot read data the requesting user cannot read.
- Audit log is append-only (DB grants revoke UPDATE/DELETE from the app role).

### Input handling
- Every server action and route handler parses input with Zod before touching services.
- Rich text is sanitized server-side with `sanitize-html` (allow-list) before storage and again at render.
- Prisma parameterizes all queries; raw SQL is limited to search and uses tagged templates.
- Uploads: allow-listed MIME + extension, size limits per kind (image 10 MB, document 25 MB, video 2 GB via multipart), file names normalized, served from a separate origin (storage), never executed.

### Web
- CSRF: Server Actions are protected by Next.js origin checks; API routes accept JSON only and verify `Origin` for cookie sessions; webhooks verify provider signatures.
- Security headers in `next.config.mjs`: CSP (script-src self + nonce, frame-ancestors none), HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, X-Frame-Options.
- XSS: React escaping + sanitized rich text + CSP.
- Secrets: only in environment variables, validated at boot by `src/config/env.ts`; client bundle only receives `NEXT_PUBLIC_*`.

### Data
- Sensitive fields (`Application.personal`, payment provider refs) are stored encrypted at rest at the database/disk level (the database host's disk encryption) and never logged.
- Soft deletes preserve referential integrity; hard purge is a scheduled job with retention policy.
- Backups encrypted, tested by the restore drill script.

### Payments
- Server creates provider sessions; the client never sees secrets. Webhooks are idempotent (`WebhookEvent.providerEventId` unique) and signature-verified. Amounts are recomputed server-side from invoice state, never trusted from the client.

### Certificates
- Certificate numbers are sequential per year; verification codes are random and unguessable. Revocation is immediate and audited.

### Operational
- Health endpoint without secrets. Structured logs without PII. Dependency audit in CI (`pnpm audit --prod`).

## Reporting
Security issues: security@globifytech.com. Do not open public issues for vulnerabilities.
