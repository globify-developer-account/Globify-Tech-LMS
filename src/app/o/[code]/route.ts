import { NextResponse } from "next/server";
import { offerPreview } from "@/server/services/offers";
import { OFFER_COOKIE, normalizeOfferCode } from "@/lib/offers";
import { absoluteUrl } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * GET /o/:code — the link behind an offer QR code. Remembers a valid offer for
 * 30 days (applied automatically when this visitor enrols on the website) and
 * shows the offer page. Redirects use the public app URL, not req.url, which
 * is the internal server address behind the host's proxy.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const code = normalizeOfferCode((await ctx.params).code);
  if (!code) return NextResponse.redirect(absoluteUrl("/courses"));
  const offer = await offerPreview(code);
  const res = NextResponse.redirect(absoluteUrl(`/offer/${encodeURIComponent(offer.code)}`));
  if (offer.valid) res.cookies.set(OFFER_COOKIE, offer.code, { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
  return res;
}
