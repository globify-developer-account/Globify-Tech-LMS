import { handle, jsonOk } from "@/lib/api/respond";
import { enforceRateLimit } from "@/server/rate-limit";
import { referralPreview } from "@/server/services/referrals";

export const dynamic = "force-dynamic";

/** GET /api/v1/referrals/:code — public check of a referral code for sign-up forms. */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ code: string }> }) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  await enforceRateLimit(`referral-check:${ip}`, 30, 600);
  const { code } = await ctx.params;
  return jsonOk(await referralPreview(code));
});
