import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors";
import { enforceRateLimit } from "@/server/rate-limit";
import { can, type Permission, type Principal, type RoleKey } from "@/lib/rbac";

/**
 * Service-to-service authentication for Hermes (hermes.globifytech.com).
 *
 * Hermes sends `Authorization: Bearer <service key>`. The LMS keeps only the
 * SHA-256 hash of each accepted key in HERMES_INTEGRATION_KEY_HASHES
 * (comma-separated, so a key can be rotated with an overlap). The key
 * identifies Hermes the service; it is never a person's password or session.
 *
 * Every call also names the staff member Hermes is acting for
 * (X-Hermes-Actor-Id, an LMS User.id). That user must be active and hold the
 * route's permission in the LMS role matrix, so the LMS — not Hermes — decides
 * what they may see.
 *
 * With no hashes configured the integration API answers UNAVAILABLE, so
 * deploying this code changes nothing until a key is set.
 */

const HASH_PATTERN = /^[0-9a-f]{64}$/;

export function configuredKeyHashes(raw = process.env.HERMES_INTEGRATION_KEY_HASHES): Buffer[] {
  return (raw ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter((h) => HASH_PATTERN.test(h))
    .map((h) => Buffer.from(h, "hex"));
}

export function hashServiceKey(key: string): Buffer {
  return createHash("sha256").update(key, "utf8").digest();
}

/** Constant-time check of a bearer header against every configured hash. */
export function serviceKeyMatches(authorization: string | null, hashes: Buffer[]): boolean {
  if (!authorization?.startsWith("Bearer ")) return false;
  const key = authorization.slice(7).trim();
  if (key.length < 32) return false;
  const presented = hashServiceKey(key);
  let matched = false;
  // No early exit: every configured hash is compared on every call.
  for (const h of hashes) if (timingSafeEqual(presented, h)) matched = true;
  return matched;
}

export async function authenticateService(req: Request): Promise<void> {
  const hashes = configuredKeyHashes();
  if (!hashes.length) throw AppError.unavailable("The integration API is not configured on this server.");
  if (!serviceKeyMatches(req.headers.get("authorization"), hashes)) throw AppError.unauthenticated("The service credentials were not accepted.");
  // One Hermes instance, so one bucket. Generous: this protects the database
  // from a runaway workflow, not from staff traffic.
  await enforceRateLimit("integration:hermes", 600, 60);
}

export interface IntegrationActor extends Principal {
  name: string;
  email: string;
  actorType: "user" | "workflow";
}

const actorIdSchema = z.string().uuid();

export async function resolveActor(req: Request): Promise<IntegrationActor> {
  const raw = req.headers.get("x-hermes-actor-id")?.trim();
  if (!raw) throw AppError.validation("X-Hermes-Actor-Id is required.");
  const id = actorIdSchema.safeParse(raw);
  if (!id.success) throw AppError.validation("X-Hermes-Actor-Id must be an LMS user id.");
  const user = await prisma.user.findUnique({
    where: { id: id.data },
    select: { id: true, name: true, email: true, status: true, deletedAt: true, roles: { select: { role: { select: { key: true } }, campusId: true } } },
  });
  if (!user || user.deletedAt || user.status !== "ACTIVE") throw AppError.forbidden("The acting user is not an active LMS user.");
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roles: user.roles.map((r) => r.role.key as RoleKey),
    campusId: user.roles.find((r) => r.campusId)?.campusId ?? null,
    actorType: req.headers.get("x-hermes-actor-type") === "workflow" ? "workflow" : "user",
  };
}

/** Service key, then acting user, then every listed LMS permission. */
export async function requireIntegration(req: Request, permissions: Permission[]): Promise<IntegrationActor> {
  await authenticateService(req);
  const actor = await resolveActor(req);
  for (const p of permissions) {
    if (!can(actor, p)) throw AppError.forbidden(`The acting user does not have the LMS permission "${p}".`);
  }
  return actor;
}
