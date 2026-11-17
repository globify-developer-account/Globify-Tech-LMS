"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/server/auth/session";
import { disconnectGoogleMeet } from "@/server/providers/live-class/google-meet";
import { audit } from "@/server/audit";

/** Admin → Settings: stop creating Meet links with the connected Google account. */
export async function disconnectGoogleMeetAction(): Promise<void> {
  const user = await requirePermission("settings.manage");
  await disconnectGoogleMeet();
  await audit({ actorId: user.id, actorRoles: user.roles, action: "integration.google_meet.disconnect", entityType: "Setting", entityId: "integrations.googleMeet" });
  revalidatePath("/admin/settings");
}
