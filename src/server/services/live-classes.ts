import "server-only";
import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors";
import type { LiveClassInput } from "@/lib/validation/delivery";
import { liveClassProvider } from "@/server/providers/live-class";
import { notify } from "./notifications";
import { enqueue } from "@/server/jobs";
import { formatDateTime } from "@/lib/utils";

export async function scheduleLiveClass(input: LiveClassInput, hostId: string) {
  const host = await prisma.user.findUnique({ where: { id: hostId }, select: { email: true } });
  let meeting = { provider: input.provider, meetingId: input.meetingId || null, joinUrl: input.meetingUrl || null, passcode: input.meetingPasscode || null };
  if (!meeting.joinUrl && input.provider !== "MANUAL") {
    const attendeeEmails = input.provider === "GOOGLE_MEET" ? await classEmails(input.courseId, input.batchId ?? null) : undefined;
    const created = await liveClassProvider(input.provider).createMeeting({ title: input.title, startsAt: input.startsAt, endsAt: input.endsAt, hostEmail: host?.email, description: input.description, attendeeEmails });
    meeting = { provider: created.provider, meetingId: created.meetingId, joinUrl: created.joinUrl, passcode: created.passcode };
  }
  const liveClass = await prisma.liveClass.create({
    data: {
      courseId: input.courseId,
      batchId: input.batchId ?? null,
      lessonId: input.lessonId ?? null,
      hostId,
      title: input.title,
      description: input.description || null,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      provider: meeting.provider,
      meetingUrl: meeting.joinUrl,
      meetingId: meeting.meetingId,
      meetingPasscode: meeting.passcode,
    },
  });
  await notifyBatch(liveClass.id, "scheduled");
  // One-hour reminders are sent by the scheduled `sendUpcomingClassReminders` job.
  return liveClass;
}

export async function updateLiveClass(id: string, input: { status?: "SCHEDULED" | "LIVE" | "COMPLETED" | "CANCELLED"; notes?: string; recordingUrl?: string; recordingMediaId?: string | null; transcript?: string }) {
  const existing = await prisma.liveClass.findUnique({ where: { id } });
  if (!existing) throw AppError.notFound("Live class");
  const updated = await prisma.liveClass.update({
    where: { id },
    data: { status: input.status ?? undefined, notes: input.notes ?? undefined, transcript: input.transcript || undefined },
  });
  if (input.recordingUrl || input.recordingMediaId) {
    await prisma.liveClassRecording.create({ data: { liveClassId: id, url: input.recordingUrl || null, mediaId: input.recordingMediaId ?? null } });
  }
  if (input.status === "CANCELLED") {
    if (existing.meetingId && (existing.provider === "ZOOM" || existing.provider === "GOOGLE_MEET")) await liveClassProvider(existing.provider).cancelMeeting(existing.meetingId).catch(() => undefined);
    await notifyBatch(id, "cancelled");
  }
  if (input.status === "COMPLETED" && (input.transcript || input.notes)) await enqueue("liveclass.summarize", { liveClassId: id });
  return updated;
}

/** Emails of the students a class is for: its batch, or everyone active on the course. */
async function classEmails(courseId: string, batchId: string | null): Promise<string[]> {
  const rows = batchId
    ? await prisma.batchStudent.findMany({ where: { batchId, leftAt: null }, select: { student: { select: { user: { select: { email: true } } } } } })
    : await prisma.enrollment.findMany({ where: { courseId, status: "ACTIVE" }, select: { student: { select: { user: { select: { email: true } } } } } });
  return [...new Set(rows.map((r) => r.student.user.email))];
}

async function notifyBatch(liveClassId: string, kind: "scheduled" | "cancelled" | "reminder") {
  const lc = await prisma.liveClass.findUnique({ where: { id: liveClassId }, include: { course: { select: { title: true } }, batch: { include: { students: { where: { leftAt: null }, include: { student: { select: { userId: true } } } } } } } });
  if (!lc) return;
  const students = lc.batch ? lc.batch.students.map((s) => s.student.userId) : (await prisma.enrollment.findMany({ where: { courseId: lc.courseId, status: "ACTIVE" }, select: { student: { select: { userId: true } } } })).map((e) => e.student.userId);
  const when = formatDateTime(lc.startsAt);
  const title = kind === "scheduled" ? `Live class scheduled: ${lc.title}` : kind === "cancelled" ? `Cancelled: ${lc.title}` : `Starting soon: ${lc.title}`;
  const body = kind === "cancelled" ? `The session on ${when} has been cancelled.` : `${lc.course.title} · ${when}. Open your live classes to join.`;
  await Promise.all(students.map((userId) => notify({ userId, event: "CLASS_REMINDER", data: { title: lc.title, when, course: lc.course.title }, href: "/student/live-classes", fallback: { title, body } })));
}

/** Job: send reminders for classes starting within the next hour that haven't been reminded. */
export async function sendUpcomingClassReminders() {
  const now = Date.now();
  const classes = await prisma.liveClass.findMany({ where: { status: "SCHEDULED", startsAt: { gte: new Date(now), lte: new Date(now + 60 * 60 * 1000) } }, select: { id: true, notes: true } });
  for (const c of classes) {
    const already = await prisma.notification.findFirst({ where: { event: "CLASS_REMINDER", data: { path: "$.liveClassId", equals: c.id } } });
    if (already) continue;
    await notifyBatch(c.id, "reminder");
  }
}

export async function liveClassesForStudent(studentId: string) {
  const memberships = await prisma.batchStudent.findMany({ where: { studentId, leftAt: null }, select: { batchId: true } });
  const enrollments = await prisma.enrollment.findMany({ where: { studentId, status: "ACTIVE" }, select: { courseId: true } });
  return prisma.liveClass.findMany({
    where: { OR: [{ batchId: { in: memberships.map((m) => m.batchId) } }, { batchId: null, courseId: { in: enrollments.map((e) => e.courseId) } }] },
    orderBy: { startsAt: "asc" },
    include: { course: { select: { id: true, title: true } }, batch: { select: { code: true, name: true } }, host: { select: { name: true } }, recordings: { include: { media: true } }, attendance: { where: { studentId } } },
  });
}

export async function liveClassesForInstructor(instructorId: string | null, all = false) {
  return prisma.liveClass.findMany({
    where: all ? {} : { OR: [{ batch: { instructorId: instructorId ?? "" } }, { course: { instructors: { some: { instructorId: instructorId ?? "" } } } }] },
    orderBy: { startsAt: "desc" },
    take: 100,
    include: { course: { select: { id: true, title: true } }, batch: { select: { id: true, code: true, name: true, _count: { select: { students: { where: { leftAt: null } } } } } }, recordings: true, _count: { select: { attendance: true } } },
  });
}

export async function joinLiveClass(liveClassId: string, studentId: string) {
  const lc = await prisma.liveClass.findUnique({ where: { id: liveClassId }, select: { id: true, meetingUrl: true, batchId: true, courseId: true, startsAt: true, status: true } });
  if (!lc) throw AppError.notFound("Live class");
  if (lc.batchId) {
    const member = await prisma.batchStudent.findUnique({ where: { batchId_studentId: { batchId: lc.batchId, studentId } } });
    if (!member || member.leftAt) throw AppError.forbidden("You're not part of this batch.");
  } else {
    const enrolled = await prisma.enrollment.findUnique({ where: { studentId_courseId: { studentId, courseId: lc.courseId } } });
    if (!enrolled) throw AppError.forbidden("You're not enrolled in this course.");
  }
  if (!lc.meetingUrl) throw AppError.unavailable("The meeting link hasn't been added yet.");
  await prisma.liveClassAttendance.upsert({ where: { liveClassId_studentId: { liveClassId, studentId } }, update: {}, create: { liveClassId, studentId } });
  if (lc.batchId && Math.abs(Date.now() - lc.startsAt.getTime()) < 3 * 60 * 60 * 1000) {
    const day = new Date(Date.UTC(lc.startsAt.getUTCFullYear(), lc.startsAt.getUTCMonth(), lc.startsAt.getUTCDate()));
    await prisma.attendance.upsert({
      where: { batchId_sessionDate_studentId: { batchId: lc.batchId, sessionDate: day, studentId } },
      update: {},
      create: { batchId: lc.batchId, sessionDate: day, studentId, status: "PRESENT", method: "STUDENT_PORTAL", liveClassId },
    });
  }
  return lc.meetingUrl;
}
