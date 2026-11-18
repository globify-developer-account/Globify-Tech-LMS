import "server-only";
import { prisma } from "@/server/db/prisma";
import { normalizeOfferCode } from "@/lib/offers";
import { toNumber } from "@/lib/utils";

/**
 * Campaign offers: an ordinary Discount code shared as a link or QR code
 * (/o/:code). Scanning remembers the code, and it is applied automatically
 * when the visitor enrols. Personal referral coupons (WELCOME-/REF-) are never
 * offered this way, even though they are Discount rows too.
 */
export type OfferPreview =
  | { valid: true; code: string; name: string; type: "PERCENT" | "FIXED"; value: number; validTo: Date | null; courses: Array<{ title: string; slug: string }> }
  | { valid: false; code: string; reason: "unknown" | "inactive" | "expired" | "used-up" };

export async function offerPreview(rawCode: string): Promise<OfferPreview> {
  const code = normalizeOfferCode(rawCode);
  if (!code) return { valid: false, code, reason: "unknown" };
  const d = await prisma.discount.findFirst({
    where: { code, referralWelcome: { is: null }, referralReward: { is: null } },
    select: { code: true, name: true, type: true, value: true, maxUses: true, usedCount: true, validFrom: true, validTo: true, courseIds: true, isActive: true },
  });
  if (!d) return { valid: false, code, reason: "unknown" };
  const now = new Date();
  if (!d.isActive || (d.validFrom && d.validFrom > now)) return { valid: false, code, reason: "inactive" };
  if (d.validTo && d.validTo < now) return { valid: false, code, reason: "expired" };
  if (d.maxUses != null && d.usedCount >= d.maxUses) return { valid: false, code, reason: "used-up" };
  const courses = d.courseIds.length
    ? await prisma.course.findMany({ where: { id: { in: d.courseIds }, status: "PUBLISHED", deletedAt: null }, select: { title: true, slug: true }, orderBy: { title: "asc" } })
    : [];
  return { valid: true, code: d.code, name: d.name, type: d.type, value: toNumber(d.value), validTo: d.validTo, courses };
}
