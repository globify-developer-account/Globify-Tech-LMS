import { handle, jsonOk } from "@/lib/api/respond";
import { getApiPrincipal } from "@/server/api/principal";
import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors";

export const dynamic = "force-dynamic";

/** GET /api/v1/events/:slug — event detail; tells a signed-in caller whether they are registered. */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ slug: string }> }) => {
  const { slug } = await ctx.params;
  const event = await prisma.event.findUnique({
    where: { slug },
    include: { cover: { select: { url: true, alt: true } }, campus: { select: { name: true, city: true, address: true } }, _count: { select: { registrations: true } } },
  });
  if (!event || event.status !== "PUBLISHED") throw AppError.notFound("Event");
  const user = await getApiPrincipal(req);
  const registration = user ? await prisma.eventRegistration.findFirst({ where: { eventId: event.id, OR: [{ userId: user.id }, { email: user.email }] }, select: { id: true } }) : null;
  return jsonOk({
    id: event.id,
    slug: event.slug,
    title: event.title,
    description: event.description,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    location: event.location,
    isOnline: event.isOnline,
    meetingUrl: registration ? event.meetingUrl : null,
    capacity: event.capacity,
    registered: event._count.registrations,
    seatsLeft: event.capacity != null ? Math.max(0, event.capacity - event._count.registrations) : null,
    cover: event.cover?.url ?? null,
    campus: event.campus,
    isRegistered: !!registration,
  });
});
