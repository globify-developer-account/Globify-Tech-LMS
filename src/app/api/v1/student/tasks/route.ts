import { handle, jsonOk } from "@/lib/api/respond";
import { requireApiUser } from "@/server/api/principal";
import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors";
import { hermesPortal, portalConfigured } from "@/server/hermes/portal";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/student/tasks — the student's Hermes tasks, proxied server to
 * server exactly like the web Tasks page. When the portal is not configured
 * the app gets `available: false` instead of an error.
 */
export const GET = handle(async (req) => {
  const user = await requireApiUser(req);
  const student = await prisma.studentProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!student) throw AppError.forbidden("Only students can use this endpoint.");
  if (!portalConfigured()) return jsonOk({ available: false, items: [] });
  const items = await hermesPortal.tasks(student.id);
  return jsonOk({ available: true, items });
});
