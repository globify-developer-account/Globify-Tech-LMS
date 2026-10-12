import { handle, jsonOk } from "@/lib/api/respond";
import { requireApiUser } from "@/server/api/principal";
import { prisma } from "@/server/db/prisma";
import { BADGES } from "@/server/services/gamification";

export const dynamic = "force-dynamic";

/** GET /api/v1/student/achievements — the badge catalogue with earned state, plus the learning streak. */
export const GET = handle(async (req) => {
  const user = await requireApiUser(req);
  const [earned, streak, weekAgg] = await Promise.all([
    prisma.userBadge.findMany({ where: { userId: user.id }, include: { badge: true } }),
    prisma.streak.findUnique({ where: { userId: user.id } }),
    prisma.learningActivity.aggregate({ where: { userId: user.id }, _sum: { seconds: true, lessons: true } }),
  ]);
  const earnedByKey = new Map(earned.map((e) => [e.badge.key, e]));
  return jsonOk({
    streak: streak ? { current: streak.current, longest: streak.longest, lastActiveDate: streak.lastActiveDate } : { current: 0, longest: 0, lastActiveDate: null },
    totals: { learningSeconds: weekAgg._sum.seconds ?? 0, lessonsCompleted: weekAgg._sum.lessons ?? 0 },
    badges: BADGES.map((b) => {
      const got = earnedByKey.get(b.key);
      return { key: b.key, name: b.name, description: b.description, icon: b.icon, earned: !!got, awardedAt: got?.awardedAt ?? null };
    }),
  });
});
