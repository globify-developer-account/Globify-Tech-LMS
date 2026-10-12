import { handle, jsonOk } from "@/lib/api/respond";
import { prisma } from "@/server/db/prisma";

export const dynamic = "force-dynamic";

/** GET /api/v1/events — published events for the app: upcoming first, then recent past. */
export const GET = handle(async (req) => {
  const p = new URL(req.url).searchParams;
  const take = Math.min(50, Number(p.get("limit") ?? 20) || 20);
  const scope = p.get("scope") === "past" ? "past" : "upcoming";
  const now = new Date();
  const events = await prisma.event.findMany({
    where: { status: "PUBLISHED", startsAt: scope === "past" ? { lt: now } : { gte: new Date(now.getTime() - 3 * 3600_000) } },
    orderBy: { startsAt: scope === "past" ? "desc" : "asc" },
    take,
    include: { cover: { select: { url: true, alt: true } }, campus: { select: { name: true, city: true } }, _count: { select: { registrations: true } } },
  });
  return jsonOk(
    events.map((e) => ({
      id: e.id,
      slug: e.slug,
      title: e.title,
      description: e.description,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      location: e.location,
      isOnline: e.isOnline,
      capacity: e.capacity,
      registered: e._count.registrations,
      seatsLeft: e.capacity != null ? Math.max(0, e.capacity - e._count.registrations) : null,
      cover: e.cover?.url ?? null,
      campus: e.campus,
    })),
  );
});
