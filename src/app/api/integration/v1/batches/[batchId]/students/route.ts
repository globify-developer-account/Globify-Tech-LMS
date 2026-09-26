import { requireIntegration } from "@/server/integration/auth";
import { listBatchStudents } from "@/server/integration/queries";
import { integrationRoute } from "@/server/integration/respond";
import { teachingScope } from "@/server/integration/scope";

export const dynamic = "force-dynamic";

/** GET /api/integration/v1/batches/:batchId/students — current members only. */
export const GET = integrationRoute(async (req, ctx: { params: Promise<{ batchId: string }> }) => {
  const actor = await requireIntegration(req, ["batches.read", "students.read"]);
  const { batchId } = await ctx.params;
  return listBatchStudents(batchId, await teachingScope(actor, "batches.read"));
});
