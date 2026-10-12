import { handle, jsonOk } from "@/lib/api/respond";
import { requireApiUser } from "@/server/api/principal";
import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors";
import { assignmentsForStudent } from "@/server/services/assignments";
import { toNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** GET /api/v1/student/assignments — assignments across enrolled courses with submission state. */
export const GET = handle(async (req) => {
  const user = await requireApiUser(req);
  const student = await prisma.studentProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!student) throw AppError.forbidden("Only students can use this endpoint.");
  const assignments = await assignmentsForStudent(student.id);
  return jsonOk(
    assignments.map((a) => {
      const submission = a.submissions[0] ?? null;
      return {
        id: a.id,
        title: a.title,
        course: a.course,
        dueAt: a.dueAt,
        maxPoints: toNumber(a.maxPoints),
        allowLate: a.allowLate,
        submission: submission
          ? { id: submission.id, status: submission.status, submittedAt: submission.submittedAt, score: submission.score != null ? toNumber(submission.score) : null }
          : null,
      };
    }),
  );
});
