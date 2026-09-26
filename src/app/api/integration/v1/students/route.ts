import { requireIntegration } from "@/server/integration/auth";
import { listStudents, parseQuery, studentListQuery } from "@/server/integration/queries";
import { integrationRoute } from "@/server/integration/respond";
import { teachingScope } from "@/server/integration/scope";

export const dynamic = "force-dynamic";

/** GET /api/integration/v1/students?q&phone&courseId&batchId&status&page&limit */
export const GET = integrationRoute(async (req) => {
  const actor = await requireIntegration(req, ["students.read"]);
  return listStudents(parseQuery(studentListQuery, req), await teachingScope(actor, "students.read"));
});
