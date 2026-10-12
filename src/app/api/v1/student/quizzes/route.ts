import { z } from "zod";
import { handle, jsonOk, readJson } from "@/lib/api/respond";
import { requireApiUser } from "@/server/api/principal";
import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors";
import { quizzesForStudent, startAttempt } from "@/server/services/quizzes";
import { enforceRateLimit } from "@/server/rate-limit";
import { toNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function studentId(userId: string) {
  const s = await prisma.studentProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!s) throw AppError.forbidden("Only students can use this endpoint.");
  return s.id;
}

/** GET /api/v1/student/quizzes — quizzes across enrolled courses with attempt state. */
export const GET = handle(async (req) => {
  const user = await requireApiUser(req);
  const id = await studentId(user.id);
  const quizzes = await quizzesForStudent(id);
  return jsonOk(
    quizzes.map((q) => ({
      id: q.id,
      title: q.title,
      description: q.description,
      course: q.course,
      questionCount: q._count.questions,
      questionsPerAttempt: q.questionsPerAttempt,
      timeLimitMinutes: q.timeLimitMinutes,
      passingScore: q.passingScore,
      attemptLimit: q.attemptLimit,
      attemptsUsed: q.attemptsUsed,
      bestPercent: q.bestPercent,
      passed: q.passed,
      inProgressAttemptId: q.inProgress?.id ?? null,
      availableFrom: q.availableFrom,
      availableTo: q.availableTo,
    })),
  );
});

/** POST /api/v1/student/quizzes — start (or resume) an attempt for a quiz. */
export const POST = handle(async (req) => {
  const user = await requireApiUser(req);
  const id = await studentId(user.id);
  await enforceRateLimit(`quiz-start:${user.id}`, 30, 3600);
  const { quizId } = z.object({ quizId: z.string().uuid() }).parse(await readJson(req));
  const attempt = await startAttempt({ quizId, studentId: id, userId: user.id });
  return jsonOk({ attemptId: attempt.id, attemptNumber: attempt.attemptNumber, expiresAt: attempt.expiresAt, status: attempt.status, percent: toNumber(attempt.percent) });
});
