import { describe, expect, it } from "vitest";
import { calendarLink, formatWorkshopDate, isSaturdayKey, upcomingSaturdays, workshopEnd, workshopSlug, workshopStart, workshopTimeRange, workshopTitle } from "@/lib/workshops";
import { workshopEnrollmentSchema } from "@/lib/validation/workshops";

describe("Saturday workshop dates", () => {
  it("recognises only real Saturdays in YYYY-MM-DD form", () => {
    expect(isSaturdayKey("2026-10-03")).toBe(true);
    expect(isSaturdayKey("2026-10-04")).toBe(false); // Sunday
    expect(isSaturdayKey("2026-02-30")).toBe(false); // not a date
    expect(isSaturdayKey("03-10-2026")).toBe(false);
    expect(isSaturdayKey(undefined)).toBe(false);
  });

  it("starts at 11:00 Pakistan time and lasts two hours", () => {
    expect(workshopStart("2026-10-03").toISOString()).toBe("2026-10-03T06:00:00.000Z");
    expect(workshopEnd("2026-10-03").toISOString()).toBe("2026-10-03T08:00:00.000Z");
    expect(workshopTimeRange()).toBe("11:00 AM – 1:00 PM");
  });

  it("lists the next four Saturdays from a weekday", () => {
    // Thursday 1 October 2026, 10:00 PKT
    expect(upcomingSaturdays(4, new Date("2026-10-01T05:00:00Z"))).toEqual(["2026-10-03", "2026-10-10", "2026-10-17", "2026-10-24"]);
  });

  it("keeps today's Saturday until the workshop starts, then moves on", () => {
    // Saturday 3 October 2026, 10:59 PKT
    expect(upcomingSaturdays(2, new Date("2026-10-03T05:59:00Z"))).toEqual(["2026-10-03", "2026-10-10"]);
    // Saturday 3 October 2026, 11:00 PKT
    expect(upcomingSaturdays(2, new Date("2026-10-03T06:00:00Z"))).toEqual(["2026-10-10", "2026-10-17"]);
  });

  it("uses the Pakistan calendar day, not UTC", () => {
    // Friday 2 October 2026 23:30 UTC is already Saturday 04:30 in Karachi.
    expect(upcomingSaturdays(1, new Date("2026-10-02T23:30:00Z"))).toEqual(["2026-10-03"]);
  });

  it("names the event and its slug from the date", () => {
    expect(workshopSlug("2026-10-03")).toBe("saturday-workshop-2026-10-03");
    expect(workshopTitle("2026-10-03")).toBe("Saturday Workshop · 3 October 2026");
    expect(formatWorkshopDate("2026-10-03")).toBe("Saturday, 3 October 2026");
  });

  it("builds a Google Calendar link with UTC stamps", () => {
    const href = calendarLink({ title: "Saturday Workshop", start: workshopStart("2026-10-03"), end: workshopEnd("2026-10-03"), location: "Faisalabad" });
    expect(href).toContain("dates=20261003T060000Z%2F20261003T080000Z");
    expect(href).toContain("text=Saturday+Workshop");
  });
});

describe("workshop enrollment form", () => {
  const valid = {
    date: "2026-10-03",
    name: "Ayesha Khan",
    email: "Ayesha@Example.com",
    phone: "0300 1234567",
    city: "Faisalabad",
    occupation: "STUDENT",
    track: "AI",
    level: "BEGINNER",
    attendance: "ON_CAMPUS",
    referrer: "",
    message: "",
    consent: true,
    website: "",
  };

  it("accepts a complete enrollment and normalises the email", () => {
    const parsed = workshopEnrollmentSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.email).toBe("ayesha@example.com");
  });

  it("only allows Saturdays", () => {
    expect(workshopEnrollmentSchema.safeParse({ ...valid, date: "2026-10-05" }).success).toBe(false);
    expect(workshopEnrollmentSchema.safeParse({ ...valid, date: "" }).success).toBe(false);
  });

  it("requires name, WhatsApp number, email and consent", () => {
    expect(workshopEnrollmentSchema.safeParse({ ...valid, name: "A" }).success).toBe(false);
    expect(workshopEnrollmentSchema.safeParse({ ...valid, phone: "" }).success).toBe(false);
    expect(workshopEnrollmentSchema.safeParse({ ...valid, email: "nope" }).success).toBe(false);
    expect(workshopEnrollmentSchema.safeParse({ ...valid, consent: false }).success).toBe(false);
  });

  it("rejects unknown choices but lets the referrer stay blank", () => {
    expect(workshopEnrollmentSchema.safeParse({ ...valid, track: "COOKING" }).success).toBe(false);
    expect(workshopEnrollmentSchema.safeParse({ ...valid, occupation: "" }).success).toBe(false);
    expect(workshopEnrollmentSchema.safeParse({ ...valid, referrer: "FRIEND" }).success).toBe(true);
  });

  it("keeps the honeypot empty", () => {
    expect(workshopEnrollmentSchema.safeParse({ ...valid, website: "http://spam.example" }).success).toBe(false);
  });
});
