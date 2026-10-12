import { z } from "zod";
import { handle, jsonOk, readJson } from "@/lib/api/respond";
import { requireApiUser } from "@/server/api/principal";
import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors";
import { applyToOpportunity } from "@/server/services/career";
import { enforceRateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

const schema = z
  .object({
    jobId: z.string().uuid().nullable().optional(),
    internshipId: z.string().uuid().nullable().optional(),
    coverLetter: z.string().trim().max(5000).optional(),
    cvMediaId: z.string().uuid().nullable().optional(),
  })
  .refine((v) => !!v.jobId !== !!v.internshipId, { message: "Apply to one job or one internship." });

/** POST /api/v1/career/apply — apply to a job or internship. */
export const POST = handle(async (req) => {
  const user = await requireApiUser(req);
  const student = await prisma.studentProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!student) throw AppError.forbidden("Only students can use this endpoint.");
  await enforceRateLimit(`career-apply:${user.id}`, 20, 86400);
  const input = schema.parse(await readJson(req));
  const application = await applyToOpportunity(student.id, { jobId: input.jobId ?? null, internshipId: input.internshipId ?? null, coverLetter: input.coverLetter, cvMediaId: input.cvMediaId ?? null });
  return jsonOk({ id: application.id, status: application.status, appliedAt: application.createdAt });
});
