import type { Metadata } from "next";
import { requirePermission } from "@/server/auth/session";
import { getSettings, SETTING_DEFAULTS } from "@/server/services/settings";
import { prisma } from "@/server/db/prisma";
import { env } from "@/config/env";
import { isAiConfigured } from "@/server/ai/provider";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { pushProvider } from "@/server/providers/push";
import { googleMeetClient, googleMeetConnection } from "@/server/providers/live-class/google-meet";
import { disconnectGoogleMeetAction } from "@/server/actions/integrations";
import { SettingsForm, CampusManager } from "./settings-form";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

const GROUPS: Record<string, { label: string; description: string }> = {
  institute: { label: "Institute", description: "Identity used across emails, invoices and certificates." },
  attendance: { label: "Attendance", description: "Thresholds that trigger warnings and success-engine signals." },
  completion: { label: "Completion & certificates", description: "Defaults for course completion rules." },
  certificates: { label: "Certificate design", description: "Signatory and numbering." },
  finance: { label: "Finance", description: "Invoice due dates and reminder timing." },
  risk: { label: "Student success engine", description: "Inactivity windows for risk scoring." },
  gamification: { label: "Gamification", description: "Points, badges and streaks." },
  community: { label: "Community", description: "Moderation defaults." },
  seo: { label: "SEO", description: "Site-wide defaults." },
  ai: { label: "Globify AI", description: "Switch AI features on or off without a deploy." },
  features: { label: "Feature flags", description: "Turn public features on or off." },
  referrals: { label: "Referrals", description: "Refer a friend: the friend gets a one-time discount at sign-up, the referrer gets one when the friend enrols. Percentages apply to the course fee." },
};

const GOOGLE_MEET_RESULT: Record<string, { tone: "success" | "warning"; text: string }> = {
  connected: { tone: "success", text: "Google Meet is connected. New live classes set to Google Meet get a Meet link automatically." },
  cancelled: { tone: "warning", text: "Google Meet wasn't connected: the Google consent screen was closed." },
  expired: { tone: "warning", text: "That sign-in link expired. Start the connection again." },
  failed: { tone: "warning", text: "Google didn't accept the connection. Check the OAuth client and its redirect URI, then try again." },
  "not-configured": { tone: "warning", text: "Add a Google OAuth client (GOOGLE_MEET_CLIENT_ID / GOOGLE_MEET_CLIENT_SECRET, or AUTH_GOOGLE_*) to the server environment first." },
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ googleMeet?: string }> }) {
  await requirePermission("settings.manage");
  const meetResult = GOOGLE_MEET_RESULT[(await searchParams).googleMeet ?? ""];
  const [settings, campuses, meet] = await Promise.all([
    getSettings(),
    prisma.campus.findMany({ orderBy: { name: "asc" }, include: { classrooms: { orderBy: { name: "asc" } }, _count: { select: { students: true, batches: true } } } }),
    googleMeetConnection(),
  ]);
  const e = env();
  const integrations = [
    { name: "Database", ok: true, detail: "MySQL / MariaDB via Prisma" },
    { name: "Email", ok: e.EMAIL_DRIVER !== "console", detail: e.EMAIL_DRIVER },
    { name: "WhatsApp", ok: e.WHATSAPP_DRIVER !== "console", detail: e.WHATSAPP_DRIVER },
    { name: "SMS", ok: e.SMS_DRIVER !== "console", detail: e.SMS_DRIVER },
    { name: "Storage", ok: true, detail: e.STORAGE_DRIVER },
    { name: "Payments", ok: e.PAYMENT_PROVIDERS.split(",").some((p) => p.trim() && p.trim() !== "bank_transfer"), detail: e.PAYMENT_PROVIDERS },
    { name: "Live classes", ok: e.LIVE_CLASS_DRIVER !== "manual", detail: e.LIVE_CLASS_DRIVER },
    { name: "Google Meet", ok: !!meet, detail: meet?.email ?? "not connected" },
    { name: "App push notifications", ok: !!pushProvider(), detail: pushProvider() ? "Firebase Cloud Messaging" : "FIREBASE_SERVICE_ACCOUNT not set" },
    { name: "Globify AI", ok: isAiConfigured(), detail: e.AI_PROVIDER },
    { name: "Background jobs", ok: !!e.REDIS_URL, detail: e.REDIS_URL ? "Redis + BullMQ" : "inline (no Redis)" },
  ];
  const grouped = Object.entries(GROUPS).map(([group, meta]) => ({ group, ...meta, keys: (Object.keys(SETTING_DEFAULTS) as Array<keyof typeof SETTING_DEFAULTS>).filter((k) => k.startsWith(`${group}.`)).map((k) => ({ key: k, value: settings[k], kind: typeof SETTING_DEFAULTS[k] as "string" | "number" | "boolean" })) })).filter((g) => g.keys.length);
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Settings" description="Platform configuration. Secrets and provider keys live in the server environment and are never shown here." />
      <section className="surface p-5">
        <p className="text-h4 mb-3">Integrations</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {integrations.map((i) => <div key={i.name} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"><span>{i.name}<span className="block text-caption text-fg-subtle">{i.detail}</span></span><Badge variant={i.ok ? "success" : "default"}>{i.ok ? "Configured" : "Not configured"}</Badge></div>)}
        </div>
      </section>
      <section className="surface p-5">
        <p className="text-h4">Google Meet</p>
        <p className="mt-1 text-sm text-fg-muted">Live classes set to Google Meet are created on this Google account&apos;s calendar with a Meet link. The class&apos;s students are added as guests (Google sends them no emails), so they can join without waiting to be admitted.</p>
        {meetResult ? <p className={meetResult.tone === "success" ? "mt-3 text-sm text-success" : "mt-3 text-sm text-warning"}>{meetResult.text}</p> : null}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {meet ? <span className="text-sm">Connected as <span className="font-medium">{meet.email ?? "your Google account"}</span></span> : <span className="text-sm text-fg-muted">Not connected</span>}
          <Button asChild size="sm" variant={meet ? "secondary" : "primary"}>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- OAuth redirects to Google: needs a full page load, never a prefetch */}
            <a href="/api/integrations/google-meet/connect">{meet ? "Reconnect" : "Connect Google account"}</a>
          </Button>
          {meet ? <form action={disconnectGoogleMeetAction}><Button type="submit" size="sm" variant="ghost">Disconnect</Button></form> : null}
        </div>
        {!googleMeetClient() ? <p className="mt-3 text-caption text-fg-subtle">Needs a Google OAuth client in the server environment, with the Calendar API enabled and this redirect URI allowed: /api/integrations/google-meet/callback</p> : null}
      </section>
      <SettingsForm groups={grouped} />
      <CampusManager campuses={campuses.map((c) => ({ id: c.id, code: c.code, name: c.name, city: c.city, country: c.country, address: c.address ?? "", phone: c.phone ?? "", email: c.email ?? "", timezone: c.timezone, isActive: c.isActive, students: c._count.students, batches: c._count.batches, classrooms: c.classrooms.map((r) => ({ id: r.id, name: r.name, capacity: r.capacity, floor: r.floor ?? "", equipment: r.equipment })) }))} />
    </div>
  );
}
