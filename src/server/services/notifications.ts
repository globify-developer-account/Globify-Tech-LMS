import "server-only";
import type { NotificationChannel, NotificationEvent } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { enqueue } from "@/server/jobs";
import { emailLayout, emailProvider } from "@/server/providers/email";
import { whatsappProvider, normalizePhone } from "@/server/providers/whatsapp";
import { smsProvider } from "@/server/providers/sms";
import { canPush, pushToUser } from "@/server/services/devices";
import { log } from "@/server/log";
import { absoluteUrl } from "@/lib/utils";

export interface NotifyInput {
  userId: string;
  event: NotificationEvent;
  /** Placeholder values for templates: {{name}}, {{course}} … */
  data: Record<string, string | number>;
  href?: string;
  channels?: NotificationChannel[];
  /** Fallback copy when no template exists for a channel. */
  fallback?: { title: string; body: string };
}

/**
 * Default channel routing per event (admins can override via templates).
 * PUSH reaches the mobile app and is skipped for people without it.
 */
const DEFAULT_CHANNELS: Partial<Record<NotificationEvent, NotificationChannel[]>> = {
  WELCOME: ["IN_APP", "EMAIL"],
  EMAIL_VERIFICATION: ["EMAIL"],
  PASSWORD_RESET: ["EMAIL"],
  ENROLLMENT: ["IN_APP", "EMAIL", "WHATSAPP", "PUSH"],
  PAYMENT_RECEIVED: ["IN_APP", "EMAIL", "WHATSAPP", "PUSH"],
  PAYMENT_DUE: ["IN_APP", "EMAIL", "WHATSAPP", "PUSH"],
  CLASS_REMINDER: ["IN_APP", "WHATSAPP", "PUSH"],
  ASSIGNMENT_DEADLINE: ["IN_APP", "EMAIL", "PUSH"],
  QUIZ_AVAILABLE: ["IN_APP", "PUSH"],
  EXAM_SCHEDULED: ["IN_APP", "EMAIL", "PUSH"],
  CERTIFICATE_ISSUED: ["IN_APP", "EMAIL", "WHATSAPP", "PUSH"],
  ATTENDANCE_WARNING: ["IN_APP", "EMAIL", "WHATSAPP", "PUSH"],
  ANNOUNCEMENT: ["IN_APP", "PUSH"],
  MESSAGE: ["IN_APP", "PUSH"],
  APPLICATION_STATUS: ["IN_APP", "EMAIL", "WHATSAPP", "PUSH"],
  LEAD_ASSIGNED: ["IN_APP"],
  REFERRAL: ["IN_APP", "PUSH"],
  RISK_ALERT: ["IN_APP", "EMAIL"],
  BACKUP_ALERT: ["IN_APP", "EMAIL"],
  SYSTEM: ["IN_APP"],
};

export function renderTemplate(template: string, data: Record<string, string | number>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => String(data[key] ?? ""));
}

/**
 * Creates notification rows per channel and dispatches them in the background.
 * In-app rows are marked SENT immediately; email/WhatsApp/SMS go through jobs.
 */
export async function notify(input: NotifyInput): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { id: true, name: true, email: true, whatsapp: true, phone: true, locale: true } });
  if (!user) return;
  const channels = input.channels ?? DEFAULT_CHANNELS[input.event] ?? ["IN_APP"];
  const data = { name: user.name, firstName: user.name.split(" ")[0] ?? user.name, ...input.data };

  const templates = await prisma.notificationTemplate.findMany({ where: { event: input.event, channel: { in: channels }, isActive: true, locale: { in: [user.locale, "en"] } } });

  for (const channel of channels) {
    if (channel === "PUSH" && !(await canPush(user.id))) continue;
    const template = templates.find((t) => t.channel === channel && t.locale === user.locale) ?? templates.find((t) => t.channel === channel);
    const title = template?.subject ? renderTemplate(template.subject, data) : (input.fallback?.title ?? input.event.replaceAll("_", " "));
    const body = template ? renderTemplate(template.body, data) : (input.fallback?.body ?? "");
    if (!template && !input.fallback) continue;

    const row = await prisma.notification.create({
      data: {
        userId: user.id,
        event: input.event,
        channel,
        title,
        body,
        href: input.href ?? null,
        data: input.data,
        status: channel === "IN_APP" ? "SENT" : "QUEUED",
        sentAt: channel === "IN_APP" ? new Date() : null,
      },
    });
    if (channel !== "IN_APP") await enqueue("notification.dispatch", { notificationId: row.id });
  }
}

/** Job processor: deliver a queued notification through its channel provider. */
export async function dispatchNotification(notificationId: string): Promise<void> {
  const n = await prisma.notification.findUnique({ where: { id: notificationId }, include: { user: { select: { email: true, whatsapp: true, phone: true, name: true } } } });
  if (!n || n.status !== "QUEUED") return;
  try {
    if (n.channel === "EMAIL") {
      await emailProvider().send({
        to: n.user.email,
        subject: n.title,
        html: emailLayout({ title: n.title, body: n.body.replace(/\n/g, "<br/>"), cta: n.href ? { label: "Open Globify", href: absoluteUrl(n.href) } : undefined }),
        text: `${n.body}${n.href ? `\n\n${absoluteUrl(n.href)}` : ""}`,
      });
    } else if (n.channel === "WHATSAPP") {
      const to = n.user.whatsapp ?? n.user.phone;
      if (!to) throw new Error("No WhatsApp number");
      await whatsappProvider().send({ to: normalizePhone(to), text: `${n.title}\n\n${n.body}${n.href ? `\n${absoluteUrl(n.href)}` : ""}` });
    } else if (n.channel === "SMS") {
      const to = n.user.phone ?? n.user.whatsapp;
      if (!to) throw new Error("No phone number");
      await smsProvider().send(normalizePhone(to), `${n.title}: ${n.body}`.slice(0, 320));
    } else if (n.channel === "PUSH") {
      const reached = await pushToUser(n.userId, { title: n.title, body: n.body, href: n.href, data: { notificationId: n.id } });
      if (!reached) throw new Error("No reachable devices");
    }
    await prisma.notification.update({ where: { id: n.id }, data: { status: "SENT", sentAt: new Date() } });
  } catch (error) {
    log.warn("notification failed", { id: n.id, channel: n.channel, error: (error as Error).message });
    await prisma.notification.update({ where: { id: n.id }, data: { status: "FAILED", error: (error as Error).message.slice(0, 500) } });
  }
}

export async function markRead(userId: string, ids?: string[]) {
  await prisma.notification.updateMany({
    where: { userId, channel: "IN_APP", readAt: null, ...(ids ? { id: { in: ids } } : {}) },
    data: { readAt: new Date(), status: "READ" },
  });
}

export async function unreadCount(userId: string) {
  return prisma.notification.count({ where: { userId, channel: "IN_APP", readAt: null } });
}

export async function listInApp(userId: string, take = 30) {
  return prisma.notification.findMany({ where: { userId, channel: "IN_APP" }, orderBy: { createdAt: "desc" }, take });
}

/** Notify everyone with a given permission-bearing role (e.g. finance managers). */
export async function notifyRole(roleKeys: string[], input: Omit<NotifyInput, "userId">) {
  const users = await prisma.user.findMany({ where: { status: "ACTIVE", roles: { some: { role: { key: { in: roleKeys as never } } } } }, select: { id: true } });
  await Promise.all(users.map((u) => notify({ ...input, userId: u.id })));
}
