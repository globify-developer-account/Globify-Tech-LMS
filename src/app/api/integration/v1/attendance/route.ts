import { requireIntegration } from "@/server/integration/auth";
import { attendanceQuery, getAttendance, parseQuery } from "@/server/integration/queries";
import { integrationRoute } from "@/server/integration/respond";
import { teachingScope } from "@/server/integration/scope";

export const dynamic = "force-dynamic";

/**
 * GET /api/integration/v1/attendance?studentId&batchId&courseId&from&to
 * The percentage is computed here with the LMS formula and is null when no
 * attendance has been recorded — callers must show "no data", never 0%.
 */
export const GET = integrationRoute(async (req) => {
  const actor = await requireIntegration(req, ["attendance.read"]);
  return getAttendance(parseQuery(attendanceQuery, req), await teachingScope(actor, "attendance.read"));
});
