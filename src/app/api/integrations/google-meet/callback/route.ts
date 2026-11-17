import { NextResponse } from "next/server";
import { requirePagePermission } from "@/server/auth/session";
import { completeGoogleMeetConnection, GOOGLE_MEET_STATE_COOKIE } from "@/server/providers/live-class/google-meet";
import { audit } from "@/server/audit";
import { log } from "@/server/log";
import { absoluteUrl } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** GET /api/integrations/google-meet/callback — Google returns here after the admin consents. */
export async function GET(req: Request) {
  const user = await requirePagePermission("settings.manage");
  const url = new URL(req.url); // query string only; its host is the internal server address behind the proxy
  const back = (result: string) => {
    const res = NextResponse.redirect(absoluteUrl(`/admin/settings?googleMeet=${result}`));
    res.cookies.delete({ name: GOOGLE_MEET_STATE_COOKIE, path: "/api/integrations/google-meet" });
    return res;
  };
  const expected = req.headers.get("cookie")?.match(new RegExp(`${GOOGLE_MEET_STATE_COOKIE}=([a-f0-9]+)`))?.[1];
  const code = url.searchParams.get("code");
  if (url.searchParams.get("error") || !code) return back("cancelled");
  if (!expected || url.searchParams.get("state") !== expected) return back("expired");
  try {
    const { email } = await completeGoogleMeetConnection(code, user.id);
    await audit({ actorId: user.id, actorRoles: user.roles, action: "integration.google_meet.connect", entityType: "Setting", entityId: "integrations.googleMeet", after: { email } });
    return back("connected");
  } catch (error) {
    log.warn("google meet connect failed", { error: (error as Error).message });
    return back("failed");
  }
}
