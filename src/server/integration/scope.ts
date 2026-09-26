import "server-only";
import { prisma } from "@/server/db/prisma";
import { can, type Permission, type RoleKey } from "@/lib/rbac";
import type { IntegrationActor } from "./auth";

const TEACHING_ROLES: readonly RoleKey[] = ["INSTRUCTOR", "TEACHING_ASSISTANT"];

/** What a teaching-only actor may see. null means the whole institute. */
export interface TeachingScope {
  batchIds: string[];
  courseIds: string[];
}

/**
 * Instructors and teaching assistants see only the batches and courses they
 * teach — the rule the Instructor Studio applies (services/instructor-scope.ts).
 *
 * The scope applies only when the permission comes from a teaching role alone:
 * an instructor who is also an Academic Manager sees what the manager sees.
 */
export async function teachingScope(actor: IntegrationActor, permission: Permission): Promise<TeachingScope | null> {
  const otherRoles = actor.roles.filter((r) => !TEACHING_ROLES.includes(r));
  if (can({ ...actor, roles: otherRoles }, permission)) return null;
  if (can(actor, "courses.publish")) return null;

  const profile = await prisma.instructorProfile.findUnique({ where: { userId: actor.id }, select: { id: true } });
  if (!profile) return { batchIds: [], courseIds: [] };
  const [taught, led] = await Promise.all([
    prisma.instructorCourse.findMany({ where: { instructorId: profile.id }, select: { courseId: true } }),
    prisma.batch.findMany({ where: { instructorId: profile.id, deletedAt: null }, select: { courseId: true } }),
  ]);
  const courseIds = [...new Set([...taught, ...led].map((c) => c.courseId))];
  const batches = await prisma.batch.findMany({
    where: { deletedAt: null, OR: [{ instructorId: profile.id }, { courseId: { in: courseIds } }] },
    select: { id: true },
  });
  return { batchIds: batches.map((b) => b.id), courseIds };
}
