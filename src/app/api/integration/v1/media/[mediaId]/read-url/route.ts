import { requireIntegration } from "@/server/integration/auth";
import { studentMediaReadUrl } from "@/server/integration/queries";
import { integrationRoute } from "@/server/integration/respond";
import { teachingScope } from "@/server/integration/scope";
import { storage } from "@/server/providers/storage";

export const dynamic = "force-dynamic";

/** GET /api/integration/v1/media/:mediaId/read-url — a 10-minute link to a student's private task upload (students.read). */
export const GET = integrationRoute(async (req, ctx: { params: Promise<{ mediaId: string }> }) => {
  const actor = await requireIntegration(req, ["students.read"]);
  const { mediaId } = await ctx.params;
  return studentMediaReadUrl(mediaId, await teachingScope(actor, "students.read"), (key, seconds) => storage().getSignedReadUrl(key, seconds));
});
