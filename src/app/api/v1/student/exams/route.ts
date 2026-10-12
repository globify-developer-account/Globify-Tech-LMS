import { z } from "zod";
import { handle, jsonOk, readJson } from "@/lib/api/respond";
import { requireApiUser } from "@/server/api/principal";
import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors";
import { examsForStudent, startExamAttempt } from "@/server/services/exams";

export const dynamic = "force-dynamic";

async function studentId(userId: string) {
  const s = await prisma.studentProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!s) throw AppError.forbidden("Only students can use this endpoint.");
  return s.id;
}

/** GET /api/v1/student/exams — exams across enrolled courses with attempt state. */
export const GET = handle(async (req) => {
  const user = await requireApiUser(req);
  const id = await studentId(user.id);
  return jsonOk(await examsForStudent(id));
});

/** POST /api/v1/student/exams — start an exam attempt. */
export const POST = handle(async (req) => {
  const user = await requireApiUser(req);
  const id = await studentId(user.id);
  const { examId } = z.object({ examId: z.string().uuid() }).parse(await readJson(req));
  const attempt = await startExamAttempt(examId, id);
  return jsonOk({ attemptId: attempt.id, startedAt: attempt.startedAt, expiresAt: attempt.expiresAt, status: attempt.status });
});
