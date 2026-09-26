import { requireIntegration } from "@/server/integration/auth";
import { admissionsQuery, listAdmissions, parseQuery } from "@/server/integration/queries";
import { integrationRoute } from "@/server/integration/respond";

export const dynamic = "force-dynamic";

/** GET /api/integration/v1/admissions?status&courseId&from&to&page&limit */
export const GET = integrationRoute(async (req) => {
  await requireIntegration(req, ["applications.read"]);
  return listAdmissions(parseQuery(admissionsQuery, req));
});
