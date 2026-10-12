import { z } from "zod";
import { handle, jsonOk, readJson } from "@/lib/api/respond";
import { requireApiUser } from "@/server/api/principal";
import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors";
import { getAssignmentForStudent, submitAssignment } from "@/server/services/assignments";
import { enforceRateLimit } from "@/server/rate-limit";
import { toNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function studentId(userId: string) {
  const s = await prisma.studentProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!s) throw AppError.forbidden("Only students can use this endpoint.");
  return s.id;
}

/** GET /api/v1/student/assignments/:id — full assignment with this student's submissions and feedback. */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser(req);
  const id = await studentId(user.id);
  const { assignment, submissions } = await getAssignmentForStudent((await ctx.params).id, id);
  return jsonOk({
    id: assignment.id,
    title: assignment.title,
    instructions: assignment.instructions,
    course: assignment.course,
    dueAt: assignment.dueAt,
    allowLate: assignment.allowLate,
    latePenaltyPercent: assignment.latePenaltyPercent,
    allowedKinds: assignment.allowedKinds,
    maxPoints: toNumber(assignment.maxPoints),
    rubric: assignment.rubric
      ? { title: assignment.rubric.title, criteria: assignment.rubric.criteria.map((c) => ({ id: c.id, title: c.title, description: c.description, maxPoints: toNumber(c.maxPoints) })) }
      : null,
    submissions: submissions.map((s) => ({
      id: s.id,
      attempt: s.attempt,
      kind: s.kind,
      status: s.status,
      text: s.text,
      url: s.url,
      submittedAt: s.submittedAt,
      isLate: s.isLate,
      score: s.score != null ? toNumber(s.score) : null,
      reviewedBy: s.reviewedBy?.name ?? null,
      files: s.files.map((f) => ({ id: f.mediaId, fileName: f.media.fileName, mime: f.media.mime, size: f.media.size, url: f.media.url })),
      feedback: s.feedback.map((f) => ({ id: f.id, body: f.body, createdAt: f.createdAt })),
      rubricScores: s.rubricScores.map((r) => ({ criterion: r.criterion.title, points: toNumber(r.points), maxPoints: toNumber(r.criterion.maxPoints), comment: r.comment })),
    })),
  });
});

const submitSchema = z.object({
  kind: z.enum(["TEXT", "FILE", "URL", "GITHUB", "WEBSITE"]),
  text: z.string().max(20000).optional(),
  url: z.string().url().max(500).optional(),
  mediaIds: z.array(z.string().uuid()).max(10).default([]),
  submit: z.boolean().default(true),
});

/** POST /api/v1/student/assignments/:id — create or submit a submission (draft with submit:false). */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser(req);
  const id = await studentId(user.id);
  await enforceRateLimit(`assignment-submit:${user.id}`, 30, 3600);
  const input = submitSchema.parse(await readJson(req));
  const submission = await submitAssignment({ studentId: id, userId: user.id, assignmentId: (await ctx.params).id, ...input });
  return jsonOk({ id: submission.id, status: submission.status, attempt: submission.attempt, submittedAt: submission.submittedAt, isLate: submission.isLate });
});
