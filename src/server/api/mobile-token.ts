import "server-only";
import { encode } from "next-auth/jwt";
import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors";
import type { RoleKey } from "@/lib/rbac";

const COOKIE_NAME = process.env.NODE_ENV === "production" ? "__Secure-authjs.session-token" : "authjs.session-token";
export const MOBILE_TOKEN_MAX_AGE = 30 * 24 * 60 * 60;

/**
 * Issues a session JWT for the mobile app from the user's current database
 * state. Identical in shape to the web cookie and to /api/v1/auth/token, so
 * `getApiPrincipal` validates all of them with one code path.
 */
export async function issueMobileToken(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, status: true, sessionVersion: true, locale: true, roles: { select: { role: { select: { key: true } }, campusId: true } } },
  });
  if (!user || user.status !== "ACTIVE") throw AppError.unauthenticated();
  const roles = user.roles.map((r) => r.role.key as RoleKey);
  const token = await encode({
    secret: process.env.AUTH_SECRET!,
    salt: COOKIE_NAME,
    maxAge: MOBILE_TOKEN_MAX_AGE,
    token: { sub: user.id, name: user.name, email: user.email, roles, sv: user.sessionVersion, locale: user.locale, campusId: user.roles.find((r) => r.campusId)?.campusId ?? null, rolesRefreshedAt: Date.now() },
  });
  return { token, tokenType: "Bearer" as const, expiresIn: MOBILE_TOKEN_MAX_AGE, user: { id: user.id, name: user.name, email: user.email, roles } };
}
