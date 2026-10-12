import { z } from "zod";
import { handle, jsonOk, readJson } from "@/lib/api/respond";
import { requireApiUser } from "@/server/api/principal";
import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors";
import { getAttemptForStudent, submitAttempt } from "@/server/services/quizzes";
import { toNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function studentId(userId: string) {
  const s = await prisma.studentProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!s) throw AppError.forbidden("Only students can use this endpoint.");
  return s.id;
}

/** GET /api/v1/student/quiz-attempts/:id — the attempt player payload (no answer keys while in progress). */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser(req);
  const id = await studentId(user.id);
  const { attempt, questions } = await getAttemptForStudent((await ctx.params).id, id);
  return jsonOk({
    attempt: {
      id: attempt.id,
      status: attempt.status,
      attemptNumber: attempt.attemptNumber,
      startedAt: attempt.startedAt,
      expiresAt: attempt.expiresAt,
      submittedAt: attempt.submittedAt,
      score: toNumber(attempt.score),
      maxScore: toNumber(attempt.maxScore),
      percent: toNumber(attempt.percent),
      passed: attempt.passed,
      weakTopics: attempt.weakTopics,
      answers: attempt.answers.map((a) => ({ questionId: a.questionId, selectedOptionIds: a.selectedOptionIds, textAnswer: a.textAnswer, isCorrect: a.isCorrect, pointsAwarded: toNumber(a.pointsAwarded), needsManualGrading: a.needsManualGrading })),
      quiz: { id: attempt.quiz.id, title: attempt.quiz.title, timeLimitMinutes: attempt.quiz.timeLimitMinutes, showAnswersAfter: attempt.quiz.showAnswersAfter, passingScore: attempt.quiz.passingScore, courseId: attempt.quiz.courseId },
    },
    questions,
  });
});

const submitSchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.string().uuid(),
      selectedOptionIds: z.array(z.string().uuid()).optional(),
      textAnswer: z.string().max(10000).nullable().optional(),
      structured: z.unknown().optional(),
    }),
  ),
});

/** PUT /api/v1/student/quiz-attempts/:id — submit answers and get the graded result. */
export const PUT = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser(req);
  const id = await studentId(user.id);
  const input = submitSchema.parse(await readJson(req));
  const result = await submitAttempt({ attemptId: (await ctx.params).id, studentId: id, userId: user.id, answers: input.answers });
  return jsonOk(result);
});
