import { authenticateService, writesEnabled } from "@/server/integration/auth";
import { integrationRoute } from "@/server/integration/respond";

export const dynamic = "force-dynamic";

/** GET /api/integration/v1/health — proves the service key works. No acting user, no data. */
export const GET = integrationRoute(async (req) => {
  await authenticateService(req);
  return { data: { service: "globifytech-lms", api: "integration/v1", writeEnabled: writesEnabled(), time: new Date().toISOString() } };
});
