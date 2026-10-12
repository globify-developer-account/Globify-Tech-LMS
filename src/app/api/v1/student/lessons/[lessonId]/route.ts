import { handle, jsonOk } from "@/lib/api/respond";
import { requireApiUser } from "@/server/api/principal";
import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors";
import { orderedLessons } from "@/server/services/courses";
import { hoursAgo, toNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/student/lessons/:lessonId — everything the mobile lesson player
 * needs: content, video, resources, linked quiz/assignment/project, notes,
 * bookmarks and the previous/next pointers. Mirrors the web course player.
 */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ lessonId: string }> }) => {
  const user = await requireApiUser(req);
  const { lessonId } = await ctx.params;
  const student = await prisma.studentProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!student) throw AppError.forbidden("Only students can use this endpoint.");
  const studentId = student.id;

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: {
      unit: { select: { module: { select: { courseId: true, title: true } } } },
      video: true,
      resources: { orderBy: { order: "asc" }, include: { media: true } },
      quiz: { select: { id: true, title: true, attempts: { where: { studentId }, orderBy: { startedAt: "desc" }, take: 1 } } },
      assignment: { select: { id: true, title: true, dueAt: true, submissions: { where: { studentId }, orderBy: { createdAt: "desc" }, take: 1, select: { status: true } } } },
      project: { select: { id: true, title: true, deadline: true, submissions: { where: { studentId }, orderBy: { createdAt: "desc" }, take: 1, select: { status: true } } } },
      liveClasses: { where: { startsAt: { gte: hoursAgo(3) } }, orderBy: { startsAt: "asc" }, take: 1 },
    },
  });
  if (!lesson) throw AppError.notFound("Lesson");
  const courseId = lesson.unit.module.courseId;

  const enrollment = await prisma.enrollment.findUnique({ where: { studentId_courseId: { studentId, courseId } }, select: { id: true, status: true } });
  if (!enrollment || !["ACTIVE", "COMPLETED", "PAUSED"].includes(enrollment.status)) throw AppError.forbidden("You are not enrolled in this course.");

  const [{ flat }, progress, videoProgress, notes, bookmarks] = await Promise.all([
    orderedLessons(courseId),
    prisma.lessonProgress.findUnique({ where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId } }, select: { status: true } }),
    prisma.videoProgress.findUnique({ where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId } } }),
    prisma.lessonNote.findMany({ where: { studentId, lessonId }, orderBy: { createdAt: "desc" } }),
    prisma.lessonBookmark.findMany({ where: { studentId, lessonId }, orderBy: { timestampSeconds: "asc" } }),
  ]);
  const idx = flat.findIndex((l) => l.id === lessonId);

  return jsonOk({
    id: lesson.id,
    courseId,
    enrollmentId: enrollment.id,
    moduleTitle: flat[idx]?.moduleTitle ?? lesson.unit.module.title,
    title: lesson.title,
    type: lesson.type,
    content: lesson.content,
    objectives: lesson.objectives,
    durationSeconds: lesson.durationSeconds,
    videoUrl: lesson.video?.url ?? lesson.videoUrl ?? null,
    startAtSeconds: videoProgress?.positionSeconds ?? 0,
    completed: progress?.status === "COMPLETED",
    resources: lesson.resources.map((r) => ({ id: r.id, title: r.title, type: r.type, url: r.media?.url ?? r.url ?? null, mime: r.media?.mime ?? null, size: r.media?.size ?? null })),
    quiz: lesson.quiz
      ? { id: lesson.quiz.id, title: lesson.quiz.title, lastAttempt: lesson.quiz.attempts[0] ? { id: lesson.quiz.attempts[0].id, status: lesson.quiz.attempts[0].status, percent: toNumber(lesson.quiz.attempts[0].percent), passed: lesson.quiz.attempts[0].passed } : null }
      : null,
    assignment: lesson.assignment ? { id: lesson.assignment.id, title: lesson.assignment.title, dueAt: lesson.assignment.dueAt, status: lesson.assignment.submissions[0]?.status ?? null } : null,
    project: lesson.project ? { id: lesson.project.id, title: lesson.project.title, deadline: lesson.project.deadline, status: lesson.project.submissions[0]?.status ?? null } : null,
    liveClass: lesson.liveClasses[0] ? { id: lesson.liveClasses[0].id, title: lesson.liveClasses[0].title, startsAt: lesson.liveClasses[0].startsAt, status: lesson.liveClasses[0].status } : null,
    notes: notes.map((n) => ({ id: n.id, body: n.body, timestampSeconds: n.timestampSeconds, createdAt: n.createdAt })),
    bookmarks: bookmarks.map((b) => ({ id: b.id, timestampSeconds: b.timestampSeconds, label: b.label })),
    prevId: flat[idx - 1]?.id ?? null,
    nextId: flat[idx + 1]?.id ?? null,
  });
});
