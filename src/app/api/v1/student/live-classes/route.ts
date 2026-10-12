import { z } from "zod";
import { handle, jsonOk, readJson } from "@/lib/api/respond";
import { requireApiUser } from "@/server/api/principal";
import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors";
import { joinLiveClass, liveClassesForStudent } from "@/server/services/live-classes";

export const dynamic = "force-dynamic";

async function studentId(userId: string) {
  const s = await prisma.studentProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!s) throw AppError.forbidden("Only students can use this endpoint.");
  return s.id;
}

/** GET /api/v1/student/live-classes — upcoming and recent live classes for this student. */
export const GET = handle(async (req) => {
  const user = await requireApiUser(req);
  const id = await studentId(user.id);
  return jsonOk(await liveClassesForStudent(id));
});

/** POST /api/v1/student/live-classes — get the join link for one class (marks attendance intent). */
export const POST = handle(async (req) => {
  const user = await requireApiUser(req);
  const id = await studentId(user.id);
  const { liveClassId } = z.object({ liveClassId: z.string().uuid() }).parse(await readJson(req));
  return jsonOk(await joinLiveClass(liveClassId, id));
});
