import "server-only";
import type { DevicePlatform } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { pushProvider, type PushMessage, type PushProvider } from "@/server/providers/push";

/**
 * Called by the app on every launch. With a user the phone gets that user's
 * pushes; with null it is a guest (app installed, nobody signed in) and only
 * gets broadcasts to everyone with the app. A token always follows whoever is
 * signed in on the phone now, so a signed-out phone stops getting the old
 * account's pushes.
 */
export async function registerDevice(userId: string | null, input: { token: string; platform: DevicePlatform; appVersion?: string | null }) {
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

/** How many phones have the app registered for push, split by signed in and guest. */
export async function deviceReach(): Promise<{ total: number; signedIn: number; guests: number }> {
  const [total, guests] = await Promise.all([prisma.deviceToken.count(), prisma.deviceToken.count({ where: { userId: null } })]);
  return { total, signedIn: total - guests, guests };
}

export interface BroadcastPushResult {
  /** Phones the broadcast was sent to. */
  targeted: number;
  /** Phones FCM accepted the message for. */
  reached: number;
  /** Phones that no longer have the app (token rejected), now forgotten. */
  removed: number;
  /** Sends that failed for another reason (FCM outage, quota); the phones are kept. */
  failed: number;
}

const PAGE = 500;
const CONCURRENCY = 20;

/**
 * Pushes one message to every registered phone, signed in or guest. Sends 20
 * at a time, so a few thousand phones take seconds, and forgets the tokens FCM
 * rejects. Fails fast with FCM's error if the first sends all fail, which is
 * how a bad service-account key shows up. `push` defaults to the configured
 * provider; tests pass a stand-in.
 */
export async function pushToAllDevices(message: PushMessage, push: PushProvider | null = pushProvider()): Promise<BroadcastPushResult> {
  if (!push) throw new Error("Push notifications aren't configured");
  const result: BroadcastPushResult = { targeted: 0, reached: 0, removed: 0, failed: 0 };
  // Keyset paging on id: unlike a Prisma cursor it keeps working when the
  // last row of a page is deleted as a dead token.
  let after: string | undefined;
  for (;;) {
    const page = await prisma.deviceToken.findMany({ where: after ? { id: { gt: after } } : undefined, select: { id: true, token: true }, orderBy: { id: "asc" }, take: PAGE });
    if (!page.length) break;
    after = page[page.length - 1]!.id;
    result.targeted += page.length;
    const dead: string[] = [];
    for (let i = 0; i < page.length; i += CONCURRENCY) {
      const chunk = page.slice(i, i + CONCURRENCY);
      const outcomes = await Promise.allSettled(chunk.map((d) => push.send(d.token, message)));
      if (result.targeted === page.length && i === 0 && outcomes.every((o) => o.status === "rejected")) {
        throw (outcomes[0] as PromiseRejectedResult).reason;
      }
      outcomes.forEach((o, j) => {
        if (o.status === "rejected") result.failed++;
        else if (o.value === "sent") result.reached++;
        else dead.push(chunk[j]!.id);
      });
    }
    if (dead.length) result.removed += (await prisma.deviceToken.deleteMany({ where: { id: { in: dead } } })).count;
    if (page.length < PAGE) break;
  }
  return result;
}
