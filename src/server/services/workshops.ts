import "server-only";
import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors";
import { log } from "@/server/log";
import { capturePublicLead } from "@/server/services/crm";
import { emailLayout, emailProvider } from "@/server/providers/email";
import type { WorkshopEnrollmentInput } from "@/lib/validation/workshops";
import { WORKSHOP, WORKSHOP_ATTENDANCE, WORKSHOP_LEVELS, WORKSHOP_OCCUPATIONS, WORKSHOP_REFERRERS, WORKSHOP_TRACKS, formatWorkshopDate, optionLabel, upcomingSaturdays, workshopEnd, workshopSlug, workshopStart, workshopTimeRange, workshopTitle } from "@/lib/workshops";
import { absoluteUrl } from "@/lib/utils";
import { site } from "@/config/site";

export type WorkshopSessionStatus = "OPEN" | "FULL" | "PENDING" | "CANCELLED" | "CLOSED";

export interface WorkshopSession {
  /** YYYY-MM-DD in Pakistan time */
  date: string;
  slug: string;
  title: string;
  /** True when the team renamed the week's event, i.e. the title carries a topic. */
  hasTopic: boolean;
  startsAt: string;
  endsAt: string;
  capacity: number | null;
  registered: number;
  seatsLeft: number | null;
  status: WorkshopSessionStatus;
}

const DEFAULT_DESCRIPTION = `<p>A free, hands-on two-hour workshop at the Globify Tech campus. Build something real with an instructor, meet current students and find out which course fits you.</p><p>Bring a laptop if you have one. Arrive 15 minutes early; seats are limited.</p>`;

/** The upcoming Saturdays the form offers, merged with any event the team already created for them. */
export async function getWorkshopSessions(now: Date = new Date()): Promise<WorkshopSession[]> {
  const dates = upcomingSaturdays(WORKSHOP.sessionsOffered, now);
  const events = await prisma.event.findMany({ where: { slug: { in: dates.map(workshopSlug) } }, include: { _count: { select: { registrations: true } } } });
  const bySlug = new Map(events.map((e) => [e.slug, e]));
  return dates.map((date) => {
    const slug = workshopSlug(date);
    const defaultTitle = workshopTitle(date);
    const e = bySlug.get(slug);
    if (!e) {
      return { date, slug, title: defaultTitle, hasTopic: false, startsAt: workshopStart(date).toISOString(), endsAt: workshopEnd(date).toISOString(), capacity: WORKSHOP.defaultCapacity, registered: 0, seatsLeft: WORKSHOP.defaultCapacity, status: "OPEN" };
    }
    const registered = e._count.registrations;
    const seatsLeft = e.capacity != null ? Math.max(0, e.capacity - registered) : null;
    const status: WorkshopSessionStatus =
      e.status === "CANCELLED" ? "CANCELLED" : e.status === "DRAFT" ? "PENDING" : e.status === "COMPLETED" ? "CLOSED" : seatsLeft === 0 ? "FULL" : "OPEN";
    return { date, slug, title: e.title, hasTopic: e.title !== defaultTitle, startsAt: e.startsAt.toISOString(), endsAt: (e.endsAt ?? workshopEnd(date)).toISOString(), capacity: e.capacity, registered, seatsLeft, status };
  });
}

/** Find or create the event row for a Saturday. Created rows are published straight away. */
export async function ensureWorkshopEvent(date: string) {
  const slug = workshopSlug(date);
  return prisma.event.upsert({
    where: { slug },
    update: {},
    create: { slug, title: workshopTitle(date), description: DEFAULT_DESCRIPTION, startsAt: workshopStart(date), endsAt: workshopEnd(date), location: site.contact.address, isOnline: false, capacity: WORKSHOP.defaultCapacity, status: "PUBLISHED" },
    include: { _count: { select: { registrations: true } } },
  });
}

export interface WorkshopEnrollmentResult {
  date: string;
  slug: string;
  title: string;
  startsAt: string;
  endsAt: string;
  email: string;
  attendance: string;
  /** The same email was already on the list for this Saturday; details were refreshed. */
  alreadyRegistered: boolean;
}

/**
 * Reserve a seat for one Saturday. The seat is an `EventRegistration`; the
 * person also becomes (or updates) a CRM lead so admissions can follow up.
 */
export async function enrollInWorkshop(input: WorkshopEnrollmentInput, meta: { userId?: string | null; ip?: string | null }): Promise<WorkshopEnrollmentResult> {
  if (!upcomingSaturdays().includes(input.date)) {
    throw AppError.validation("Pick one of the upcoming Saturdays.", { date: ["Pick one of the upcoming Saturdays"] });
  }
  const event = await ensureWorkshopEvent(input.date);
  if (event.status !== "PUBLISHED") throw AppError.conflict("Enrollment for that Saturday isn’t open. Please pick another date.");

  const email = input.email.toLowerCase();
  const existing = await prisma.eventRegistration.findUnique({ where: { eventId_email: { eventId: event.id, email } }, select: { id: true } });
  if (!existing && event.capacity != null && event._count.registrations >= event.capacity) {
    throw AppError.conflict("That Saturday is full. Please pick another date.");
  }
  if (existing) {
    await prisma.eventRegistration.update({ where: { id: existing.id }, data: { name: input.name, phone: input.phone, userId: meta.userId ?? undefined } });
  } else {
    await prisma.eventRegistration.create({ data: { eventId: event.id, name: input.name, email, phone: input.phone, userId: meta.userId ?? null } });
  }

  await recordLead(input, event, { alreadyRegistered: !!existing, ip: meta.ip });
  await sendConfirmation({ to: email, name: input.name, date: input.date, title: event.title, online: input.attendance === "ONLINE" }).catch((error) => log.warn("workshop.confirmation_email_failed", { email, error: String(error) }));

  return { date: input.date, slug: event.slug, title: event.title, startsAt: event.startsAt.toISOString(), endsAt: (event.endsAt ?? workshopEnd(input.date)).toISOString(), email, attendance: input.attendance, alreadyRegistered: !!existing };
}

/** Best effort: a failed CRM write must not lose the seat that was just reserved. */
async function recordLead(input: WorkshopEnrollmentInput, event: { id: string; slug: string; title: string }, meta: { alreadyRegistered: boolean; ip?: string | null }) {
  try {
    const topic = optionLabel(WORKSHOP_TRACKS, input.track);
    const { lead } = await capturePublicLead(
      {
        name: input.name,
        phone: input.phone,
        email: input.email,
        city: input.city || "",
        courseId: null,
        interest: `Saturday Workshop · ${topic}`,
        message: input.message || "",
        preferredMode: input.attendance === "ONLINE" ? "LIVE_ONLINE" : "ON_CAMPUS",
        source: "EVENT",
        utm: input.utm,
      },
      { ip: meta.ip },
    );
    const workshop = {
      date: input.date,
      eventId: event.id,
      slug: event.slug,
      title: event.title,
      occupation: optionLabel(WORKSHOP_OCCUPATIONS, input.occupation),
      track: topic,
      level: optionLabel(WORKSHOP_LEVELS, input.level),
      attendance: optionLabel(WORKSHOP_ATTENDANCE, input.attendance),
      referrer: input.referrer ? optionLabel(WORKSHOP_REFERRERS, input.referrer) : null,
      alreadyRegistered: meta.alreadyRegistered,
    };
    const previous = lead.metadata && typeof lead.metadata === "object" && !Array.isArray(lead.metadata) ? (lead.metadata as Record<string, unknown>) : {};
    await prisma.$transaction([
      prisma.leadActivity.create({ data: { leadId: lead.id, type: "SYSTEM", summary: `Enrolled in the Saturday Workshop on ${formatWorkshopDate(input.date, { weekday: undefined, year: undefined })}`, details: workshop as never } }),
      prisma.lead.update({ where: { id: lead.id }, data: { metadata: { ...previous, workshop } as never } }),
    ]);
  } catch (error) {
    log.warn("workshop.lead_capture_failed", { email: input.email, error: String(error) });
  }
}

async function sendConfirmation(input: { to: string; name: string; date: string; title: string; online: boolean }) {
  const when = `${formatWorkshopDate(input.date)}, ${workshopTimeRange()}`;
  const where = input.online ? "You chose to join online: we’ll send the live link on WhatsApp before we start." : `Venue: ${site.contact.address}. Arrive 15 minutes early and bring a laptop if you have one.`;
  await emailProvider().send({
    to: input.to,
    subject: `Your seat is reserved: ${input.title}`,
    html: emailLayout({
      title: `See you on Saturday, ${input.name.split(" ")[0]}.`,
      body: `<p>Your seat for <strong>${input.title}</strong> is reserved.</p><p><strong>When:</strong> ${when}</p><p>${where}</p><p>Can’t make it? Reply to this email or WhatsApp us at ${site.contact.whatsapp} so someone else can take the seat.</p>`,
      cta: { label: "Workshop details", href: absoluteUrl("/workshop") },
    }),
    text: `Your seat for ${input.title} is reserved.\nWhen: ${when}\n${where}\n${absoluteUrl("/workshop")}`,
  });
}
