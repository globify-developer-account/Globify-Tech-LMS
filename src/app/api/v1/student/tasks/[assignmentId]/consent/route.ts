import { z } from "zod";
import { handle, jsonOk, readJson } from "@/lib/api/respond";
import { requireApiUser } from "@/server/api/principal";
import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors";
import { hermesPortal } from "@/server/hermes/portal";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/student/tasks/:assignmentId/consent — withdraw the permission
 * the student gave for Globify to use this hand-in on social media. Hermes
 * stops any use and alerts the staff involved.
 */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ assignmentId: string }> }) => {
  const user = await requireApiUser(req);
  const student = await prisma.studentProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!student) throw AppError.forbidden("Only students can use this endpoint.");
  const assignmentId = z.string().uuid().parse((await ctx.params).assignmentId);
  const { reason } = z.object({ reason: z.string().trim().max(500).optional() }).parse(await readJson(req).catch(() => ({})));
  return jsonOk(await hermesPortal.withdrawConsent(student.id, assignmentId, reason || null));
});
