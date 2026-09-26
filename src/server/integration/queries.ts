import "server-only";
import { z } from "zod";
import { prisma, type Prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors";
import { getSetting } from "@/server/services/settings";
import { toNumber } from "@/lib/utils";
import type { IntegrationResult } from "./respond";
import type { TeachingScope } from "./scope";

/**
 * Read models for /api/integration/v1. Every query names its fields
 * explicitly: no full Prisma row, no password hash, no internal JSON ever
 * leaves through this API. Statuses are the LMS's own enum values.
 */

const uuid = z.string().uuid();
const page = z.coerce.number().int().min(1).max(10_000).default(1);
const limit = z.coerce.number().int().min(1).max(100).default(25);
const date = z.coerce.date();
const text = z.string().trim().min(1).max(100);

/** Query-string → typed params. Empty values count as absent. */
export function parseQuery<T extends z.ZodTypeAny>(schema: T, req: Request): z.infer<T> {
  const params = Object.fromEntries([...new URL(req.url).searchParams].filter(([, v]) => v !== ""));
  return schema.parse(params);
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const skipTake = (q: { page: number; limit: number }) => ({ skip: (q.page - 1) * q.limit, take: q.limit });

// ── Students ────────────────────────────────────────────────

export const studentListQuery = z.object({
  q: text.optional(),
  phone: z.string().trim().max(30).optional(),
  courseId: uuid.optional(),
  batchId: uuid.optional(),
  status: z.enum(["ACTIVE", "SUSPENDED", "INVITED"]).optional(),
  page,
  limit,
});

const studentSelect = {
  id: true,
  userId: true,
  studentNumber: true,
  isTestData: true,
  createdAt: true,
  user: { select: { name: true, email: true, phone: true, whatsapp: true, status: true } },
  enrollments: { select: { courseId: true } },
  batches: { where: { leftAt: null }, select: { batchId: true } },
} satisfies Prisma.StudentProfileSelect;

function serializeStudent(s: Prisma.StudentProfileGetPayload<{ select: typeof studentSelect }>) {
  return {
    id: s.id,
    userId: s.userId,
    studentNumber: s.studentNumber,
    name: s.user.name,
    email: s.user.email,
    phone: s.user.phone,
    whatsapp: s.user.whatsapp,
    status: s.user.status,
    courseIds: [...new Set(s.enrollments.map((e) => e.courseId))],
    batchIds: s.batches.map((b) => b.batchId),
    isTestData: s.isTestData,
    createdAt: s.createdAt.toISOString(),
  };
}

function studentScopeWhere(scope: TeachingScope | null): Prisma.StudentProfileWhereInput {
  if (!scope) return {};
  return { OR: [{ batches: { some: { batchId: { in: scope.batchIds }, leftAt: null } } }, { enrollments: { some: { courseId: { in: scope.courseIds } } } }] };
}

/** Last ten digits, so "+92 300 1234567", "03001234567" and "923001234567" match. */
export function phoneKey(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

async function studentIdsByPhone(key: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    select s.id::text as id
    from students s join users u on u.id = s."userId"
    where right(regexp_replace(coalesce(u.phone, ''), '[^0-9]', '', 'g'), 10) = ${key}
       or right(regexp_replace(coalesce(u.whatsapp, ''), '[^0-9]', '', 'g'), 10) = ${key}`;
  return rows.map((r) => r.id);
}

export async function listStudents(q: z.infer<typeof studentListQuery>, scope: TeachingScope | null): Promise<IntegrationResult> {
  const and: Prisma.StudentProfileWhereInput[] = [{ user: { deletedAt: null } }, studentScopeWhere(scope)];
  if (q.status) and.push({ user: { status: q.status } });
  if (q.courseId) and.push({ enrollments: { some: { courseId: q.courseId } } });
  if (q.batchId) and.push({ batches: { some: { batchId: q.batchId, leftAt: null } } });
  if (q.q) {
    const contains = { contains: q.q, mode: "insensitive" as const };
    and.push({ OR: [{ studentNumber: contains }, { user: { name: contains } }, { user: { email: contains } }] });
  }
  if (q.phone) {
    const key = phoneKey(q.phone);
    if (!key) throw AppError.validation("phone must contain at least 10 digits.");
    and.push({ id: { in: await studentIdsByPhone(key) } });
  }
  const where = { AND: and };
  const [rows, total] = await Promise.all([
    prisma.studentProfile.findMany({ where, select: studentSelect, orderBy: { createdAt: "desc" }, ...skipTake(q) }),
    prisma.studentProfile.count({ where }),
  ]);
  return { data: rows.map(serializeStudent), pagination: { page: q.page, limit: q.limit, total } };
}

/** NOT_FOUND when the student does not exist, FORBIDDEN when it is outside the actor's scope. */
async function assertStudentVisible(studentId: string, scope: TeachingScope | null) {
  const exists = await prisma.studentProfile.findFirst({ where: { id: studentId, user: { deletedAt: null } }, select: { id: true } });
  if (!exists) throw AppError.notFound("Student");
  if (scope && !(await prisma.studentProfile.findFirst({ where: { AND: [{ id: studentId }, studentScopeWhere(scope)] }, select: { id: true } }))) {
    throw AppError.forbidden("The acting user does not teach this student.");
  }
}

export async function getStudent(studentId: string, scope: TeachingScope | null): Promise<IntegrationResult> {
  const id = uuid.parse(studentId);
  await assertStudentVisible(id, scope);
  const s = await prisma.studentProfile.findUniqueOrThrow({ where: { id }, select: studentSelect });
  return { data: serializeStudent(s) };
}

export async function listStudentEnrollments(studentId: string, scope: TeachingScope | null): Promise<IntegrationResult> {
  const id = uuid.parse(studentId);
  await assertStudentVisible(id, scope);
  const rows = await prisma.enrollment.findMany({
    where: { studentId: id, ...(scope ? { OR: [{ courseId: { in: scope.courseIds } }, { batchId: { in: scope.batchIds } }] } : {}) },
    select: { id: true, studentId: true, courseId: true, batchId: true, status: true, source: true, startedAt: true, completedAt: true, expiresAt: true },
    orderBy: { startedAt: "desc" },
  });
  return {
    data: rows.map((e) => ({
      id: e.id,
      studentId: e.studentId,
      courseId: e.courseId,
      batchId: e.batchId,
      status: e.status,
      source: e.source,
      enrolledAt: e.startedAt.toISOString(),
      completedAt: iso(e.completedAt),
      expiresAt: iso(e.expiresAt),
    })),
  };
}

// ── Courses ─────────────────────────────────────────────────

export const courseListQuery = z.object({
  q: text.optional(),
  status: z.enum(["DRAFT", "IN_REVIEW", "SCHEDULED", "PUBLISHED", "ARCHIVED"]).optional(),
  page,
  limit,
});

/** Without courses.read the actor sees the published catalogue only — the same as the public site. */
export async function listCourses(q: z.infer<typeof courseListQuery>, canReadDrafts: boolean): Promise<IntegrationResult> {
  if (!canReadDrafts && q.status && q.status !== "PUBLISHED") throw AppError.forbidden('Unpublished courses need the LMS permission "courses.read".');
  const status = canReadDrafts ? q.status : "PUBLISHED";
  const where: Prisma.CourseWhereInput = {
    deletedAt: null,
    ...(status ? { status } : {}),
    ...(q.q ? { OR: [{ title: { contains: q.q, mode: "insensitive" } }, { slug: { contains: q.q.toLowerCase() } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.course.findMany({
      where,
      select: { id: true, slug: true, title: true, status: true, level: true, mode: true, durationWeeks: true, price: true, discountPrice: true, currency: true, publishedAt: true, category: { select: { slug: true } } },
      orderBy: { title: "asc" },
      ...skipTake(q),
    }),
    prisma.course.count({ where }),
  ]);
  return {
    data: rows.map((c) => ({
      id: c.id,
      slug: c.slug,
      title: c.title,
      status: c.status,
      level: c.level,
      mode: c.mode,
      durationWeeks: c.durationWeeks,
      price: toNumber(c.price),
      discountPrice: c.discountPrice == null ? null : toNumber(c.discountPrice),
      currency: c.currency,
      categorySlug: c.category?.slug ?? null,
      publishedAt: iso(c.publishedAt),
    })),
    pagination: { page: q.page, limit: q.limit, total },
  };
}

// ── Batches ─────────────────────────────────────────────────

export const batchListQuery = z.object({
  courseId: uuid.optional(),
  status: z.enum(["PLANNED", "OPEN", "RUNNING", "COMPLETED", "CANCELLED"]).optional(),
  startFrom: date.optional(),
  startTo: date.optional(),
  page,
  limit,
});

export async function listBatches(q: z.infer<typeof batchListQuery>, scope: TeachingScope | null): Promise<IntegrationResult> {
  const where: Prisma.BatchWhereInput = {
    deletedAt: null,
    ...(scope ? { id: { in: scope.batchIds } } : {}),
    ...(q.courseId ? { courseId: q.courseId } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.startFrom || q.startTo ? { startDate: { ...(q.startFrom ? { gte: q.startFrom } : {}), ...(q.startTo ? { lte: q.startTo } : {}) } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.batch.findMany({
      where,
      select: {
        id: true,
        code: true,
        name: true,
        courseId: true,
        status: true,
        startDate: true,
        endDate: true,
        mode: true,
        capacity: true,
        campusId: true,
        instructorId: true,
        _count: { select: { students: { where: { leftAt: null } } } },
      },
      orderBy: { startDate: "desc" },
      ...skipTake(q),
    }),
    prisma.batch.count({ where }),
  ]);
  return {
    data: rows.map((b) => ({
      id: b.id,
      code: b.code,
      name: b.name,
      courseId: b.courseId,
      status: b.status,
      startDate: b.startDate.toISOString(),
      endDate: iso(b.endDate),
      mode: b.mode,
      capacity: b.capacity,
      campusId: b.campusId,
      instructorId: b.instructorId,
      studentCount: b._count.students,
    })),
    pagination: { page: q.page, limit: q.limit, total },
  };
}

export async function listBatchStudents(batchId: string, scope: TeachingScope | null): Promise<IntegrationResult> {
  const id = uuid.parse(batchId);
  const batch = await prisma.batch.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!batch) throw AppError.notFound("Batch");
  if (scope && !scope.batchIds.includes(id)) throw AppError.forbidden("The acting user does not teach this batch.");
  const rows = await prisma.batchStudent.findMany({
    where: { batchId: id, leftAt: null, student: { user: { deletedAt: null } } },
    select: { studentId: true, joinedAt: true, student: { select: { studentNumber: true, user: { select: { name: true } } } } },
    orderBy: { joinedAt: "asc" },
  });
  return { data: rows.map((r) => ({ studentId: r.studentId, studentNumber: r.student.studentNumber, name: r.student.user.name, joinedAt: r.joinedAt.toISOString() })) };
}

// ── Attendance ──────────────────────────────────────────────

export const attendanceQuery = z
  .object({ studentId: uuid.optional(), batchId: uuid.optional(), courseId: uuid.optional(), from: date.optional(), to: date.optional() })
  .refine((q) => q.studentId || q.batchId || q.courseId, { message: "Give studentId, batchId or courseId.", path: ["studentId"] });

const MAX_RECORDS = 500;

/** Same rule as the LMS everywhere else: LATE and EXCUSED count as attended; no records means no percentage. */
const percentage = (attended: number, total: number) => (total ? Math.round((attended / total) * 1000) / 10 : null);

export async function getAttendance(q: z.infer<typeof attendanceQuery>, scope: TeachingScope | null): Promise<IntegrationResult> {
  if (q.studentId) await assertStudentVisible(q.studentId, scope);
  if (scope && q.batchId && !scope.batchIds.includes(q.batchId)) throw AppError.forbidden("The acting user does not teach this batch.");
  const where: Prisma.AttendanceWhereInput = {
    ...(q.studentId ? { studentId: q.studentId } : {}),
    ...(q.batchId ? { batchId: q.batchId } : {}),
    ...(q.courseId ? { batch: { courseId: q.courseId } } : {}),
    ...(scope ? { batchId: q.batchId ?? { in: scope.batchIds } } : {}),
    ...(q.from || q.to ? { sessionDate: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } } : {}),
  };
  const [groups, records, warning, critical] = await Promise.all([
    prisma.attendance.groupBy({ by: ["studentId", "status"], where, _count: { _all: true } }),
    prisma.attendance.findMany({ where, select: { batchId: true, studentId: true, sessionDate: true, status: true }, orderBy: [{ sessionDate: "desc" }, { studentId: "asc" }], take: MAX_RECORDS + 1 }),
    getSetting("attendance.warningPercent"),
    getSetting("attendance.criticalPercent"),
  ]);

  const counts = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 };
  const perStudent = new Map<string, { total: number; attended: number }>();
  for (const g of groups) {
    const n = g._count._all;
    counts[g.status] += n;
    const s = perStudent.get(g.studentId) ?? { total: 0, attended: 0 };
    s.total += n;
    if (g.status !== "ABSENT") s.attended += n;
    perStudent.set(g.studentId, s);
  }
  const total = counts.PRESENT + counts.ABSENT + counts.LATE + counts.EXCUSED;
  const attended = total - counts.ABSENT;

  return {
    data: {
      summary: { totalSessions: total, attended, present: counts.PRESENT, absent: counts.ABSENT, late: counts.LATE, excused: counts.EXCUSED, percentage: percentage(attended, total) },
      byStudent: [...perStudent].map(([studentId, s]) => ({ studentId, totalSessions: s.total, attended: s.attended, percentage: percentage(s.attended, s.total) })),
      records: records.slice(0, MAX_RECORDS).map((r) => ({ batchId: r.batchId, studentId: r.studentId, sessionDate: r.sessionDate.toISOString().slice(0, 10), status: r.status })),
      recordsTruncated: records.length > MAX_RECORDS,
      thresholds: { warning, critical },
    },
  };
}

// ── Admissions ──────────────────────────────────────────────

export const admissionsQuery = z.object({
  status: z.enum(["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "WAITLISTED", "ENROLLED"]).optional(),
  courseId: uuid.optional(),
  from: date.optional(),
  to: date.optional(),
  page,
  limit,
});

function applicantName(personal: Prisma.JsonValue): string | null {
  if (!personal || typeof personal !== "object" || Array.isArray(personal)) return null;
  const p = personal as Record<string, unknown>;
  const name = [p.firstName, p.lastName].filter((v): v is string => typeof v === "string" && v.trim() !== "").join(" ").trim();
  return name || null;
}

/** Drafts are unfinished forms, so they are listed only when asked for by status. */
export async function listAdmissions(q: z.infer<typeof admissionsQuery>): Promise<IntegrationResult> {
  const where: Prisma.ApplicationWhereInput = {
    status: q.status ?? { not: "DRAFT" },
    ...(q.courseId ? { courseId: q.courseId } : {}),
    ...(q.from || q.to ? { submittedAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.application.findMany({
      where,
      select: { id: true, number: true, status: true, courseId: true, preferredBatchId: true, submittedAt: true, reviewedAt: true, createdAt: true, personal: true, lead: { select: { id: true } } },
      orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
      ...skipTake(q),
    }),
    prisma.application.count({ where }),
  ]);
  return {
    data: rows.map((a) => ({
      id: a.id,
      number: a.number,
      status: a.status,
      courseId: a.courseId,
      preferredBatchId: a.preferredBatchId,
      applicantName: applicantName(a.personal),
      leadId: a.lead?.id ?? null,
      submittedAt: iso(a.submittedAt),
      reviewedAt: iso(a.reviewedAt),
      createdAt: a.createdAt.toISOString(),
    })),
    pagination: { page: q.page, limit: q.limit, total },
  };
}

// ── Payments (read-only; Hermes never records or changes a payment) ──

export const paymentsQuery = z.object({
  studentId: uuid.optional(),
  status: z.enum(["PENDING", "SUCCEEDED", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED"]).optional(),
  from: date.optional(),
  to: date.optional(),
  page,
  limit,
});

/** from/to filter on paidAt, so a date range lists money actually received in it. */
export async function listPayments(q: z.infer<typeof paymentsQuery>): Promise<IntegrationResult> {
  const where: Prisma.PaymentWhereInput = {
    invoice: { deletedAt: null, ...(q.studentId ? { studentId: q.studentId } : {}) },
    ...(q.status ? { status: q.status } : {}),
    ...(q.from || q.to ? { paidAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      select: { id: true, invoiceId: true, provider: true, method: true, amount: true, currency: true, status: true, paidAt: true, createdAt: true, isTestData: true, invoice: { select: { number: true, studentId: true } } },
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
      ...skipTake(q),
    }),
    prisma.payment.count({ where }),
  ]);
  return {
    data: rows.map((p) => ({
      id: p.id,
      invoiceId: p.invoiceId,
      invoiceNumber: p.invoice.number,
      studentId: p.invoice.studentId,
      amount: toNumber(p.amount),
      currency: p.currency,
      status: p.status,
      provider: p.provider,
      method: p.method,
      paidAt: iso(p.paidAt),
      createdAt: p.createdAt.toISOString(),
      isTestData: p.isTestData,
    })),
    pagination: { page: q.page, limit: q.limit, total },
  };
}

// ─── Student tasks (Hermes Phase 5) ─────────────────────────────────────────

export const notifyBodySchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    body: z.string().trim().min(1).max(1000),
    /** Only somewhere in the student area of this site: never an outside link. */
    href: z.string().regex(/^\/student\/[A-Za-z0-9/_-]{1,200}$/),
  })
  .strict();

const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{8,200}$/;

/**
 * An in-app notification for one student from Hermes (a task, a reminder).
 * Written as an IN_APP row directly rather than through notify(), so an
 * admin template for another event can never replace Hermes's words.
 * Idempotent: the Idempotency-Key is stored in the row's data, and the same
 * key for the same student returns the first row.
 */
export async function notifyStudentFromHermes(studentId: string, idempotencyKey: string | null, raw: unknown, scope: TeachingScope | null, actorId: string): Promise<IntegrationResult> {
  const id = uuid.parse(studentId);
  if (!idempotencyKey || !IDEMPOTENCY_KEY.test(idempotencyKey)) throw AppError.validation("Idempotency-Key is required (8–200 letters, digits or . _ : -).");
  const input = notifyBodySchema.parse(raw);
  await assertStudentVisible(id, scope);
  const profile = await prisma.studentProfile.findUniqueOrThrow({ where: { id }, select: { userId: true } });

  const prior = await prisma.notification.findFirst({ where: { userId: profile.userId, channel: "IN_APP", data: { path: ["hermesKey"], equals: idempotencyKey } }, select: { id: true } });
  if (prior) return { data: { notificationId: prior.id, channel: "IN_APP", status: "SENT", replayed: true } };

  const row = await prisma.notification.create({
    data: {
      userId: profile.userId,
      event: "ANNOUNCEMENT",
      channel: "IN_APP",
      title: input.title,
      body: input.body,
      href: input.href,
      data: { hermesKey: idempotencyKey, source: "hermes", actorId },
      status: "SENT",
      sentAt: new Date(),
    },
    select: { id: true },
  });
  return { data: { notificationId: row.id, channel: "IN_APP", status: "SENT", replayed: false } };
}

/**
 * A short-lived link (10 minutes) to a file a student uploaded for a Hermes
 * task. Only private files in the student-content/ area; for an instructor,
 * only files from students they teach.
 */
export async function studentMediaReadUrl(mediaId: string, scope: TeachingScope | null, signedReadUrl: (key: string, seconds: number) => Promise<string>): Promise<IntegrationResult> {
  const id = uuid.parse(mediaId);
  const media = await prisma.media.findFirst({ where: { id, deletedAt: null }, select: { id: true, key: true, mime: true, size: true, fileName: true, isPublic: true, uploadedById: true } });
  if (!media || media.isPublic || !media.key.startsWith("student-content/") || !media.uploadedById) throw AppError.notFound("File");
  const owner = await prisma.studentProfile.findFirst({ where: { userId: media.uploadedById, ...studentScopeWhere(scope) }, select: { id: true } });
  if (!owner) throw scope ? AppError.forbidden("The acting user does not teach the student who uploaded this file.") : AppError.notFound("File");
  const seconds = 600;
  const url = await signedReadUrl(media.key, seconds);
  return { data: { mediaId: media.id, url, expiresAt: new Date(Date.now() + seconds * 1000).toISOString(), mime: media.mime, size: media.size, fileName: media.fileName } };
}
