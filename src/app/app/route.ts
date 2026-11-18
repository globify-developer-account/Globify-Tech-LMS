import { NextResponse } from "next/server";
import { absoluteUrl } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Play install referrer, so QR installs show up as a campaign in Play Console.
const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=globifytech.com&referrer=${encodeURIComponent("utm_source=globifytech.com&utm_medium=qr&utm_campaign=app_download")}`;

/**
 * GET /app — the "download the app" link behind printed QR codes. One stable
 * link, so printed codes keep working if the destination changes. Android and
 * desktop go to Google Play; iPhone/iPad (no iOS app yet) to the course
 * catalogue on the website.
 */
export function GET(req: Request) {
  const ua = req.headers.get("user-agent") ?? "";
  if (/iPhone|iPad|iPod/i.test(ua)) return NextResponse.redirect(absoluteUrl("/courses"));
  return NextResponse.redirect(PLAY_STORE_URL);
}
