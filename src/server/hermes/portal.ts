import "server-only";
import { AppError } from "@/server/errors";
import { log } from "@/server/log";

/**
 * Client for Hermes's student-portal API (hermes.globifytech.com). Tasks for
 * students are created and tracked in Hermes; students see and answer them
 * here, in the LMS, and never use Hermes themselves.
 *
 * The LMS authenticates the student with its own session, then calls Hermes
 * server to server with HERMES_PORTAL_KEY, naming that student. The key and
 * Hermes's address live only in the server environment. With either unset,
 * the Tasks page says tasks are not available instead of failing.
 */

export interface HermesTaskSummary {
  assignmentId: string;
  title: string;
  type: string;
  typeLabel: string;
  dueAt: string;
  status: string;
  late: boolean;
  submittedAt: string | null;
  needsFiles: boolean;
}

export interface HermesTask {
  assignmentId: string;
  title: string;
  instructions: string;
  type: string;
  typeLabel: string;
  dueAt: string;
  status: string;
  late: boolean;
  open: boolean;
  files: { kinds: Array<"image" | "video" | "document">; maxFiles: number; maxSizeMb: Record<string, number> } | null;
  responsePrompt: string | null;
  consent: { version: string; statements: string[] } | null;
  submission: {
    submittedAt: string;
    status: string;
    response: string | null;
    files: Array<{ fileName: string; kind: string; mime: string; size: number; approved?: boolean }>;
    /** The reviewer's decision and their words to the student (Hermes never sends internal notes). */
    review?: { decision: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED"; feedback: string | null; decidedAt: string } | null;
  } | null;
  /** For tasks that asked for consent: whether it stands, and whether the student can still withdraw it. */
  permission?: { state: "GIVEN" | "WITHDRAWN" | "NONE"; since: string | null; canWithdraw: boolean } | null;
}

/** Brief §53 "My Contributions": approved content and where Globify published it. */
export interface HermesContribution {
  task: string;
  approvedAt: string;
  published: Array<{ platform: "FACEBOOK" | "INSTAGRAM" | "LINKEDIN" | string; url: string | null; publishedAt: string }>;
}

export function portalConfigured(): boolean {
  return Boolean(process.env.HERMES_PORTAL_URL && process.env.HERMES_PORTAL_KEY);
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const base = process.env.HERMES_PORTAL_URL;
  const key = process.env.HERMES_PORTAL_KEY;
  if (!base || !key) throw AppError.unavailable("Tasks are not available right now.");
  const url = `${base.replace(/\/+$/, "")}/api/portal/v1${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      cache: "no-store",
      redirect: "manual",
    });
  } catch {
    throw AppError.unavailable("Tasks are not available right now. Please try again in a few minutes.");
  } finally {
    clearTimeout(timer);
  }
  const json = (await res.json().catch(() => null)) as { success?: boolean; data?: T; error?: { code?: string; message?: string } } | null;
  if (res.ok && json?.success) return json.data as T;
  const code = json?.error?.code;
  const message = json?.error?.message ?? "Something went wrong.";
  if (code === "NOT_FOUND") throw AppError.notFound("Task");
  // Hermes's own validation messages are written for the student ("Please tick both consent statements…").
  if (code === "VALIDATION_ERROR" || code === "CONSENT_REQUIRED") throw AppError.validation(message);
  if (code === "CONFLICT" || code === "IDEMPOTENCY_CONFLICT") throw AppError.conflict(message);
  log.warn("hermes portal call failed", { path, status: res.status, code });
  throw AppError.unavailable("Tasks are not available right now. Please try again in a few minutes.");
}

export const hermesPortal = {
  tasks: (studentId: string) => call<{ items: HermesTaskSummary[] }>("GET", `/students/${studentId}/tasks`).then((d) => d.items),
  task: (studentId: string, assignmentId: string) => call<HermesTask>("GET", `/students/${studentId}/tasks/${assignmentId}`),
  open: (studentId: string, assignmentId: string) => call<{ opened: boolean }>("POST", `/students/${studentId}/tasks/${assignmentId}/open`, {}),
  submit: (studentId: string, assignmentId: string, body: unknown) => call<{ submissionId: string; status: string; replayed: boolean }>("POST", `/students/${studentId}/tasks/${assignmentId}/submissions`, body),
  contributions: (studentId: string) => call<{ items: HermesContribution[] }>("GET", `/students/${studentId}/contributions`).then((d) => d.items),
  withdrawConsent: (studentId: string, assignmentId: string, reason: string | null) =>
    call<{ withdrawn: number }>("POST", `/students/${studentId}/tasks/${assignmentId}/consent/withdraw`, { reason }),
};
