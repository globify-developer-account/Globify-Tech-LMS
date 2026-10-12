import { z } from "zod";
import { handle, jsonOk, readJson } from "@/lib/api/respond";
import { requireApiUser } from "@/server/api/principal";
import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors";
import { getExamAttempt, submitExamAttempt } from "@/server/services/exams";

export const dynamic = "force-dynamic";

async function studentId(userId: string) {
  const s = await prisma.studentProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!s) throw AppError.forbidden("Only students can use this endpoint.");
  return s.id;
}

/** GET /api/v1/student/exam-attempts/:id — the exam attempt payload for the player. */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser(req);
  const id = await studentId(user.id);
  return jsonOk(await getExamAttempt((await ctx.params).id, id));
});

const submitSchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.string().uuid(),
      selectedOptionIds: z.array(z.string().uuid()).optional(),
      textAnswer: z.string().max(20000).nullable().optional(),
      structured: z.unknown().optional(),
    }),
  ),
});

/** PUT /api/v1/student/exam-attempts/:id — submit exam answers. */
export const PUT = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser(req);
  const id = await studentId(user.id);
  const input = submitSchema.parse(await readJson(req));
  return jsonOk(await submitExamAttempt((await ctx.params).id, id, input.answers));
});
