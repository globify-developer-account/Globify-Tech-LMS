import "server-only";
import { createSign } from "node:crypto";
import { env } from "@/config/env";
import { log } from "@/server/log";

/**
 * Push to the mobile app through Firebase Cloud Messaging (HTTP v1), signed
 * with a service account — no Firebase SDK. Configure FIREBASE_SERVICE_ACCOUNT
 * with the JSON key from Firebase console → Project settings → Service accounts.
 */

export interface PushMessage {
  title: string;
  body: string;
  /** Website path the app turns into an in-app route on tap. */
  href?: string | null;
  data?: Record<string, string>;
}

export type PushResult = "sent" | "invalid-token";

export interface PushProvider {
  readonly name: string;
  send(token: string, message: PushMessage): Promise<PushResult>;
}

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

function parseServiceAccount(raw: string): ServiceAccount | null {
  try {
    const json = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const sa = JSON.parse(json) as ServiceAccount;
    return sa.project_id && sa.client_email && sa.private_key ? sa : null;
  } catch {
    return null;
  }
}

class FcmProvider implements PushProvider {
  readonly name = "fcm";
  private token: { value: string; expiresAt: number } | null = null;
  constructor(private readonly sa: ServiceAccount) {}

  /** OAuth2 JWT-bearer grant for the FCM scope, cached until shortly before expiry. */
  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const now = Math.floor(Date.now() / 1000);
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: this.sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
    const signature = createSign("RSA-SHA256").update(unsigned).sign(this.sa.private_key, "base64url");
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
    });
    if (!res.ok) throw new Error(`FCM auth failed: ${res.status} ${await res.text()}`);
    const body = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return body.access_token;
  }

  async send(token: string, message: PushMessage): Promise<PushResult> {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${this.sa.project_id}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await this.accessToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: message.title, body: message.body },
          data: { ...(message.data ?? {}), ...(message.href ? { href: message.href } : {}) },
          // Matches the app's notification channel and the icon in its manifest.
          android: { priority: "high", notification: { channel_id: "default", icon: "notification_icon", color: "#2563FF" } },
        },
      }),
    });
    if (res.ok) return "sent";
    const text = await res.text();
    // The app was uninstalled or the token rotated: the caller forgets it.
    if (res.status === 404 || /UNREGISTERED|registration-token-not-registered|INVALID_ARGUMENT.*token/i.test(text)) return "invalid-token";
    throw new Error(`FCM send failed: ${res.status} ${text.slice(0, 300)}`);
  }
}

let provider: PushProvider | null | undefined;
/** The configured push provider, or null when push isn't set up yet. */
export function pushProvider(): PushProvider | null {
  if (provider !== undefined) return provider;
  const raw = env().FIREBASE_SERVICE_ACCOUNT;
  const sa = raw ? parseServiceAccount(raw) : null;
  if (raw && !sa) log.warn("FIREBASE_SERVICE_ACCOUNT is set but isn't a valid service-account key; push is off");
  provider = sa ? new FcmProvider(sa) : null;
  return provider;
}
