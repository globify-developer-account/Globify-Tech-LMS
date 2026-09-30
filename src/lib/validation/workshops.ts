import { z } from "zod";
import { email, phone } from "./common";
import { isSaturdayKey, WORKSHOP_ATTENDANCE, WORKSHOP_LEVELS, WORKSHOP_OCCUPATIONS, WORKSHOP_REFERRERS, WORKSHOP_TRACKS, type WorkshopOption } from "@/lib/workshops";

const choice = (list: readonly WorkshopOption[], message: string) => z.enum(list.map((o) => o.value) as [string, ...string[]], { message });

/** Public enrollment for the Saturday Workshop. */
export const workshopEnrollmentSchema = z.object({
  date: z.string().refine(isSaturdayKey, "Pick one of the upcoming Saturdays"),
  name: z.string().trim().min(2, "Enter your full name").max(80),
  email,
  phone,
  city: z.string().trim().max(80).optional().or(z.literal("")),
  occupation: choice(WORKSHOP_OCCUPATIONS, "Tell us what you do"),
  track: choice(WORKSHOP_TRACKS, "Choose what you want to learn"),
  level: choice(WORKSHOP_LEVELS, "Choose your experience level"),
  attendance: choice(WORKSHOP_ATTENDANCE, "Choose how you will join"),
  referrer: choice(WORKSHOP_REFERRERS, "Choose an option").optional().or(z.literal("")),
  message: z.string().trim().max(1000, "Keep this under 1000 characters").optional().or(z.literal("")),
  consent: z.literal(true, { message: "Please agree so we can confirm your seat" }),
  utm: z.object({ source: z.string().max(80).optional(), medium: z.string().max(80).optional(), campaign: z.string().max(120).optional() }).optional(),
  /** Honeypot — must stay empty */
  website: z.string().max(0).optional(),
});
export type WorkshopEnrollmentInput = z.infer<typeof workshopEnrollmentSchema>;
