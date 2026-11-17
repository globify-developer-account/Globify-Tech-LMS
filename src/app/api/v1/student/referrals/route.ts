import { handle, jsonOk } from "@/lib/api/respond";
import { requireApiUser } from "@/server/api/principal";
import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors";
import { referralSummary } from "@/server/services/referrals";

export const dynamic = "force-dynamic";

/** GET /api/v1/student/referrals — the student's code, share link, friends invited and coupons earned. */
export const GET = handle(async (req) => {
  const user = await requireApiUser(req);
  const student = await prisma.studentProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!student) throw AppError.forbidden("Only students can use this endpoint.");
  return jsonOk(await referralSummary(student.id));
});
