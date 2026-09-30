"use server";

import { revalidatePath } from "next/cache";
import { ok, fail, AppError, type ActionResult } from "@/server/errors";
import { workshopEnrollmentSchema } from "@/lib/validation/workshops";
import { fieldErrors } from "@/lib/validation/common";
import { enrollInWorkshop, type WorkshopEnrollmentResult } from "@/server/services/workshops";
import { enforceRateLimit } from "@/server/rate-limit";
import { requestMeta } from "@/server/audit";
import { getSession } from "@/server/auth/session";

/** Public Saturday Workshop enrollment form. */
export async function enrollWorkshopAction(_prev: ActionResult<WorkshopEnrollmentResult> | null, formData: FormData): Promise<ActionResult<WorkshopEnrollmentResult>> {
  const parsed = workshopEnrollmentSchema.safeParse({
    date: formData.get("date") ?? "",
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    city: formData.get("city") ?? "",
    occupation: formData.get("occupation") ?? "",
    track: formData.get("track") ?? "",
    level: formData.get("level") ?? "",
    attendance: formData.get("attendance") ?? "",
    referrer: formData.get("referrer") ?? "",
    message: formData.get("message") ?? "",
    consent: formData.get("consent") === "on",
    utm: { source: formData.get("utm_source") || undefined, medium: formData.get("utm_medium") || undefined, campaign: formData.get("utm_campaign") || undefined },
    website: formData.get("website") ?? "",
  });
  if (!parsed.success) return fail(AppError.validation(undefined, fieldErrors(parsed.error)));
  const { ip } = await requestMeta();
  try {
    await enforceRateLimit(`workshop:${ip ?? "unknown"}`, 5, 600);
    const session = await getSession();
    const result = await enrollInWorkshop(parsed.data, { userId: session?.id ?? null, ip });
    revalidatePath("/workshop");
    revalidatePath("/events");
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
