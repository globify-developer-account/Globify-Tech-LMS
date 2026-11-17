import { NextResponse } from "next/server";
import { normalizeReferralCode } from "@/server/services/referrals";
import { REFERRAL_COOKIE } from "@/lib/referrals";
import { absoluteUrl } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * GET /r/:code — the link students share. Remembers the code for 30 days and
 * opens sign-up; the account created there is credited to the referrer.
 * Redirects use the public app URL: behind the host's proxy `req.url` is the
 * internal server address (https://0.0.0.0:3000).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const code = normalizeReferralCode((await ctx.params).code);
  const res = NextResponse.redirect(absoluteUrl(code ? `/sign-up?ref=${code}` : "/sign-up"));
  if (code) res.cookies.set(REFERRAL_COOKIE, code, { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
  return res;
}
