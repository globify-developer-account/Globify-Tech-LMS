import { z } from "zod";
import { handle, jsonOk, readJson } from "@/lib/api/respond";
import { getApiPrincipal } from "@/server/api/principal";
import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors";
import { registerForEvent } from "@/server/services/cms";
import { enforceRateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/events/:slug/register — register for an event. Signed-in
 * callers register with their account details; guests send name and email.
 */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ slug: string }> }) => {
  const { slug } = await ctx.params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  await enforceRateLimit(`event-register:${ip}`, 10, 3600);
  const event = await prisma.event.findUnique({ where: { slug }, select: { id: true, status: true } });
  if (!event || event.status !== "PUBLISHED") throw AppError.notFound("Event");

  const user = await getApiPrincipal(req);
  if (user) {
    const phone = (await prisma.user.findUnique({ where: { id: user.id }, select: { phone: true } }))?.phone ?? undefined;
    return jsonOk(await registerForEvent({ eventId: event.id, name: user.name, email: user.email, phone: phone ?? undefined, userId: user.id }));
  }
  const guest = z.object({ name: z.string().trim().min(2).max(120), email: z.string().email(), phone: z.string().trim().max(30).optional() }).parse(await readJson(req));
  return jsonOk(await registerForEvent({ eventId: event.id, name: guest.name, email: guest.email, phone: guest.phone, userId: null }));
});
