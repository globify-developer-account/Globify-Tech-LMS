import { can } from "@/lib/rbac";
import { requireIntegrationAny, requireWritesEnabled } from "@/server/integration/auth";
import { notifyStudentFromHermes } from "@/server/integration/queries";
import { integrationRoute } from "@/server/integration/respond";
import { teachingScope } from "@/server/integration/scope";
import { readJson } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/**
 * POST /api/integration/v1/students/:studentId/notifications — an in-app
 * notification for one student, sent by Hermes (task assigned, reminder).
 * Needs the write switch (HERMES_INTEGRATION_WRITE_ENABLED=true) and an
 * acting user with students.update (assigning a task) or
 * notifications.manage (a notice). Idempotent on the Idempotency-Key header.
 */
export const POST = integrationRoute(async (req, ctx: { params: Promise<{ studentId: string }> }) => {
  const actor = await requireIntegrationAny(req, ["students.update", "notifications.manage"]);
  requireWritesEnabled();
  const { studentId } = await ctx.params;
  const scope = can(actor, "students.update") ? await teachingScope(actor, "students.update") : null;
  return notifyStudentFromHermes(studentId, req.headers.get("idempotency-key"), await readJson(req), scope, actor.id);
});
