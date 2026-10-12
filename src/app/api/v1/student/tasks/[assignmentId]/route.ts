import { z } from "zod";
import { handle, jsonOk, readJson } from "@/lib/api/respond";
import { requireApiUser } from "@/server/api/principal";
import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors";
import { hermesPortal } from "@/server/hermes/portal";
import { enforceRateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

const uuid = z.string().uuid();

async function studentId(userId: string) {
  const s = await prisma.studentProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!s) throw AppError.forbidden("Only students can use this endpoint.");
  return s.id;
}

/** GET /api/v1/student/tasks/:assignmentId — one Hermes task with submission, review and consent state. */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ assignmentId: string }> }) => {
  const user = await requireApiUser(req);
  const id = await studentId(user.id);
  const task = await hermesPortal.task(id, uuid.parse((await ctx.params).assignmentId));
  return jsonOk(task);
});

const submitSchema = z.object({
  submitKey: z.string().regex(/^[A-Za-z0-9._:-]{8,200}$/),
  response: z.string().trim().max(2000).optional(),
  consentAccepted: z.array(z.string().max(300)).max(10).default([]),
  consentVersion: z.string().max(60).nullish(),
  mediaIds: z.array(uuid).max(10).default([]),
});

/**
 * POST /api/v1/student/tasks/:assignmentId — hand the task in. Files must be
 * this student's own finished uploads into the private student-content/ area,
 * verified here before Hermes ever sees a reference to them (same rules as
 * the web Tasks page).
 */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ assignmentId: string }> }) => {
  const user = await requireApiUser(req);
  const id = await studentId(user.id);
  await enforceRateLimit(`task-submit:${user.id}`, 30, 3600);
  const assignmentId = uuid.parse((await ctx.params).assignmentId);
  const input = submitSchema.parse(await readJson(req));

  const media = input.mediaIds.length
    ? await prisma.media.findMany({ where: { id: { in: input.mediaIds }, deletedAt: null }, select: { id: true, key: true, mime: true, size: true, fileName: true, width: true, height: true, uploadedById: true, isPublic: true, metadata: true } })
    : [];
  for (const mediaId of input.mediaIds) {
    const m = media.find((x) => x.id === mediaId);
    const pending = (m?.metadata as { pending?: boolean } | null)?.pending;
    if (!m || m.uploadedById !== user.id || m.isPublic || !m.key.startsWith("student-content/") || pending) {
      throw AppError.validation("One of the files is not a finished upload of yours. Please upload it again.");
    }
  }

  const result = await hermesPortal.submit(id, assignmentId, {
    submitKey: input.submitKey,
    response: input.response || null,
    consent: input.consentVersion ? { version: input.consentVersion, accepted: input.consentAccepted } : null,
    files: input.mediaIds.map((mediaId) => {
      const m = media.find((x) => x.id === mediaId)!;
      return { mediaId: m.id, key: m.key, mime: m.mime, size: m.size, fileName: m.fileName, width: m.width, height: m.height };
    }),
  });
  return jsonOk(result);
});
