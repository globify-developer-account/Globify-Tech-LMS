import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requirePagePermission } from "@/server/auth/session";
import { GOOGLE_MEET_STATE_COOKIE, googleMeetClient, googleMeetConsentUrl } from "@/server/providers/live-class/google-meet";
import { absoluteUrl } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** GET /api/integrations/google-meet/connect — admin starts connecting the Google account that hosts classes. */
export async function GET() {
  await requirePagePermission("settings.manage");
  // Public app URL, not req.url: behind the host's proxy that is the internal server address.
  if (!googleMeetClient()) return NextResponse.redirect(absoluteUrl("/admin/settings?googleMeet=not-configured"));
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(googleMeetConsentUrl(state));
  res.cookies.set(GOOGLE_MEET_STATE_COOKIE, state, { path: "/api/integrations/google-meet", maxAge: 600, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  return res;
}
