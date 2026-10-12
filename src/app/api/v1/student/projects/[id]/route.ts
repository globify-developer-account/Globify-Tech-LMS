import { z } from "zod";
import { handle, jsonOk, readJson } from "@/lib/api/respond";
import { requireApiUser } from "@/server/api/principal";
import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors";
import { getProjectForStudent, submitProject } from "@/server/services/projects";
import { enforceRateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

async function studentId(userId: string) {
  const s = await prisma.studentProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!s) throw AppError.forbidden("Only students can use this endpoint.");
  return s.id;
}

/** GET /api/v1/student/projects/:id — one project with milestones and this student's submissions. */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser(req);
  const id = await studentId(user.id);
  return jsonOk(await getProjectForStudent((await ctx.params).id, id));
});

const submitSchema = z.object({
  title: z.string().trim().max(200).optional(),
  description: z.string().trim().max(20000).optional(),
  repoUrl: z.string().url().max(500).optional(),
  liveUrl: z.string().url().max(500).optional(),
  mediaIds: z.array(z.string().uuid()).max(10).default([]),
  milestonesDone: z.array(z.string().uuid()).max(50).default([]),
  submit: z.boolean().default(true),
});

/** POST /api/v1/student/projects/:id — save a draft or submit the project for review. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser(req);
  const id = await studentId(user.id);
  await enforceRateLimit(`project-submit:${user.id}`, 30, 3600);
  const input = submitSchema.parse(await readJson(req));
  const submission = await submitProject({ studentId: id, userId: user.id, projectId: (await ctx.params).id, ...input });
  return jsonOk({ id: submission.id, status: submission.status, submittedAt: submission.submittedAt });
});
