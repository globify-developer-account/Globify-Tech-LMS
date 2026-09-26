import { can } from "@/lib/rbac";
import { authenticateService, resolveActor } from "@/server/integration/auth";
import { courseListQuery, listCourses, parseQuery } from "@/server/integration/queries";
import { integrationRoute } from "@/server/integration/respond";

export const dynamic = "force-dynamic";

/** GET /api/integration/v1/courses?q&status&page&limit — drafts need courses.read; the published catalogue does not. */
export const GET = integrationRoute(async (req) => {
  await authenticateService(req);
  const actor = await resolveActor(req);
  return listCourses(parseQuery(courseListQuery, req), can(actor, "courses.read"));
});
