import { z } from "zod";
import { handle, jsonOk } from "@/lib/api/respond";
import { requireApiUser } from "@/server/api/principal";
import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors";
import { hermesPortal } from "@/server/hermes/portal";

export const dynamic = "force-dynamic";

/** POST /api/v1/student/tasks/:assignmentId/open — tell Hermes the student has seen the task. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ assignmentId: string }> }) => {
  const user = await requireApiUser(req);
  const student = await prisma.studentProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!student) throw AppError.forbidden("Only students can use this endpoint.");
  const assignmentId = z.string().uuid().parse((await ctx.params).assignmentId);
  return jsonOk(await hermesPortal.open(student.id, assignmentId));
});
