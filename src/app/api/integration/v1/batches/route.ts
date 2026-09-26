import { requireIntegration } from "@/server/integration/auth";
import { batchListQuery, listBatches, parseQuery } from "@/server/integration/queries";
import { integrationRoute } from "@/server/integration/respond";
import { teachingScope } from "@/server/integration/scope";

export const dynamic = "force-dynamic";

/** GET /api/integration/v1/batches?courseId&status&startFrom&startTo&page&limit */
export const GET = integrationRoute(async (req) => {
  const actor = await requireIntegration(req, ["batches.read"]);
  return listBatches(parseQuery(batchListQuery, req), await teachingScope(actor, "batches.read"));
});
