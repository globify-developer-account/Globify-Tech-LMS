import { requireIntegration } from "@/server/integration/auth";
import { listStudentEnrollments } from "@/server/integration/queries";
import { integrationRoute } from "@/server/integration/respond";
import { teachingScope } from "@/server/integration/scope";

export const dynamic = "force-dynamic";

/** GET /api/integration/v1/students/:studentId/enrollments */
export const GET = integrationRoute(async (req, ctx: { params: Promise<{ studentId: string }> }) => {
  const actor = await requireIntegration(req, ["enrollments.read"]);
  const { studentId } = await ctx.params;
  return listStudentEnrollments(studentId, await teachingScope(actor, "enrollments.read"));
});
