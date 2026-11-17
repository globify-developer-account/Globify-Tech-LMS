import "server-only";
import type { DevicePlatform } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { pushProvider, type PushMessage } from "@/server/providers/push";

/** Called by the app after sign-in; a token that moves accounts follows the new user. */
export async function registerDevice(userId: string, input: { token: string; platform: DevicePlatform; appVersion?: string | null }) {
  return prisma.deviceToken.upsert({
    where: { token: input.token },
    update: { userId, platform: input.platform, appVersion: input.appVersion ?? null, lastSeenAt: new Date() },
    create: { userId, token: input.token, platform: input.platform, appVersion: input.appVersion ?? null },
  });
}

/** Called by the app on sign-out so the phone stops receiving this user's pushes. */
export async function unregisterDevice(userId: string, token: string) {
  await prisma.deviceToken.deleteMany({ where: { userId, token } });
}

/** True when push is configured and the user has the app on at least one phone. */
export async function canPush(userId: string): Promise<boolean> {
  if (!pushProvider()) return false;
  return (await prisma.deviceToken.count({ where: { userId } })) > 0;
}

/** Pushes to every phone the user has the app on, forgetting tokens FCM rejects. Returns phones reached. */
export async function pushToUser(userId: string, message: PushMessage): Promise<number> {
  const push = pushProvider();
  if (!push) throw new Error("Push notifications aren't configured");
  const devices = await prisma.deviceToken.findMany({ where: { userId }, select: { id: true, token: true } });
  let reached = 0;
  for (const device of devices) {
    if ((await push.send(device.token, message)) === "sent") reached++;
    else await prisma.deviceToken.delete({ where: { id: device.id } }).catch(() => undefined);
  }
  return reached;
}
