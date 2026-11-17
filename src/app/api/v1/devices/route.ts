import { z } from "zod";
import { handle, jsonOk, readJson } from "@/lib/api/respond";
import { requireApiUser } from "@/server/api/principal";
import { registerDevice, unregisterDevice } from "@/server/services/devices";

export const dynamic = "force-dynamic";

const deviceSchema = z.object({
  token: z.string().trim().min(10).max(4096),
  platform: z.enum(["android", "ios"]).transform((p) => (p === "ios" ? ("IOS" as const) : ("ANDROID" as const))),
  appVersion: z.string().trim().max(40).optional(),
});

/** POST /api/v1/devices — register this phone's push token for the signed-in user. */
export const POST = handle(async (req) => {
  const user = await requireApiUser(req);
  const input = deviceSchema.parse(await readJson(req));
  await registerDevice(user.id, input);
  return jsonOk({ registered: true });
});

/** DELETE /api/v1/devices — forget this phone's token (called on sign-out). */
export const DELETE = handle(async (req) => {
  const user = await requireApiUser(req);
  const { token } = z.object({ token: z.string().trim().min(10).max(4096) }).parse(await readJson(req));
  await unregisterDevice(user.id, token);
  return jsonOk({ registered: false });
});
