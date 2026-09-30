/**
 * The Saturday Workshop: a free, recurring session held every Saturday.
 *
 * Pure helpers shared by the public enrollment form, the server and the tests.
 * Each Saturday maps to one `Event` row with a deterministic slug
 * (`saturday-workshop-YYYY-MM-DD`), so the team can edit the topic, capacity
 * or status of any week from Admin › Events.
 */
export const WORKSHOP = {
  /** 0 = Sunday … 6 = Saturday */
  weekday: 6,
  /** Wall-clock start and end in Pakistan time (24h). */
  startTime: "11:00",
  endTime: "13:00",
  /** Pakistan has no daylight saving, so a fixed offset is safe. */
  utcOffset: "+05:00",
  timeZone: "Asia/Karachi",
  slugPrefix: "saturday-workshop-",
  defaultCapacity: 30,
  /** How many upcoming Saturdays the form offers. */
  sessionsOffered: 4,
} as const;

const OFFSET_MS = 5 * 3600_000;
const DAY_MS = 86_400_000;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** YYYY-MM-DD from the UTC fields of a date (callers pass a Karachi-shifted instant). */
function dateKeyOf(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** True for a real calendar date in YYYY-MM-DD form that falls on a Saturday. */
export function isSaturdayKey(key: unknown): key is string {
  if (typeof key !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const d = new Date(`${key}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && dateKeyOf(d) === key && d.getUTCDay() === WORKSHOP.weekday;
}

export function workshopStart(key: string): Date {
  return new Date(`${key}T${WORKSHOP.startTime}:00${WORKSHOP.utcOffset}`);
}

export function workshopEnd(key: string): Date {
  return new Date(`${key}T${WORKSHOP.endTime}:00${WORKSHOP.utcOffset}`);
}

export function workshopSlug(key: string): string {
  return `${WORKSHOP.slugPrefix}${key}`;
}

/**
 * The next `count` Saturdays, as YYYY-MM-DD in Pakistan time, whose workshop
 * has not started yet. Today's Saturday is included until the workshop begins.
 */
export function upcomingSaturdays(count: number = WORKSHOP.sessionsOffered, now: Date = new Date()): string[] {
  const local = new Date(now.getTime() + OFFSET_MS);
  const todayStart = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const daysAhead = (WORKSHOP.weekday - local.getUTCDay() + 7) % 7;
  let cursor = todayStart + daysAhead * DAY_MS;
  if (workshopStart(dateKeyOf(new Date(cursor))).getTime() <= now.getTime()) cursor += 7 * DAY_MS;
  const keys: string[] = [];
  for (let i = 0; i < count; i++) keys.push(dateKeyOf(new Date(cursor + i * 7 * DAY_MS)));
  return keys;
}

/** "Saturday, 4 October 2026" in Pakistan time, whatever the server or browser timezone. */
export function formatWorkshopDate(key: string, opts?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: WORKSHOP.timeZone, ...opts }).format(workshopStart(key));
}

/** "11:00 AM – 1:00 PM" */
export function workshopTimeRange(): string {
  const fmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: WORKSHOP.timeZone });
  const anySaturday = "2026-10-03";
  return `${fmt.format(workshopStart(anySaturday))} – ${fmt.format(workshopEnd(anySaturday))}`;
}

/** Default event title; the team can rename a week's event to show its topic. */
export function workshopTitle(key: string): string {
  return `Saturday Workshop · ${formatWorkshopDate(key, { weekday: undefined })}`;
}

/** Google Calendar "add event" link; no account integration needed. */
export function calendarLink(input: { title: string; start: Date; end: Date; location: string; details?: string }): string {
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const p = new URLSearchParams({ action: "TEMPLATE", text: input.title, dates: `${stamp(input.start)}/${stamp(input.end)}`, location: input.location, details: input.details ?? "" });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

// ───────────── Form options ─────────────

export interface WorkshopOption {
  value: string;
  label: string;
  description?: string;
}

export const WORKSHOP_TRACKS: readonly WorkshopOption[] = [
  { value: "AI", label: "AI & automation" },
  { value: "MARKETING", label: "Digital marketing" },
  { value: "DEVELOPMENT", label: "Web & app development" },
  { value: "DESIGN", label: "Graphic & UI design" },
  { value: "ECOMMERCE", label: "E-commerce" },
  { value: "FREELANCING", label: "Freelancing" },
  { value: "VIDEO", label: "Video editing" },
  { value: "UNDECIDED", label: "Not sure yet — help me choose" },
];

export const WORKSHOP_OCCUPATIONS: readonly WorkshopOption[] = [
  { value: "STUDENT", label: "Student" },
  { value: "GRADUATE", label: "Recent graduate" },
  { value: "PROFESSIONAL", label: "Working professional" },
  { value: "FREELANCER", label: "Freelancer" },
  { value: "BUSINESS", label: "Business owner" },
  { value: "OTHER", label: "Other" },
];

export const WORKSHOP_LEVELS: readonly WorkshopOption[] = [
  { value: "BEGINNER", label: "Complete beginner", description: "Never tried this before" },
  { value: "SOME", label: "Some experience", description: "Tutorials or a short course" },
  { value: "EXPERIENCED", label: "Experienced", description: "Worked on real projects" },
];

export const WORKSHOP_ATTENDANCE: readonly WorkshopOption[] = [
  { value: "ON_CAMPUS", label: "On campus", description: "Kohinoor Plaza, Jaranwala Road, Faisalabad" },
  { value: "ONLINE", label: "Join online", description: "Live link sent on WhatsApp before we start" },
];

export const WORKSHOP_REFERRERS: readonly WorkshopOption[] = [
  { value: "FACEBOOK", label: "Facebook" },
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "TIKTOK", label: "TikTok" },
  { value: "GOOGLE", label: "Google search" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "FRIEND", label: "A friend or family member" },
  { value: "OTHER", label: "Somewhere else" },
];

export function optionLabel(list: readonly WorkshopOption[], value: string | null | undefined): string {
  return list.find((o) => o.value === value)?.label ?? value ?? "";
}
