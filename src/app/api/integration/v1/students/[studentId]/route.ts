import { requireIntegration } from "@/server/integration/auth";
import { getStudent } from "@/server/integration/queries";
import { integrationRoute } from "@/server/integration/respond";
import { teachingScope } from "@/server/integration/scope";

export const dynamic = "force-dynamic";

/** GET /api/integration/v1/students/:studentId — studentId is StudentProfile.id. */
export const GET = integrationRoute(async (req, ctx: { params: Promise<{ studentId: string }> }) => {
  const actor = await requireIntegration(req, ["students.read"]);
  const { studentId } = await ctx.params;
  return getStudent(studentId, await teachingScope(actor, "students.read"));
});
