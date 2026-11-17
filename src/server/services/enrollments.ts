import "server-only";
import { prisma, type Prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors";
import { notify } from "@/server/services/notifications";
import { recomputeCourseStats } from "@/server/services/courses";
import { rewardReferralOnEnrollment } from "@/server/services/referrals";
import { log } from "@/server/log";
import type { EnrollmentSource } from "@prisma/client";

export interface EnrollInput {
  studentId: string;
  courseId: string;
  batchId?: string | null;
  source?: EnrollmentSource;
  isTestData?: boolean;
}

/** Idempotent: re-enrolling an existing student returns the existing row. */
export async function enrollStudent(input: EnrollInput) {
  const course = await prisma.course.findFirst({ where: { id: input.courseId, deletedAt: null }, select: { id: true, title: true, status: true } });
  if (!course) throw AppError.notFound("Course");

  const existing = await prisma.enrollment.findUnique({ where: { studentId_courseId: { studentId: input.studentId, courseId: input.courseId } } });
  if (existing) {
    if (input.batchId && existing.batchId !== input.batchId) {
      await assignBatch(existing.id, input.batchId);
    }
    // A retry after an enrolment that failed half-way still credits the referrer (rewards pay once).
    await rewardReferral(input, existing.id);
    return existing;
  }

  const lessonsTotal = await prisma.lesson.count({ where: { isPublished: true, unit: { module: { courseId: input.courseId, isPublished: true } } } });

  const enrollment = await prisma.$transaction(async (tx) => {
    const e = await tx.enrollment.create({
      data: {
        studentId: input.studentId,
        courseId: input.courseId,
        batchId: input.batchId ?? null,
        source: input.source ?? "DIRECT",
        isTestData: input.isTestData ?? false,
        progress: { create: { lessonsTotal } },
      },
    });
    if (input.batchId) {
      await tx.batchStudent.upsert({
        where: { batchId_studentId: { batchId: input.batchId, studentId: input.studentId } },
        update: { leftAt: null },
        create: { batchId: input.batchId, studentId: input.studentId },
      });
    }
    return e;
  });

  await recomputeCourseStats(input.courseId);
  const student = await prisma.studentProfile.findUnique({ where: { id: input.studentId }, select: { userId: true } });
  if (student) {
    await notify({
      userId: student.userId,
      event: "ENROLLMENT",
      data: { course: course.title },
      href: `/student/course/${course.id}`,
      fallback: { title: `You're enrolled in ${course.title}`, body: "Your learning space is ready. Open the course to start your first lesson." },
    });
  }
  await rewardReferral(input, enrollment.id);
  return enrollment;
}

/** A referral reward must never block the enrolment itself. */
async function rewardReferral(input: EnrollInput, enrollmentId: string) {
  await rewardReferralOnEnrollment({ studentId: input.studentId, courseId: input.courseId, enrollmentId }).catch((error: Error) =>
    log.warn("referral reward failed", { enrollmentId, error: error.message }),
  );
}

export async function assignBatch(enrollmentId: string, batchId: string) {
  const enrollment = await prisma.enrollment.findUnique({ where: { id: enrollmentId }, select: { id: true, studentId: true, courseId: true, batchId: true } });
  if (!enrollment) throw AppError.notFound("Enrollment");
  const batch = await prisma.batch.findFirst({ where: { id: batchId, deletedAt: null }, select: { id: true, courseId: true, capacity: true, _count: { select: { students: { where: { leftAt: null } } } } } });
  if (!batch) throw AppError.notFound("Batch");
  if (batch.courseId !== enrollment.courseId) throw AppError.validation("That batch belongs to a different course.");
  if (batch._count.students >= batch.capacity) throw AppError.conflict("This batch is full.");
  await prisma.$transaction(async (tx) => {
    if (enrollment.batchId && enrollment.batchId !== batchId) {
      await tx.batchStudent.updateMany({ where: { batchId: enrollment.batchId, studentId: enrollment.studentId }, data: { leftAt: new Date() } });
    }
    await tx.batchStudent.upsert({
      where: { batchId_studentId: { batchId, studentId: enrollment.studentId } },
      update: { leftAt: null },
      create: { batchId, studentId: enrollment.studentId },
    });
    await tx.enrollment.update({ where: { id: enrollmentId }, data: { batchId } });
  });
}

export async function setEnrollmentStatus(enrollmentId: string, status: "ACTIVE" | "PAUSED" | "DROPPED" | "EXPIRED") {
  const e = await prisma.enrollment.update({ where: { id: enrollmentId }, data: { status } });
  await recomputeCourseStats(e.courseId);
  return e;
}

/** Row-level guard: the student must own an active/completed enrollment for the course. */
export async function requireEnrollment(studentId: string, courseId: string) {
  const enrollment = await prisma.enrollment.findUnique({
    where: { studentId_courseId: { studentId, courseId } },
    include: { progress: true },
  });
  if (!enrollment || !["ACTIVE", "COMPLETED"].includes(enrollment.status)) throw AppError.forbidden("You are not enrolled in this course.");
  return enrollment;
}

export interface EnrollmentListFilters {
  q?: string;
  courseId?: string;
  batchId?: string;
  status?: "ACTIVE" | "COMPLETED" | "PAUSED" | "DROPPED" | "EXPIRED";
  page?: number;
  pageSize?: number;
}

export async function listEnrollments(filters: EnrollmentListFilters) {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;
  const where: Prisma.EnrollmentWhereInput = {
    ...(filters.courseId ? { courseId: filters.courseId } : {}),
    ...(filters.batchId ? { batchId: filters.batchId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.q ? { student: { user: { OR: [{ name: { contains: filters.q, mode: "insensitive" } }, { email: { contains: filters.q, mode: "insensitive" } }] } } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.enrollment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        student: { select: { id: true, studentNumber: true, user: { select: { name: true, email: true, avatar: { select: { url: true } } } } } },
        course: { select: { id: true, title: true, slug: true } },
        batch: { select: { id: true, code: true, name: true } },
        progress: true,
      },
    }),
    prisma.enrollment.count({ where }),
  ]);
  return { items, total, page, pageSize };
}
