import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Hermes integration API gate: service key → acting user → LMS
 * permission, plus the response envelope. Prisma and the rate limiter are
 * stubbed; the queries themselves are exercised against a real database by
 * Hermes's live contract suite.
 */
const findUnique = vi.fn();
vi.mock("@/server/db/prisma", () => ({ prisma: { user: { findUnique: (...a: unknown[]) => findUnique(...a) } } }));
vi.mock("@/server/rate-limit", () => ({ enforceRateLimit: vi.fn(async () => ({ allowed: true })) }));

const { authenticateService, configuredKeyHashes, requireIntegration, serviceKeyMatches } = await import("@/server/integration/auth");
const { integrationRoute } = await import("@/server/integration/respond");
const { phoneKey } = await import("@/server/integration/queries");
const { AppError } = await import("@/server/errors");

const KEY = "hrm_live_0123456789abcdef0123456789abcdef";
const OTHER_KEY = "hrm_live_fedcba9876543210fedcba9876543210";
const sha = (k: string) => createHash("sha256").update(k).digest("hex");
const ACTOR = "3f1d7c52-2b1a-4c8e-9a51-6c1f0d2e4b7a";

function req(headers: Record<string, string> = {}, url = "https://lms.test/api/integration/v1/students") {
  return new Request(url, { headers });
}

function user(roles: string[], extra: Record<string, unknown> = {}) {
  return { id: ACTOR, name: "Staff", email: "staff@lms.test", status: "ACTIVE", deletedAt: null, roles: roles.map((key) => ({ role: { key }, campusId: null })), ...extra };
}

beforeEach(() => {
  findUnique.mockReset();
  process.env.HERMES_INTEGRATION_KEY_HASHES = `${sha(OTHER_KEY)}, ${sha(KEY).toUpperCase()}`;
});

describe("service key", () => {
  it("parses a comma-separated list and ignores malformed entries", () => {
    expect(configuredKeyHashes(`${sha(KEY)},not-a-hash,, ${sha(OTHER_KEY)} `)).toHaveLength(2);
    expect(configuredKeyHashes("")).toHaveLength(0);
  });

  it("accepts any configured key, so keys rotate with an overlap", () => {
    const hashes = configuredKeyHashes();
    expect(serviceKeyMatches(`Bearer ${KEY}`, hashes)).toBe(true);
    expect(serviceKeyMatches(`Bearer ${OTHER_KEY}`, hashes)).toBe(true);
  });

  it("rejects wrong, short, missing and non-bearer credentials", () => {
    const hashes = configuredKeyHashes();
    expect(serviceKeyMatches(`Bearer ${KEY}x`, hashes)).toBe(false);
    expect(serviceKeyMatches("Bearer short", hashes)).toBe(false);
    expect(serviceKeyMatches(null, hashes)).toBe(false);
    expect(serviceKeyMatches(`Basic ${KEY}`, hashes)).toBe(false);
  });

  it("is switched off entirely until a hash is configured", async () => {
    delete process.env.HERMES_INTEGRATION_KEY_HASHES;
    await expect(authenticateService(req({ authorization: `Bearer ${KEY}` }))).rejects.toMatchObject({ code: "UNAVAILABLE" });
  });

  it("refuses a bad key as unauthenticated", async () => {
    await expect(authenticateService(req({ authorization: "Bearer hrm_live_wrongwrongwrongwrongwrongwrong00" }))).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});

describe("acting user", () => {
  const auth = { authorization: `Bearer ${KEY}` };

  it("requires the actor header and a uuid in it", async () => {
    await expect(requireIntegration(req(auth), ["students.read"])).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(requireIntegration(req({ ...auth, "x-hermes-actor-id": "admin" }), ["students.read"])).rejects.toMatchObject({ code: "VALIDATION" });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("refuses unknown, suspended and deleted users", async () => {
    for (const row of [null, user(["ADMIN"], { status: "SUSPENDED" }), user(["ADMIN"], { deletedAt: new Date() })]) {
      findUnique.mockResolvedValueOnce(row);
      await expect(requireIntegration(req({ ...auth, "x-hermes-actor-id": ACTOR }), ["students.read"])).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });

  it("enforces the LMS permission of the acting user, not of Hermes", async () => {
    findUnique.mockResolvedValue(user(["MARKETING_MANAGER"]));
    await expect(requireIntegration(req({ ...auth, "x-hermes-actor-id": ACTOR }), ["students.read"])).rejects.toMatchObject({ code: "FORBIDDEN" });
    findUnique.mockResolvedValue(user(["STUDENT"]));
    await expect(requireIntegration(req({ ...auth, "x-hermes-actor-id": ACTOR }), ["students.read"])).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns the actor when every permission is held", async () => {
    findUnique.mockResolvedValue(user(["ADMISSIONS_MANAGER"]));
    const actor = await requireIntegration(req({ ...auth, "x-hermes-actor-id": ACTOR, "x-hermes-actor-type": "workflow" }), ["students.read", "applications.read"]);
    expect(actor).toMatchObject({ id: ACTOR, roles: ["ADMISSIONS_MANAGER"], actorType: "workflow" });
  });

  it("checks the service key before touching the database", async () => {
    await expect(requireIntegration(req({ "x-hermes-actor-id": ACTOR }), ["students.read"])).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(findUnique).not.toHaveBeenCalled();
  });
});

describe("envelope", () => {
  it("wraps data with request and correlation ids", async () => {
    const route = integrationRoute(async () => ({ data: [{ id: 1 }], pagination: { page: 1, limit: 25, total: 1 } }));
    const res = await route(req({ "x-request-id": "req-12345678", "x-correlation-id": "corr-12345678" }), {});
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      success: true,
      data: [{ id: 1 }],
      meta: { requestId: "req-12345678", correlationId: "corr-12345678", pagination: { page: 1, limit: 25, total: 1 } },
      error: null,
    });
  });

  it("maps LMS errors to the Hermes vocabulary", async () => {
    const cases: Array<[InstanceType<typeof AppError>, number, string]> = [
      [AppError.unauthenticated(), 401, "UNAUTHORIZED"],
      [AppError.forbidden(), 403, "FORBIDDEN"],
      [AppError.notFound("Student"), 404, "NOT_FOUND"],
      [AppError.validation(), 422, "VALIDATION_ERROR"],
      [AppError.unavailable(), 501, "INTEGRATION_NOT_CONFIGURED"],
    ];
    for (const [error, status, code] of cases) {
      const res = await integrationRoute(async () => { throw error; })(req(), {});
      const body = await res.json();
      expect(res.status).toBe(status);
      expect(body).toMatchObject({ success: false, data: null, error: { code, retryable: false } });
    }
  });

  it("never leaks an internal error message", async () => {
    const res = await integrationRoute(async () => { throw new Error("relation users does not exist at 10.0.0.4"); })(req(), {});
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toMatchObject({ code: "INTERNAL_ERROR", retryable: true });
    expect(JSON.stringify(body)).not.toContain("10.0.0.4");
  });

  it("ignores caller ids that are not plain tokens", async () => {
    const res = await integrationRoute(async () => ({ data: null }))(req({ "x-request-id": "<script>" }), {});
    expect((await res.json()).meta.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("phone matching", () => {
  it("matches local and international forms on the last ten digits", () => {
    expect(phoneKey("+92 300 1234567")).toBe("3001234567");
    expect(phoneKey("03001234567")).toBe("3001234567");
    expect(phoneKey("923001234567")).toBe("3001234567");
    expect(phoneKey("12345")).toBeNull();
  });
});
