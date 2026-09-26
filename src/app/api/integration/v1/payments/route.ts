import { requireIntegration } from "@/server/integration/auth";
import { listPayments, parseQuery, paymentsQuery } from "@/server/integration/queries";
import { integrationRoute } from "@/server/integration/respond";

export const dynamic = "force-dynamic";

/** GET /api/integration/v1/payments?studentId&status&from&to&page&limit — read-only. */
export const GET = integrationRoute(async (req) => {
  await requireIntegration(req, ["payments.read"]);
  return listPayments(parseQuery(paymentsQuery, req));
});
