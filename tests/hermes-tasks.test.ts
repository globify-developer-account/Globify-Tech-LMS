import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Student tasks from Hermes (hermes.globifytech.com): the two integration
 * routes' logic, private file links, the write switch, the Hermes portal
 * client and the student's submit action. Prisma, the session and fetch are
 * stubbed; nothing touches a database or the network.
 */

const db = {
  studentProfile: { findFirst: vi.fn(), findUniqueOrThrow: vi.fn() },
  notification: { findFirst: vi.fn(), create: vi.fn() },
  media: { findFirst: vi.fn(), findMany: vi.fn() },
};
vi.mock("@/server/db/prisma", () => ({ prisma: db }));
vi.mock("@/server/services/settings", () => ({ getSetting: vi.fn() }));
const session = { requireStudentProfile: vi.fn() };
vi.mock("@/server/auth/session", () => session);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { notifyStudentFromHermes, studentMediaReadUrl } = await import("@/server/integration/queries");
const { writesEnabled, requireWritesEnabled } = await import("@/server/integration/auth");
const { LocalStorageProvider } = await import("@/server/providers/storage");
const { hermesPortal } = await import("@/server/hermes/portal");
const { submitHermesTaskAction } = await import("@/server/actions/hermes-tasks");

const STUDENT = "30000000-0000-4000-8000-000000000001";
const USER = "31000000-0000-4000-8000-000000000001";
const MEDIA = "50000000-0000-4000-8000-000000000001";
const body = { title: "New task: Workshop photos", body: "Upload a photo from today's class.", href: "/student/tasks/4a6f1c2e-0000-4000-8000-000000000001" };

const codeOf = (p: Promise<unknown>) => p.then(() => "resolved", (e: { code?: string }) => e?.code ?? String(e));

beforeEach(() => {
  for (const group of Object.values(db)) for (const fn of Object.values(group)) fn.mockReset();
  session.requireStudentProfile.mockReset();
  db.studentProfile.findFirst.mockResolvedValue({ id: STUDENT });
  db.studentProfile.findUniqueOrThrow.mockResolvedValue({ userId: USER });
});

describe("notifications from Hermes", () => {
  it("creates one in-app row per idempotency key, in Hermes's own words", async () => {
    db.notification.findFirst.mockResolvedValueOnce(null);
    db.notification.create.mockResolvedValueOnce({ id: "n-1" });
    const first = await notifyStudentFromHermes(STUDENT, "task:a1:LMS:assigned", body, null, "actor-1");
    expect(first.data).toEqual({ notificationId: "n-1", channel: "IN_APP", status: "SENT", replayed: false });
    expect(db.notification.create.mock.calls[0]![0].data).toMatchObject({ userId: USER, channel: "IN_APP", status: "SENT", title: body.title, body: body.body, href: body.href, data: { hermesKey: "task:a1:LMS:assigned", source: "hermes" } });

    db.notification.findFirst.mockResolvedValueOnce({ id: "n-1" });
    const again = await notifyStudentFromHermes(STUDENT, "task:a1:LMS:assigned", body, null, "actor-1");
    expect(again.data).toMatchObject({ notificationId: "n-1", replayed: true });
    expect(db.notification.create).toHaveBeenCalledTimes(1);
  });

  it("refuses a missing key, an outside link, an unknown student, or a student the instructor does not teach", async () => {
    expect(await codeOf(notifyStudentFromHermes(STUDENT, null, body, null, "a"))).toBe("VALIDATION");
    expect(await codeOf(notifyStudentFromHermes(STUDENT, "task:a1:LMS:assigned", { ...body, href: "https://evil.example/x" }, null, "a"))).toMatch(/invalid|VALIDATION/i);
    db.studentProfile.findFirst.mockResolvedValueOnce(null);
    expect(await codeOf(notifyStudentFromHermes(STUDENT, "task:a1:LMS:assigned", body, null, "a"))).toBe("NOT_FOUND");
    db.studentProfile.findFirst.mockResolvedValueOnce({ id: STUDENT }).mockResolvedValueOnce(null);
    expect(await codeOf(notifyStudentFromHermes(STUDENT, "task:a1:LMS:assigned", body, { batchIds: [], courseIds: [] }, "a"))).toBe("FORBIDDEN");
    expect(db.notification.create).not.toHaveBeenCalled();
  });

  it("stay off until HERMES_INTEGRATION_WRITE_ENABLED=true", () => {
    delete process.env.HERMES_INTEGRATION_WRITE_ENABLED;
    expect(writesEnabled()).toBe(false);
    expect(() => requireWritesEnabled()).toThrow(/switched off/);
    process.env.HERMES_INTEGRATION_WRITE_ENABLED = "true";
    expect(writesEnabled()).toBe(true);
    delete process.env.HERMES_INTEGRATION_WRITE_ENABLED;
  });
});

describe("links to students' task uploads", () => {
  const sign = vi.fn(async (key: string) => `https://files.test/${key}?sig=x`);
  const media = { id: MEDIA, key: "student-content/2026/a.jpg", mime: "image/jpeg", size: 1000, fileName: "a.jpg", isPublic: false, uploadedById: USER };

  it("gives a 10-minute link to a private student-content file", async () => {
    db.media.findFirst.mockResolvedValueOnce(media);
    const r = await studentMediaReadUrl(MEDIA, null, sign);
    expect(r.data).toMatchObject({ mediaId: MEDIA, url: "https://files.test/student-content/2026/a.jpg?sig=x", mime: "image/jpeg" });
    expect(sign).toHaveBeenCalledWith("student-content/2026/a.jpg", 600);
  });

  it("never for public files, files outside student-content/, or from students the instructor does not teach", async () => {
    db.media.findFirst.mockResolvedValueOnce({ ...media, isPublic: true });
    expect(await codeOf(studentMediaReadUrl(MEDIA, null, sign))).toBe("NOT_FOUND");
    db.media.findFirst.mockResolvedValueOnce({ ...media, key: "uploads/2026/a.jpg" });
    expect(await codeOf(studentMediaReadUrl(MEDIA, null, sign))).toBe("NOT_FOUND");
    db.media.findFirst.mockResolvedValueOnce(media);
    db.studentProfile.findFirst.mockResolvedValueOnce(null);
    expect(await codeOf(studentMediaReadUrl(MEDIA, { batchIds: [], courseIds: [] }, sign))).toBe("FORBIDDEN");
  });

  it("makes S3/R2 upload links a browser can use: no checksum of an empty body", async () => {
    const { s3Client } = await import("@/server/providers/storage");
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const client = s3Client({ region: "auto", endpoint: "https://account.r2.cloudflarestorage.com", accessKeyId: "TESTKEY", secretAccessKey: "TESTSECRET" });
    const url = new URL(await getSignedUrl(client, new PutObjectCommand({ Bucket: "b", Key: "student-content/a.jpg", ContentType: "image/jpeg", ContentLength: 10 }), { expiresIn: 900 }));
    expect([...url.searchParams.keys()].filter((k) => k.toLowerCase().includes("checksum"))).toEqual([]);
    expect(url.pathname).toBe("/b/student-content/a.jpg");
  });

  it("signs local read links separately from uploads, and lets them expire", async () => {
    const link = await new LocalStorageProvider().getSignedReadUrl("student-content/2026/a.jpg", 60);
    const u = new URL(link);
    expect(LocalStorageProvider.verifyRead("student-content/2026/a.jpg", u.searchParams.get("expires"), u.searchParams.get("rsig"))).toBe(true);
    expect(LocalStorageProvider.verifyRead("student-content/2026/b.jpg", u.searchParams.get("expires"), u.searchParams.get("rsig"))).toBe(false);
    // A read signature is not an upload signature.
    expect(LocalStorageProvider.verify("student-content/2026/a.jpg", u.searchParams.get("expires"), u.searchParams.get("rsig"))).toBe(false);
    expect(LocalStorageProvider.verifyRead("student-content/2026/a.jpg", String(Date.now() - 1), u.searchParams.get("rsig"))).toBe(false);
  });
});

describe("the Hermes portal client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.HERMES_PORTAL_URL;
    delete process.env.HERMES_PORTAL_KEY;
  });
  const respond = (status: number, json: unknown) => vi.fn(async () => new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } }));

  it("is unavailable, not broken, until configured", async () => {
    expect(await codeOf(hermesPortal.tasks(STUDENT))).toBe("UNAVAILABLE");
  });

  it("sends the portal key and the student, and passes Hermes's messages for the student through", async () => {
    process.env.HERMES_PORTAL_URL = "https://hermes.test/";
    process.env.HERMES_PORTAL_KEY = "hrm_portal_" + "k".repeat(40);
    const ok = respond(200, { success: true, data: { items: [] } });
    vi.stubGlobal("fetch", ok);
    expect(await hermesPortal.tasks(STUDENT)).toEqual([]);
    const [url, init] = ok.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe(`https://hermes.test/api/portal/v1/students/${STUDENT}/tasks`);
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${process.env.HERMES_PORTAL_KEY}`);

    vi.stubGlobal("fetch", respond(403, { success: false, error: { code: "CONSENT_REQUIRED", message: "Please tick both consent statements before submitting." } }));
    await expect(hermesPortal.submit(STUDENT, MEDIA, {})).rejects.toMatchObject({ code: "VALIDATION", message: "Please tick both consent statements before submitting." });
    vi.stubGlobal("fetch", respond(404, { success: false, error: { code: "NOT_FOUND", message: "x" } }));
    expect(await codeOf(hermesPortal.task(STUDENT, MEDIA))).toBe("NOT_FOUND");
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("ECONNREFUSED"))));
    expect(await codeOf(hermesPortal.tasks(STUDENT))).toBe("UNAVAILABLE");
  });
});

describe("the student's submit action", () => {
  const upload = { id: MEDIA, key: "student-content/2026/a.jpg", mime: "image/jpeg", size: 1000, fileName: "a.jpg", width: null, height: null, uploadedById: USER, isPublic: false, metadata: { pending: false } };
  const input = { assignmentId: "4a6f1c2e-0000-4000-8000-000000000001", submitKey: "lms-0000000001", consentAccepted: [], consentVersion: null, mediaIds: [MEDIA] };

  beforeEach(() => {
    session.requireStudentProfile.mockResolvedValue({ user: { id: USER }, studentId: STUDENT });
  });

  it("refuses files that are not the student's own finished, private uploads", async () => {
    for (const bad of [{ uploadedById: "someone-else" }, { isPublic: true }, { key: "uploads/2026/a.jpg" }, { metadata: { pending: true } }]) {
      db.media.findMany.mockResolvedValueOnce([{ ...upload, ...bad }]);
      const r = await submitHermesTaskAction(input);
      expect(r.ok).toBe(false);
    }
  });

  it("hands the checked file references to Hermes, as this student", async () => {
    process.env.HERMES_PORTAL_URL = "https://hermes.test";
    process.env.HERMES_PORTAL_KEY = "hrm_portal_" + "k".repeat(40);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, data: { submissionId: "s-1", status: "RECEIVED", replayed: false } }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    db.media.findMany.mockResolvedValueOnce([upload]);
    const r = await submitHermesTaskAction(input);
    expect(r).toEqual({ ok: true, data: { submissionId: "s-1" } });
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toContain(`/students/${STUDENT}/tasks/${input.assignmentId}/submissions`);
    expect(JSON.parse(String(init.body))).toMatchObject({ submitKey: "lms-0000000001", files: [{ mediaId: MEDIA, key: upload.key, mime: "image/jpeg" }] });
    vi.unstubAllGlobals();
    delete process.env.HERMES_PORTAL_URL;
    delete process.env.HERMES_PORTAL_KEY;
  });
});
