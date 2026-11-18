import type { Metadata } from "next";
import { requirePermission } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import { env } from "@/config/env";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { NotificationCentre } from "./notification-centre";
import { daysAgo, enumLabel } from "@/lib/utils";
import { pushProvider } from "@/server/providers/push";
import { deviceReach } from "@/server/services/devices";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

const NOTIFICATION_EVENTS = ["WELCOME", "EMAIL_VERIFICATION", "PASSWORD_RESET", "ENROLLMENT", "PAYMENT_RECEIVED", "PAYMENT_DUE", "CLASS_REMINDER", "ASSIGNMENT_DEADLINE", "QUIZ_AVAILABLE", "EXAM_SCHEDULED", "CERTIFICATE_ISSUED", "ATTENDANCE_WARNING", "ANNOUNCEMENT", "MESSAGE", "APPLICATION_STATUS", "LEAD_ASSIGNED", "RISK_ALERT", "BACKUP_ALERT", "SYSTEM"] as const;

export default async function NotificationsPage() {
  await requirePermission("notifications.manage");
  const [templates, recent, stats, courses, reach] = await Promise.all([
    prisma.notificationTemplate.findMany({ orderBy: [{ event: "asc" }, { channel: "asc" }] }),
    prisma.notification.findMany({ orderBy: { createdAt: "desc" }, take: 25, include: { user: { select: { name: true } } } }),
    prisma.notification.groupBy({ by: ["channel", "status"], where: { createdAt: { gte: daysAgo(30) } }, _count: { _all: true } }),
    prisma.course.findMany({ where: { deletedAt: null, status: "PUBLISHED" }, select: { id: true, title: true, slug: true }, orderBy: { title: "asc" } }),
    deviceReach(),
  ]);
  const e = env();
  const pushReady = !!pushProvider();
  const drivers = [
    { channel: "PUSH", driver: pushReady ? "fcm" : "not set up", live: pushReady, note: `${reach.total} ${reach.total === 1 ? "phone has" : "phones have"} the app` },
    { channel: "EMAIL", driver: e.EMAIL_DRIVER, live: e.EMAIL_DRIVER !== "console" },
    { channel: "WHATSAPP", driver: e.WHATSAPP_DRIVER, live: e.WHATSAPP_DRIVER !== "console" },
    { channel: "SMS", driver: e.SMS_DRIVER, live: e.SMS_DRIVER !== "console" },
    { channel: "IN_APP", driver: "database", live: true },
  ];
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Notifications" description="Templates, delivery channels and a broadcast tool. Placeholders like {{name}} are filled per recipient." />
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {drivers.map((d) => {
          const sent = stats.filter((s) => s.channel === d.channel && s.status !== "FAILED").reduce((s, x) => s + x._count._all, 0);
          const failed = stats.filter((s) => s.channel === d.channel && s.status === "FAILED").reduce((s, x) => s + x._count._all, 0);
          return (
            <div key={d.channel} className="surface p-4">
              <div className="flex items-center justify-between"><p className="text-sm font-medium">{enumLabel(d.channel)}</p><Badge variant={d.live ? "success" : "default"}>{d.driver}</Badge></div>
              <p className="text-h3 tabular-nums">{sent}</p>
              <p className="text-caption text-fg-muted">sent in 30 days{failed ? ` · ${failed} failed` : ""}</p>
              {d.note ? <p className="text-caption text-fg-subtle">{d.note}</p> : null}
            </div>
          );
        })}
      </section>
      <NotificationCentre
        events={[...NOTIFICATION_EVENTS]}
        courses={courses}
        appReach={{ ...reach, pushReady }}
        templates={templates.map((t) => ({ id: t.id, event: t.event, channel: t.channel, locale: t.locale, subject: t.subject ?? "", body: t.body, isActive: t.isActive }))}
        recent={recent.map((n) => ({ id: n.id, event: n.event, channel: n.channel, title: n.title, status: n.status, user: n.user.name, createdAt: n.createdAt.toISOString(), error: n.error }))}
      />
    </div>
  );
}
