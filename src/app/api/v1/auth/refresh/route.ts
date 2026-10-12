import { handle, jsonOk } from "@/lib/api/respond";
import { requireApiUser } from "@/server/api/principal";
import { issueMobileToken } from "@/server/api/mobile-token";
import { enforceRateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/auth/refresh — exchange a still-valid bearer token for a fresh
 * one (the app calls this when a token nears its 30-day expiry). A token that
 * was invalidated by "sign out everywhere" cannot be refreshed.
 */
export const POST = handle(async (req) => {
  const user = await requireApiUser(req);
  await enforceRateLimit(`refresh:${user.id}`, 20, 3600);
  return jsonOk(await issueMobileToken(user.id));
});
