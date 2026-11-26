import "server-only";
import { prisma, type Prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors";
import { toNumber, greeting } from "@/lib/utils";
import { nextLessonFor } from "./progress";
import { unreadCount } from "./notifications";
import { unreadMessageCount } from "./community";

export async function listStudents(filters: { q?: string; campusId?: string; courseId?: string; status?: "ACTIVE" | "SUSPENDED" | "INVITED"; page?: number; pageSize?: number }) {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;
  const where: Prisma.StudentProfileWhereInput = {
    ...(filters.campusId ? { campusId: filters.campusId } : {}),
    ...(filters.courseId ? { enrollments: { some: { courseId: filters.courseId } } } : {}),
    user: { deletedAt: null, ...(filters.status ? { status: filters.status } : {}), ...(filters.q ? { OR: [{ name: { contains: filters.q } }, { email: { contains: filters.q } }, { phone: { contains: filters.q } }] } : {}) },
    ...(filters.q ? { OR: [{ studentNumber: { contains: filters.q } }, { user: { OR: [{ name: { contains: filters.q } }, { email: { contains: filters.q } }] } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.studentProfile.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { user: { select: { id: true, name: true, email: true, phone: true, status: true, lastLoginAt: true, avatar: { select: { url: true } } } }, campus: { select: { name: true } }, enrollments: { where: { status: { in: ["ACTIVE", "COMPLETED"] } }, select: { course: { select: { title: true } }, status: true, progress: { select: { percent: true } } } }, riskScores: { orderBy: { computedAt: "desc" }, take: 1, select: { level: true, score: true } } } }),
    prisma.studentProfile.count({ where }),
  ]);
  return { items, total, page, pageSize };
}

export async function getStudentDetail(id: string) {
  const s = await prisma.studentProfile.findUnique({
    where: { id },
    include: {
      user: { include: { avatar: true, roles: { include: { role: true } }, streak: true, badges: { include: { badge: true } } } },
      campus: true,
      enrollments: { include: { course: { select: { id: true, title: true, slug: true } }, batch: { select: { id: true, code: true, name: true } }, progress: true, completion: true, certificate: { select: { id: true, certificateNumber: true, status: true } } }, orderBy: { createdAt: "desc" } },
      batches: { where: { leftAt: null }, include: { batch: { select: { id: true, code: true, name: true, status: true } } } },
      invoices: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, include: { payments: { where: { status: "SUCCEEDED" } } } },
      certificates: { include: { course: { select: { title: true } } }, orderBy: { issuedAt: "desc" } },
      riskScores: { orderBy: { computedAt: "desc" }, take: 3 },
      skills: { include: { skill: true } },
      quizAttempts: { where: { status: "GRADED" }, orderBy: { submittedAt: "desc" }, take: 10, include: { quiz: { select: { title: true } } } },
      submissions: { orderBy: { createdAt: "desc" }, take: 10, include: { assignment: { select: { title: true } } } },
      portfolio: { select: { username: true, isPublic: true } },
    },
  });
  if (!s) throw AppError.notFound("Student");
  const attendance = await Promise.all(s.batches.map(async (b) => ({ batch: b.batch, ...(await (await import("./batches")).attendanceSummary(b.batchId, s.id)) })));
  return { ...s, attendance };
}

export async function setUserStatus(userId: string, status: "ACTIVE" | "SUSPENDED") {
  return prisma.user.update({ where: { id: userId }, data: { status, sessionVersion: status === "SUSPENDED" ? { increment: 1 } : undefined } });
}

/** The student cockpit: everything the dashboard needs in one call. */
export async function getStudentCockpit(userId: string) {
  const student = await prisma.studentProfile.findUnique({
    where: { userId },
    include: {
      user: { select: { name: true, streak: true, badges: { include: { badge: true }, orderBy: { awardedAt: "desc" }, take: 6 } } },
      enrollments: { where: { status: { in: ["ACTIVE", "COMPLETED"] } }, orderBy: [{ status: "asc" }, { updatedAt: "desc" }], include: { course: { select: { id: true, slug: true, title: true, artwork: { select: { url: true } }, category: { select: { artworkKey: true, name: true } } } }, progress: true, batch: { select: { id: true, code: true, name: true } }, certificate: { select: { id: true } } } },
      certificates: { where: { status: "VALID" }, select: { id: true } },
      invoices: { where: { deletedAt: null, status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] } }, select: { id: true, number: true, total: true, amountPaid: true, dueDate: true, status: true } },
    },
  });
  if (!student) throw AppError.forbidden("Only students can view this space.");

  const active = student.enrollments.filter((e) => e.status === "ACTIVE");
  const current = active.sort((a, b) => (b.progress?.lastActivityAt?.getTime() ?? 0) - (a.progress?.lastActivityAt?.getTime() ?? 0))[0] ?? null;
  const nextLesson = current ? await nextLessonFor(current.id) : null;

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);
  const [week, lessonsCompleted, projectsApproved, upcomingClasses, dueAssignments, openQuizzes, notifications, messages, announcements] = await Promise.all([
    prisma.learningActivity.aggregate({ where: { userId, date: { gte: weekStart } }, _sum: { seconds: true } }),
    prisma.lessonProgress.count({ where: { status: "COMPLETED", enrollment: { studentId: student.id } } }),
    prisma.projectSubmission.count({ where: { studentId: student.id, status: "APPROVED" } }),
    prisma.liveClass.findMany({ where: { status: "SCHEDULED", startsAt: { gte: new Date(), lte: new Date(Date.now() + 7 * 86400000) }, OR: [{ batchId: { in: (await prisma.batchStudent.findMany({ where: { studentId: student.id, leftAt: null }, select: { batchId: true } })).map((b) => b.batchId) } }, { batchId: null, courseId: { in: active.map((e) => e.courseId) } }] }, orderBy: { startsAt: "asc" }, take: 3, include: { course: { select: { title: true } } } }),
    prisma.assignment.findMany({ where: { isPublished: true, courseId: { in: active.map((e) => e.courseId) }, dueAt: { gte: new Date(), lte: new Date(Date.now() + 14 * 86400000) }, submissions: { none: { studentId: student.id, status: { in: ["SUBMITTED", "UNDER_REVIEW", "APPROVED"] } } } }, orderBy: { dueAt: "asc" }, take: 4, include: { course: { select: { title: true } } } }),
    prisma.quiz.count({ where: { isPublished: true, courseId: { in: active.map((e) => e.courseId) }, attempts: { none: { studentId: student.id, status: "GRADED", passed: true } } } }),
    unreadCount(userId),
    unreadMessageCount(userId),
    prisma.announcement.findMany({ where: { AND: [{ OR: [{ courseId: null, batchId: null }, { courseId: { in: active.map((e) => e.courseId) } }, { batchId: { in: active.map((e) => e.batchId).filter((x): x is string => !!x) } }] }, { OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }] }] }, orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }], take: 3 }),
  ]);

  return {
    student: { id: student.id, name: student.user.name, firstName: student.user.name.split(" ")[0] ?? student.user.name },
    greeting: greeting(),
    current: current ? { enrollmentId: current.id, course: current.course, progress: toNumber(current.progress?.percent ?? 0), lessonsCompleted: current.progress?.lessonsCompleted ?? 0, lessonsTotal: current.progress?.lessonsTotal ?? 0, batch: current.batch } : null,
    nextLesson,
    streak: student.user.streak ?? { current: 0, longest: 0 },
    weekMinutes: Math.round((week._sum.seconds ?? 0) / 60),
    stats: { lessonsCompleted, projectsApproved, certificates: student.certificates.length, coursesActive: active.length, coursesCompleted: student.enrollments.filter((e) => e.status === "COMPLETED").length },
    enrollments: student.enrollments.map((e) => ({ id: e.id, status: e.status, course: e.course, progress: toNumber(e.progress?.percent ?? 0), lastActivityAt: e.progress?.lastActivityAt ?? null, hasCertificate: !!e.certificate })),
    upcomingClasses,
    dueAssignments,
    openQuizzes,
    invoicesDue: student.invoices.map((i) => ({ ...i, balance: toNumber(i.total) - toNumber(i.amountPaid) })),
    badges: student.user.badges.map((b) => b.badge),
    unread: { notifications, messages },
    announcements,
  };
}

export type StudentCockpit = Awaited<ReturnType<typeof getStudentCockpit>>;
