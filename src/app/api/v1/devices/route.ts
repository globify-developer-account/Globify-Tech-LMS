import { z } from "zod";
import { handle, jsonOk, readJson } from "@/lib/api/respond";
import { getApiPrincipal, requireApiUser } from "@/server/api/principal";
import { enforceRateLimit } from "@/server/rate-limit";
import { registerDevice, unregisterDevice } from "@/server/services/devices";

export const dynamic = "force-dynamic";

// FCM registration tokens are base64url with a ':' separator (APNs tokens are hex).
const tokenSchema = z.string().trim().min(10).max(4096).regex(/^[A-Za-z0-9_.:-]+$/, "Not a push token.");

const deviceSchema = z.object({
  token: tokenSchema,
  platform: z.enum(["android", "ios"]).transform((p) => (p === "ios" ? ("IOS" as const) : ("ANDROID" as const))),
  appVersion: z.string().trim().max(40).optional(),
});

/**
 * POST /api/v1/devices — register this phone's push token. Signed in, the
 * phone gets the user's pushes; without a session (a guest, or a session that
 * was revoked) it is registered as a guest and only gets broadcasts to
 * everyone with the app. App 1.0.10+ calls this on every launch.
 */
export const POST = handle(async (req) => {
  const user = await getApiPrincipal(req);
  if (!user) {
    // Generous because mobile carriers put many phones behind one IP (CGNAT);
    // junk tokens are also dropped the first time FCM rejects them.
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    await enforceRateLimit(`device-register:${ip}`, 60, 600);
  }
  const input = deviceSchema.parse(await readJson(req));
  await registerDevice(user?.id ?? null, input);
  return jsonOk({ registered: true, guest: !user });
});

/** DELETE /api/v1/devices — forget this phone's token (called on sign-out). */
export const DELETE = handle(async (req) => {
  const user = await requireApiUser(req);
  const { token } = z.object({ token: z.string().trim().min(10).max(4096) }).parse(await readJson(req));
  await unregisterDevice(user.id, token);
  return jsonOk({ registered: false });
});
