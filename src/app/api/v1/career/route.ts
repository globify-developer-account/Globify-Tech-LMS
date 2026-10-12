import { handle, jsonOk } from "@/lib/api/respond";
import { requireApiUser } from "@/server/api/principal";
import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors";
import { opportunitiesForStudent } from "@/server/services/career";

export const dynamic = "force-dynamic";

/** GET /api/v1/career — open jobs and internships matched to this student, with application state. */
export const GET = handle(async (req) => {
  const user = await requireApiUser(req);
  const student = await prisma.studentProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!student) throw AppError.forbidden("Only students can use this endpoint.");
  return jsonOk(await opportunitiesForStudent(student.id));
});
