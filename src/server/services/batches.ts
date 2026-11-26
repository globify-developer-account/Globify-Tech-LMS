import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma, type Prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors";
import type { BatchInput } from "@/lib/validation/delivery";
import { notify } from "./notifications";
import { getSetting } from "./settings";
import { awardBadge } from "./gamification";
import type { AttendanceStatus, AttendanceMethod, BatchStatus } from "@prisma/client";

export async function createBatch(input: BatchInput) {
  const exists = await prisma.batch.findUnique({ where: { code: input.code } });
  if (exists) throw AppError.conflict(`Batch code ${input.code} is already in use.`);
  const { schedule, ...rest } = input;
  return prisma.batch.create({ data: { ...rest, endDate: rest.endDate ?? null, campusId: rest.campusId ?? null, classroomId: rest.classroomId ?? null, instructorId: rest.instructorId ?? null, schedule: { create: schedule } } });
}

export async function updateBatch(id: string, input: BatchInput) {
  const { schedule, ...rest } = input;
  return prisma.$transaction(async (tx) => {
    await tx.batchSchedule.deleteMany({ where: { batchId: id } });
    return tx.batch.update({ where: { id }, data: { ...rest, endDate: rest.endDate ?? null, campusId: rest.campusId ?? null, classroomId: rest.classroomId ?? null, instructorId: rest.instructorId ?? null, schedule: { create: schedule } } });
  });
}

export async function setBatchStatus(id: string, status: BatchStatus) {
  return prisma.batch.update({ where: { id }, data: { status } });
}

export async function listBatches(filters: { q?: string; courseId?: string; campusId?: string; instructorId?: string; status?: BatchStatus; page?: number; pageSize?: number }) {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;
  const where: Prisma.BatchWhereInput = {
    deletedAt: null,
    ...(filters.q ? { OR: [{ code: { contains: filters.q } }, { name: { contains: filters.q } }] } : {}),
    ...(filters.courseId ? { courseId: filters.courseId } : {}),
    ...(filters.campusId ? { campusId: filters.campusId } : {}),
    ...(filters.instructorId ? { instructorId: filters.instructorId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.batch.findMany({ where, orderBy: [{ startDate: "desc" }], skip: (page - 1) * pageSize, take: pageSize, include: { course: { select: { id: true, title: true } }, campus: { select: { name: true } }, classroom: { select: { name: true } }, instructor: { select: { id: true, user: { select: { name: true } } } }, schedule: true, _count: { select: { students: { where: { leftAt: null } } } } } }),
    prisma.batch.count({ where }),
  ]);
  return { items, total, page, pageSize };
}

export async function getBatch(id: string) {
  const batch = await prisma.batch.findFirst({
    where: { id, deletedAt: null },
    include: {
      course: { select: { id: true, title: true, slug: true } },
      campus: true,
      classroom: true,
      instructor: { include: { user: { select: { name: true, email: true, avatar: { select: { url: true } } } } } },
      schedule: { orderBy: { dayOfWeek: "asc" } },
      students: { where: { leftAt: null }, include: { student: { include: { user: { select: { name: true, email: true, phone: true, avatar: { select: { url: true } } } }, enrollments: { where: {}, select: { courseId: true, progress: { select: { percent: true } } } } } } } },
      liveClasses: { orderBy: { startsAt: "desc" }, take: 20 },
      _count: { select: { attendance: true } },
    },
  });
  if (!batch) throw AppError.notFound("Batch");
  return batch;
}

/** Instructor row-level guard. Academic managers pass through. */
export async function assertBatchAccess(batchId: string, instructorId: string | null, bypass: boolean) {
  if (bypass) return;
  const batch = await prisma.batch.findUnique({ where: { id: batchId }, select: { instructorId: true, course: { select: { instructors: { select: { instructorId: true } } } } } });
  if (!batch) throw AppError.notFound("Batch");
  const allowed = instructorId && (batch.instructorId === instructorId || batch.course.instructors.some((i) => i.instructorId === instructorId));
  if (!allowed) throw AppError.forbidden("You don't teach this batch.");
}

export async function addStudentsToBatch(batchId: string, studentIds: string[]) {
  const batch = await prisma.batch.findFirst({ where: { id: batchId, deletedAt: null }, include: { _count: { select: { students: { where: { leftAt: null } } } } } });
  if (!batch) throw AppError.notFound("Batch");
  if (batch._count.students + studentIds.length > batch.capacity) throw AppError.conflict(`Only ${batch.capacity - batch._count.students} seats are left in this batch.`);
  const { enrollStudent } = await import("./enrollments");
  for (const studentId of studentIds) await enrollStudent({ studentId, courseId: batch.courseId, batchId, source: "MANUAL" });
}

export async function removeStudentFromBatch(batchId: string, studentId: string) {
  await prisma.$transaction([
    prisma.batchStudent.updateMany({ where: { batchId, studentId }, data: { leftAt: new Date() } }),
    prisma.enrollment.updateMany({ where: { batchId, studentId }, data: { batchId: null } }),
  ]);
}

// ───────────── Attendance ─────────────

export async function markAttendance(params: { batchId: string; sessionDate: Date; liveClassId?: string | null; method: AttendanceMethod; markedById: string; entries: Array<{ studentId: string; status: AttendanceStatus; note?: string }> }) {
  const day = new Date(Date.UTC(params.sessionDate.getUTCFullYear(), params.sessionDate.getUTCMonth(), params.sessionDate.getUTCDate()));
  await prisma.$transaction(
    params.entries.map((e) =>
      prisma.attendance.upsert({
        where: { batchId_sessionDate_studentId: { batchId: params.batchId, sessionDate: day, studentId: e.studentId } },
        update: { status: e.status, method: params.method, markedById: params.markedById, note: e.note || null, liveClassId: params.liveClassId ?? null },
        create: { batchId: params.batchId, sessionDate: day, studentId: e.studentId, status: e.status, method: params.method, markedById: params.markedById, note: e.note || null, liveClassId: params.liveClassId ?? null },
      }),
    ),
  );
  await checkAttendanceWarnings(params.batchId, params.entries.map((e) => e.studentId));
}

export async function attendanceSummary(batchId: string, studentId: string) {
  const rows = await prisma.attendance.groupBy({ by: ["status"], where: { batchId, studentId }, _count: { _all: true } });
  const total = rows.reduce((s, r) => s + r._count._all, 0);
  const present = rows.filter((r) => r.status !== "ABSENT").reduce((s, r) => s + r._count._all, 0);
  const counts = Object.fromEntries(rows.map((r) => [r.status, r._count._all])) as Partial<Record<AttendanceStatus, number>>;
  return { total, present, percent: total ? Math.round((present / total) * 1000) / 10 : null, counts };
}

/** Sends an attendance warning when a student drops below the configured threshold. */
async function checkAttendanceWarnings(batchId: string, studentIds: string[]) {
  const warning = await getSetting("attendance.warningPercent");
  for (const studentId of studentIds) {
    const s = await attendanceSummary(batchId, studentId);
    if (s.total < 4 || s.percent == null) continue;
    const student = await prisma.studentProfile.findUnique({ where: { id: studentId }, select: { userId: true } });
    if (!student) continue;
    if (s.percent < warning) {
      const recent = await prisma.notification.findFirst({ where: { userId: student.userId, event: "ATTENDANCE_WARNING", createdAt: { gte: new Date(Date.now() - 7 * 86400000) } } });
      if (recent) continue;
      await notify({ userId: student.userId, event: "ATTENDANCE_WARNING", data: { percent: s.percent, threshold: warning }, href: "/student/attendance", fallback: { title: `Attendance at ${s.percent}%`, body: `Your attendance has fallen below ${warning}%. Attend the next sessions to stay eligible for certification.` } });
    } else if (s.percent === 100 && s.total >= 10) {
      await awardBadge(student.userId, "PERFECT_ATTENDANCE", { batchId });
    }
  }
}

export async function batchAttendanceMatrix(batchId: string) {
  const [students, records] = await Promise.all([
    prisma.batchStudent.findMany({ where: { batchId, leftAt: null }, include: { student: { include: { user: { select: { name: true, avatar: { select: { url: true } } } } } } } }),
    prisma.attendance.findMany({ where: { batchId }, orderBy: { sessionDate: "asc" } }),
  ]);
  const dates = [...new Set(records.map((r) => r.sessionDate.toISOString().slice(0, 10)))].sort();
  const rows = students.map((bs) => {
    const own = records.filter((r) => r.studentId === bs.studentId);
    const byDate = Object.fromEntries(own.map((r) => [r.sessionDate.toISOString().slice(0, 10), r.status]));
    const present = own.filter((r) => r.status !== "ABSENT").length;
    return { studentId: bs.studentId, name: bs.student.user.name, avatar: bs.student.user.avatar?.url ?? null, byDate, percent: own.length ? Math.round((present / own.length) * 100) : null };
  });
  return { dates, rows };
}

/** QR attendance: a short-lived signed token for a batch + date. */
export function attendanceQrToken(batchId: string, sessionDate: string, secret = process.env.AUTH_SECRET!): string {
  const expires = Date.now() + 10 * 60 * 1000;
  const payload = `${batchId}.${sessionDate}.${expires}`;
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function parseAttendanceQrToken(token: string, secret = process.env.AUTH_SECRET!): { batchId: string; sessionDate: string } | null {
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [batchId, sessionDate, expires, sig] = parts as [string, string, string, string];
  if (Number(expires) < Date.now()) return null;
  const expected = createHmac("sha256", secret).update(`${batchId}.${sessionDate}.${expires}`).digest("base64url");
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { batchId, sessionDate };
}

export async function studentCheckIn(studentId: string, token: string) {
  const parsed = parseAttendanceQrToken(token);
  if (!parsed) throw AppError.validation("This QR code has expired. Ask your instructor for a fresh one.");
  const member = await prisma.batchStudent.findUnique({ where: { batchId_studentId: { batchId: parsed.batchId, studentId } } });
  if (!member || member.leftAt) throw AppError.forbidden("You're not part of this batch.");
  const day = new Date(parsed.sessionDate);
  await prisma.attendance.upsert({
    where: { batchId_sessionDate_studentId: { batchId: parsed.batchId, sessionDate: day, studentId } },
    update: { status: "PRESENT", method: "QR" },
    create: { batchId: parsed.batchId, sessionDate: day, studentId, status: "PRESENT", method: "QR" },
  });
}
