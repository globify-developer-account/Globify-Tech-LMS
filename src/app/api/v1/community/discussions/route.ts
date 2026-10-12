import { z } from "zod";
import { handle, jsonOk, readJson } from "@/lib/api/respond";
import { requireApiUser } from "@/server/api/principal";
import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors";
import { createDiscussion, feedForStudent } from "@/server/services/community";
import { enforceRateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

async function studentId(userId: string) {
  const s = await prisma.studentProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!s) throw AppError.forbidden("Only students can use this endpoint.");
  return s.id;
}

/** GET /api/v1/community/discussions — the student's community feed, filterable by course. */
export const GET = handle(async (req) => {
  const user = await requireApiUser(req);
  const id = await studentId(user.id);
  const p = new URL(req.url).searchParams;
  const result = await feedForStudent(id, {
    courseId: p.get("courseId") ?? undefined,
    q: p.get("q") ?? undefined,
    page: Number(p.get("page") ?? 1) || 1,
    pageSize: Math.min(50, Number(p.get("pageSize") ?? 20) || 20),
  });
  return jsonOk(result.items, { page: result.page, pageSize: result.pageSize, total: result.total });
});

const createSchema = z.object({
  title: z.string().trim().min(4).max(200),
  body: z.string().trim().min(1).max(20000),
  courseId: z.string().uuid().nullable().optional(),
  lessonId: z.string().uuid().nullable().optional(),
  isQuestion: z.boolean().default(false),
});

/** POST /api/v1/community/discussions — start a discussion or ask a question. */
export const POST = handle(async (req) => {
  const user = await requireApiUser(req);
  await studentId(user.id);
  await enforceRateLimit(`discussion-create:${user.id}`, 20, 3600);
  const input = createSchema.parse(await readJson(req));
  const discussion = await createDiscussion({ authorId: user.id, isStaff: false, courseId: input.courseId ?? null, lessonId: input.lessonId ?? null, title: input.title, body: input.body, isQuestion: input.isQuestion });
  return jsonOk({ id: discussion.id });
});
