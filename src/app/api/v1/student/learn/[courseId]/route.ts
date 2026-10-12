import { handle, jsonOk } from "@/lib/api/respond";
import { requireApiUser } from "@/server/api/principal";
import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors";
import { orderedLessons } from "@/server/services/courses";
import { nextLessonFor } from "@/server/services/progress";
import { evaluateEnrollment } from "@/server/services/completion";
import { toNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/student/learn/:courseId — the enrolled course outline for the
 * mobile player: modules → units → lessons with this student's per-lesson
 * status, the lesson to resume, and completion readiness.
 */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ courseId: string }> }) => {
  const user = await requireApiUser(req);
  const { courseId } = await ctx.params;
  const student = await prisma.studentProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!student) throw AppError.forbidden("Only students can use this endpoint.");

  const enrollment = await prisma.enrollment.findUnique({
    where: { studentId_courseId: { studentId: student.id, courseId } },
    include: {
      progress: true,
      completion: true,
      certificate: { select: { id: true, certificateNumber: true } },
      course: {
        select: {
          id: true,
          slug: true,
          title: true,
          artwork: { select: { url: true } },
          category: { select: { artworkKey: true, name: true } },
          instructors: { include: { instructor: { include: { user: { select: { name: true, avatar: { select: { url: true } } } } } } } },
        },
      },
    },
  });
  if (!enrollment || !["ACTIVE", "COMPLETED", "PAUSED"].includes(enrollment.status)) throw AppError.notFound("Enrollment");

  const [{ modules, flat }, lessonProgress, next, evaluation] = await Promise.all([
    orderedLessons(courseId),
    prisma.lessonProgress.findMany({ where: { enrollmentId: enrollment.id }, select: { lessonId: true, status: true } }),
    nextLessonFor(enrollment.id),
    evaluateEnrollment(enrollment.id).catch(() => null),
  ]);
  const statusOf = new Map(lessonProgress.map((p) => [p.lessonId, p.status]));

  return jsonOk({
    enrollmentId: enrollment.id,
    status: enrollment.status,
    course: {
      id: enrollment.course.id,
      slug: enrollment.course.slug,
      title: enrollment.course.title,
      artwork: enrollment.course.artwork?.url ?? null,
      artworkKey: enrollment.course.category?.artworkKey ?? null,
      instructor: enrollment.course.instructors[0]
        ? { name: enrollment.course.instructors[0].instructor.user.name, avatar: enrollment.course.instructors[0].instructor.user.avatar?.url ?? null }
        : null,
    },
    progress: {
      percent: Math.round(toNumber(enrollment.progress?.percent ?? 0)),
      lessonsCompleted: enrollment.progress?.lessonsCompleted ?? 0,
      lessonsTotal: enrollment.progress?.lessonsTotal ?? flat.length,
    },
    resumeLessonId: next?.id ?? flat[0]?.id ?? null,
    completed: !!enrollment.completion,
    certificate: enrollment.certificate,
    readiness: evaluation ? { percent: evaluation.readinessPercent, requirements: evaluation.requirements } : null,
    curriculum: modules.map((m) => ({
      id: m.id,
      title: m.title,
      units: m.units.map((u) => ({
        id: u.id,
        title: u.title,
        lessons: u.lessons.map((l) => ({ id: l.id, title: l.title, type: l.type, durationSeconds: l.durationSeconds, status: statusOf.get(l.id) ?? "NOT_STARTED" })),
      })),
    })),
  });
});
