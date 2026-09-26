"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ok, fail, AppError, type ActionResult } from "@/server/errors";
import { requireStudentProfile } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import { hermesPortal } from "@/server/hermes/portal";

/**
 * Student side of Hermes tasks. The student is identified by the LMS
 * session only; Hermes is told who they are server to server. Files are the
 * student's own uploads into the private student-content/ area, checked here
 * before Hermes ever sees a reference to them.
 */

const uuid = z.string().uuid();

export async function openHermesTaskAction(assignmentId: string): Promise<ActionResult<undefined>> {
  try {
    const { studentId } = await requireStudentProfile();
    await hermesPortal.open(studentId, uuid.parse(assignmentId));
    return ok(undefined);
  } catch (error) {
    return fail(error);
  }
}

const submitSchema = z.object({
  assignmentId: uuid,
  /** Generated when the form loads: a double click or a retry stores one submission. */
  submitKey: z.string().regex(/^[A-Za-z0-9._:-]{8,200}$/),
  response: z.string().trim().max(2000).optional(),
  consentAccepted: z.array(z.string().max(300)).max(10).default([]),
  consentVersion: z.string().max(60).nullish(),
  mediaIds: z.array(uuid).max(10).default([]),
});

export async function submitHermesTaskAction(raw: unknown): Promise<ActionResult<{ submissionId: string }>> {
  try {
    const { user, studentId } = await requireStudentProfile();
    const input = submitSchema.parse(raw);
    const media = input.mediaIds.length
      ? await prisma.media.findMany({ where: { id: { in: input.mediaIds }, deletedAt: null }, select: { id: true, key: true, mime: true, size: true, fileName: true, width: true, height: true, uploadedById: true, isPublic: true, metadata: true } })
      : [];
    // Only this student's finished uploads into the private student area.
    for (const id of input.mediaIds) {
      const m = media.find((x) => x.id === id);
      const pending = (m?.metadata as { pending?: boolean } | null)?.pending;
      if (!m || m.uploadedById !== user.id || m.isPublic || !m.key.startsWith("student-content/") || pending) {
        throw AppError.validation("One of the files is not a finished upload of yours. Please upload it again.");
      }
    }
    const result = await hermesPortal.submit(studentId, input.assignmentId, {
      submitKey: input.submitKey,
      response: input.response || null,
      consent: input.consentVersion ? { version: input.consentVersion, accepted: input.consentAccepted } : null,
      files: input.mediaIds.map((id) => {
        const m = media.find((x) => x.id === id)!;
        return { mediaId: m.id, key: m.key, mime: m.mime, size: m.size, fileName: m.fileName, width: m.width, height: m.height };
      }),
    });
    revalidatePath("/student/tasks");
    revalidatePath(`/student/tasks/${input.assignmentId}`);
    return ok({ submissionId: result.submissionId });
  } catch (error) {
    return fail(error);
  }
}

/**
 * Brief §20: the student withdraws permission to use what they handed in for
 * this task. Hermes stops any use and tells the staff involved.
 */
export async function withdrawHermesConsentAction(assignmentId: string, reason?: string): Promise<ActionResult<{ withdrawn: number }>> {
  try {
    const { studentId } = await requireStudentProfile();
    const why = z.string().trim().max(500).optional().parse(reason);
    const result = await hermesPortal.withdrawConsent(studentId, uuid.parse(assignmentId), why || null);
    revalidatePath(`/student/tasks/${assignmentId}`);
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
