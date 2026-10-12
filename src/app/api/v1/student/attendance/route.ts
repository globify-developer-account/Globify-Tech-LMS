import { z } from "zod";
import { handle, jsonOk, readJson } from "@/lib/api/respond";
import { requireApiUser } from "@/server/api/principal";
import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors";
import { attendanceSummary, studentCheckIn } from "@/server/services/batches";

export const dynamic = "force-dynamic";

/** GET /api/v1/student/attendance — per-batch attendance summaries for this student. */
export const GET = handle(async (req) => {
  const user = await requireApiUser(req);
  const student = await prisma.studentProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!student) throw AppError.forbidden("Only students can use this endpoint.");
  const memberships = await prisma.batchStudent.findMany({
    where: { studentId: student.id },
    orderBy: { joinedAt: "desc" },
    include: { batch: { select: { id: true, code: true, name: true, status: true, course: { select: { title: true, category: { select: { artworkKey: true } } } } } } },
  });
  const summaries = await Promise.all(
    memberships.map(async (m) => ({
      batch: { id: m.batch.id, code: m.batch.code, name: m.batch.name, status: m.batch.status, course: m.batch.course.title, artworkKey: m.batch.course.category?.artworkKey ?? null },
      active: !m.leftAt,
      ...(await attendanceSummary(m.batchId, student.id)),
    })),
  );
  return jsonOk(summaries);
});

/** POST /api/v1/student/attendance — QR self check-in with a token from the classroom screen. */
export const POST = handle(async (req) => {
  const user = await requireApiUser(req);
  const student = await prisma.studentProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!student) throw AppError.forbidden("Only students can use this endpoint.");
  const { token } = z.object({ token: z.string().min(10).max(500) }).parse(await readJson(req));
  return jsonOk(await studentCheckIn(student.id, token));
});
