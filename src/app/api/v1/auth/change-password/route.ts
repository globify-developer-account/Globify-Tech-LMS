import { z } from "zod";
import { handle, jsonOk, readJson } from "@/lib/api/respond";
import { requireApiUser } from "@/server/api/principal";
import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors";
import { hashPassword, passwordProblem, verifyPassword } from "@/server/auth/password";
import { issueMobileToken } from "@/server/api/mobile-token";
import { enforceRateLimit } from "@/server/rate-limit";
import { audit } from "@/server/audit";

export const dynamic = "force-dynamic";

const schema = z.object({ currentPassword: z.string().min(1), password: z.string().min(8).max(200) });

/**
 * POST /api/v1/auth/change-password — verifies the current password, stores
 * the new hash, invalidates every other session and hands the app a fresh
 * token so the student stays signed in on this device only.
 */
export const POST = handle(async (req) => {
  const user = await requireApiUser(req);
  await enforceRateLimit(`pwchange:${user.id}`, 5, 3600);
  const input = schema.parse(await readJson(req));
  const problem = passwordProblem(input.password);
  if (problem) throw AppError.validation(problem);
  const record = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
  if (!(await verifyPassword(input.currentPassword, record.passwordHash))) {
    throw AppError.validation("Current password is incorrect.");
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(input.password), sessionVersion: { increment: 1 }, failedLogins: 0, lockedUntil: null },
  });
  await audit({ actorId: user.id, actorRoles: user.roles, action: "auth.password_change", entityType: "User", entityId: user.id });
  return jsonOk(await issueMobileToken(user.id));
});
