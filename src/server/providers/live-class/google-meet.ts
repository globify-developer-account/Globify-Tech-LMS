import "server-only";
import { randomUUID } from "node:crypto";
import { env } from "@/config/env";
import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors";
import { open, seal } from "@/server/auth/secret-box";
import { setSetting } from "@/server/services/settings";
import { absoluteUrl } from "@/lib/utils";
import type { LiveClassProvider, Meeting, MeetingRequest } from "./index";

/**
 * Google Meet through Google Calendar: each live class becomes an event on the
 * connected account's calendar with a Meet link. The class's students are
 * added as guests (no Google emails — the LMS notifies them), so anyone signed
 * in to Google with their Globify email joins without knocking.
 *
 * An admin connects the hosting Google account once (Admin → Settings →
 * Integrations); its refresh token is stored encrypted in `settings`.
 */

const SETTING_KEY = "integrations.googleMeet";
/** CSRF state for the OAuth round trip (connect → Google → callback). */
export const GOOGLE_MEET_STATE_COOKIE = "gt_gmeet_state";
const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.events"];

interface StoredConnection {
  refreshToken: string;
  email: string | null;
  connectedAt: string;
}

export function googleMeetClient(): { id: string; secret: string } | null {
  const e = env();
  const id = e.GOOGLE_MEET_CLIENT_ID ?? e.AUTH_GOOGLE_ID;
  const secret = e.GOOGLE_MEET_CLIENT_SECRET ?? e.AUTH_GOOGLE_SECRET;
  return id && secret ? { id, secret } : null;
}

export const googleMeetRedirectUri = () => absoluteUrl("/api/integrations/google-meet/callback");

export function googleMeetConsentUrl(state: string): string {
  const client = googleMeetClient();
  if (!client) throw AppError.unavailable("Google OAuth isn't configured on the server.");
  const params = new URLSearchParams({
    client_id: client.id,
    redirect_uri: googleMeetRedirectUri(),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function readConnection(): Promise<StoredConnection | null> {
  const row = await prisma.setting.findUnique({ where: { key: SETTING_KEY } });
  const value = row?.value as Partial<StoredConnection> | null | undefined;
  return value?.refreshToken ? (value as StoredConnection) : null;
}

/** Which Google account hosts classes, if any (no secrets). */
export async function googleMeetConnection(): Promise<{ email: string | null; connectedAt: string } | null> {
  const c = await readConnection();
  return c ? { email: c.email, connectedAt: c.connectedAt } : null;
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; id_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!res.ok || !json.access_token) throw new Error(`Google token request failed: ${json.error ?? res.status} ${json.error_description ?? ""}`.trim());
  return json;
}

/** OAuth callback: swap the code for a refresh token and store it. */
export async function completeGoogleMeetConnection(code: string, adminUserId: string) {
  const client = googleMeetClient();
  if (!client) throw AppError.unavailable("Google OAuth isn't configured on the server.");
  const tokens = await tokenRequest({ code, client_id: client.id, client_secret: client.secret, redirect_uri: googleMeetRedirectUri(), grant_type: "authorization_code" });
  if (!tokens.refresh_token) throw AppError.validation("Google didn't return offline access. Remove Globify from your Google account's third-party access, then connect again.");
  // The id_token came straight from Google over TLS, so its payload can be read without re-verifying.
  const claims = tokens.id_token ? (JSON.parse(Buffer.from(tokens.id_token.split(".")[1] ?? "", "base64url").toString("utf8")) as { email?: string }) : {};
  const value: StoredConnection = { refreshToken: seal(tokens.refresh_token), email: claims.email ?? null, connectedAt: new Date().toISOString() };
  await setSetting(SETTING_KEY, value, adminUserId, "integrations");
  cachedToken = null;
  return { email: value.email };
}

export async function disconnectGoogleMeet() {
  const c = await readConnection();
  const refresh = c ? open(c.refreshToken) : null;
  if (refresh) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refresh)}`, { method: "POST" }).catch(() => undefined);
  await prisma.setting.deleteMany({ where: { key: SETTING_KEY } });
  cachedToken = null;
}

let cachedToken: { value: string; expiresAt: number } | null = null;
async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const client = googleMeetClient();
  const c = await readConnection();
  const refresh = c ? open(c.refreshToken) : null;
  if (!client || !refresh) throw AppError.validation("Google Meet isn't connected. An admin can connect it in Settings → Integrations, or paste a meeting link instead.");
  const tokens = await tokenRequest({ refresh_token: refresh, client_id: client.id, client_secret: client.secret, grant_type: "refresh_token" });
  cachedToken = { value: tokens.access_token!, expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000 };
  return cachedToken.value;
}

interface CalendarEvent {
  id: string;
  hangoutLink?: string;
  conferenceData?: { conferenceId?: string; entryPoints?: { entryPointType: string; uri: string }[] };
}

const CALENDAR = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export class GoogleMeetProvider implements LiveClassProvider {
  readonly name = "GOOGLE_MEET" as const;

  async createMeeting(req: MeetingRequest): Promise<Meeting> {
    const token = await accessToken();
    const res = await fetch(`${CALENDAR}?conferenceDataVersion=1&sendUpdates=none`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: req.title,
        description: req.description ?? undefined,
        start: { dateTime: req.startsAt.toISOString() },
        end: { dateTime: req.endsAt.toISOString() },
        attendees: (req.attendeeEmails ?? []).map((email) => ({ email })),
        guestsCanSeeOtherGuests: false,
        guestsCanInviteOthers: false,
        conferenceData: { createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } },
      }),
    });
    if (!res.ok) throw new Error(`Google Calendar create failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
    let event = (await res.json()) as CalendarEvent;
    // Meet links are usually ready immediately; give a pending one a moment.
    if (!joinUrl(event)) {
      await new Promise((r) => setTimeout(r, 1500));
      const again = await fetch(`${CALENDAR}/${event.id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (again.ok) event = (await again.json()) as CalendarEvent;
    }
    return { provider: "GOOGLE_MEET", meetingId: event.id, joinUrl: joinUrl(event), passcode: null };
  }

  async cancelMeeting(eventId: string) {
    const token = await accessToken();
    await fetch(`${CALENDAR}/${encodeURIComponent(eventId)}?sendUpdates=none`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  }
}

function joinUrl(event: CalendarEvent): string | null {
  return event.hangoutLink ?? event.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri ?? null;
}
