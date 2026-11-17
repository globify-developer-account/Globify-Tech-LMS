import "server-only";
import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors";
import { getSetting } from "@/server/services/settings";
import { notify } from "@/server/services/notifications";
import { absoluteUrl, toNumber } from "@/lib/utils";

/**
 * Refer a friend: every student has a personal code. A friend who signs up
 * with it gets a one-time welcome discount; when that friend enrols (in a paid
 * course, by default) the referrer gets a one-time discount too. Both are
 * ordinary single-use Discount codes, redeemed through the normal checkout.
 * Percentages and validity are settings (Admin → Settings → Referrals).
 */

// No 0/O or 1/I, so codes survive being read aloud or typed from a screenshot.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const randomChars = (n: number) => Array.from({ length: n }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
/** "Ayesha Khalid" → "Ayesha K." — what a referrer sees of the friends they invited. */
const shortName = (name: string) => {
  const [first, ...rest] = name.trim().split(/\s+/);
  return rest.length ? `${first} ${rest[rest.length - 1]![0]!.toUpperCase()}.` : (first ?? name);
};

export function normalizeReferralCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** The student's personal code, created on first request: first name + 4 characters, e.g. AYESHA7K2Q. */
export async function referralCodeFor(studentId: string): Promise<string> {
  const student = await prisma.studentProfile.findUnique({ where: { id: studentId }, select: { referralCode: true, user: { select: { name: true } } } });
  if (!student) throw AppError.notFound("Student");
  if (student.referralCode) return student.referralCode;
  const stem = firstName(student.user.name).toUpperCase().replace(/[^A-Z]/g, "").slice(0, 8) || "GLOBIFY";
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const updated = await prisma.studentProfile.updateMany({ where: { id: studentId, referralCode: null }, data: { referralCode: `${stem}${randomChars(4)}` } });
      if (updated.count) break;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  const code = (await prisma.studentProfile.findUnique({ where: { id: studentId }, select: { referralCode: true } }))?.referralCode;
  if (!code) throw new Error("Couldn't allocate a referral code");
  return code;
}

/** The active student behind a code, or null when the code is unknown or referrals are off. */
export async function findReferrer(code: string) {
  if (!(await getSetting("referrals.enabled"))) return null;
  const normalized = normalizeReferralCode(code);
  if (!normalized) return null;
  const student = await prisma.studentProfile.findUnique({ where: { referralCode: normalized }, select: { id: true, userId: true, user: { select: { name: true, status: true } } } });
  if (!student || student.user.status !== "ACTIVE") return null;
  return { studentId: student.id, userId: student.userId, firstName: firstName(student.user.name), code: normalized };
}

/** What a sign-up form can show for a code before the account exists. */
export async function referralPreview(code: string) {
  const referrer = await findReferrer(code);
  if (!referrer) return { valid: false as const };
  return { valid: true as const, code: referrer.code, referrerFirstName: referrer.firstName, friendDiscountPercent: await getSetting("referrals.friendDiscountPercent") };
}

/** A single-use percentage Discount, valid for the configured number of days. */
async function issueCoupon(prefix: "WELCOME" | "REF", percent: number, name: string) {
  const validDays = await getSetting("referrals.couponValidDays");
  const now = new Date();
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return await prisma.discount.create({
        data: { code: `${prefix}-${randomChars(6)}`, name, type: "PERCENT", value: percent, maxUses: 1, validFrom: now, validTo: new Date(now.getTime() + validDays * 86_400_000) },
        select: { id: true, code: true },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  throw new Error("Couldn't allocate a discount code");
}

/**
 * Right after sign-up: link the new account to its referrer and give the
 * friend their welcome coupon. Never fails the sign-up — an unusable code is
 * simply ignored here (forms validate it up front).
 */
export async function applyReferralAtSignup(refereeUserId: string, code: string): Promise<{ welcomeCode: string | null } | null> {
  const referrer = await findReferrer(code);
  if (!referrer || referrer.userId === refereeUserId) return null;
  if (await prisma.referral.findUnique({ where: { refereeUserId }, select: { id: true } })) return null;
  const friend = await prisma.user.findUnique({ where: { id: refereeUserId }, select: { name: true } });
  if (!friend) return null;
  const percent = await getSetting("referrals.friendDiscountPercent");
  const coupon = percent > 0 ? await issueCoupon("WELCOME", percent, `Referral welcome · ${friend.name}`) : null;
  await prisma.referral.create({ data: { referrerId: referrer.studentId, refereeUserId, code: referrer.code, friendDiscountId: coupon?.id ?? null } });
  if (coupon) {
    await notify({
      userId: refereeUserId,
      event: "REFERRAL",
      data: { code: coupon.code, percent, referrer: referrer.firstName },
      href: "/student/referrals",
      fallback: { title: `Welcome gift: ${percent}% off your first course`, body: `${referrer.firstName} invited you to Globify Tech. Use code ${coupon.code} when you pay for your first course.` },
    });
  }
  return { welcomeCode: coupon?.code ?? null };
}

/** After an enrolment: if a friend referred this student, reward the referrer — once. */
export async function rewardReferralOnEnrollment(input: { studentId: string; courseId: string; enrollmentId: string }) {
  const student = await prisma.studentProfile.findUnique({ where: { id: input.studentId }, select: { userId: true, user: { select: { name: true } } } });
  if (!student) return;
  const referral = await prisma.referral.findUnique({ where: { refereeUserId: student.userId }, select: { id: true, status: true, referrer: { select: { userId: true } } } });
  if (!referral || referral.status !== "SIGNED_UP") return;
  if (await getSetting("referrals.paidCoursesOnly")) {
    const course = await prisma.course.findUnique({ where: { id: input.courseId }, select: { price: true, discountPrice: true } });
    if (!course || toNumber(course.discountPrice ?? course.price) <= 0) return;
  }
  // Claim first, so two enrolments landing together can't both pay out.
  const claimed = await prisma.referral.updateMany({ where: { id: referral.id, status: "SIGNED_UP" }, data: { status: "REWARDED", rewardedAt: new Date(), enrollmentId: input.enrollmentId } });
  if (!claimed.count) return;
  const friend = firstName(student.user.name);
  const percent = await getSetting("referrals.referrerDiscountPercent");
  const coupon = percent > 0 ? await issueCoupon("REF", percent, `Referral reward · ${friend} enrolled`) : null;
  if (coupon) await prisma.referral.update({ where: { id: referral.id }, data: { referrerDiscountId: coupon.id } });
  await notify({
    userId: referral.referrer.userId,
    event: "REFERRAL",
    data: { friend, code: coupon?.code ?? "", percent },
    href: "/student/referrals",
    fallback: {
      title: `${friend} enrolled — thank you for the referral!`,
      body: coupon ? `Here's ${percent}% off your next fee: use code ${coupon.code}.` : "Your referral has been counted.",
    },
  });
}

type CouponRow = { code: string; value: Prisma.Decimal; usedCount: number; maxUses: number | null; validTo: Date | null; isActive: boolean };
function couponView(d: CouponRow) {
  const used = d.maxUses != null && d.usedCount >= d.maxUses;
  const expired = !!d.validTo && d.validTo < new Date();
  return { code: d.code, percent: toNumber(d.value), validTo: d.validTo, status: used ? ("USED" as const) : expired || !d.isActive ? ("EXPIRED" as const) : ("AVAILABLE" as const) };
}
const couponSelect = { code: true, value: true, usedCount: true, maxUses: true, validTo: true, isActive: true } as const;

/** Everything the Refer-a-friend screens show a student. */
export async function referralSummary(studentId: string) {
  const student = await prisma.studentProfile.findUnique({ where: { id: studentId }, select: { userId: true } });
  if (!student) throw AppError.notFound("Student");
  const [enabled, friendDiscountPercent, referrerDiscountPercent, couponValidDays, paidCoursesOnly] = await Promise.all([
    getSetting("referrals.enabled"),
    getSetting("referrals.friendDiscountPercent"),
    getSetting("referrals.referrerDiscountPercent"),
    getSetting("referrals.couponValidDays"),
    getSetting("referrals.paidCoursesOnly"),
  ]);
  const code = enabled ? await referralCodeFor(studentId) : null;
  const [referrals, welcome] = await Promise.all([
    prisma.referral.findMany({ where: { referrerId: studentId }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, status: true, createdAt: true, rewardedAt: true, referee: { select: { name: true } }, referrerDiscount: { select: couponSelect } } }),
    prisma.referral.findUnique({ where: { refereeUserId: student.userId }, select: { friendDiscount: { select: couponSelect }, referrer: { select: { user: { select: { name: true } } } } } }),
  ]);
  return {
    enabled,
    code,
    shareUrl: code ? absoluteUrl(`/r/${code}`) : null,
    rules: { friendDiscountPercent, referrerDiscountPercent, couponValidDays, paidCoursesOnly },
    stats: { invited: referrals.length, enrolled: referrals.filter((r) => r.status === "REWARDED").length },
    referrals: referrals.map((r) => ({ id: r.id, friend: shortName(r.referee.name), status: r.status, joinedAt: r.createdAt, rewardedAt: r.rewardedAt })),
    rewards: referrals.flatMap((r) => (r.referrerDiscount ? [couponView(r.referrerDiscount)] : [])),
    welcome: welcome?.friendDiscount ? { ...couponView(welcome.friendDiscount), from: firstName(welcome.referrer.user.name) } : null,
  };
}

export type ReferralSummary = Awaited<ReturnType<typeof referralSummary>>;
