import { handle, jsonOk } from "@/lib/api/respond";
import { requireApiUser } from "@/server/api/principal";
import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors";
import { announcementsForStudent } from "@/server/services/community";

export const dynamic = "force-dynamic";

/** GET /api/v1/community/announcements — announcements scoped to this student's courses and batches. */
export const GET = handle(async (req) => {
  const user = await requireApiUser(req);
  const student = await prisma.studentProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!student) throw AppError.forbidden("Only students can use this endpoint.");
  const items = await announcementsForStudent(student.id);
  return jsonOk(items);
});
