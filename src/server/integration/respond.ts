import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { fieldErrors } from "@/lib/validation/common";
import { log } from "@/server/log";
import { STATUS_BY_CODE, toAppError, type ErrorCode } from "@/server/errors";

/**
 * Response envelope for /api/integration/v1. Hermes defines this contract
 * (Hermes docs/HERMES_INTEGRATION_CONTRACT.md §2.5), so these routes answer in
 * its shape and vocabulary rather than the LMS's own { data } / { error }.
 */
const HERMES_CODE: Record<ErrorCode, string> = {
  UNAUTHENTICATED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION: "VALIDATION_ERROR",
  RATE_LIMITED: "RATE_LIMITED",
  CONFLICT: "CONFLICT",
  UNAVAILABLE: "INTEGRATION_NOT_CONFIGURED",
  INTERNAL: "INTERNAL_ERROR",
};
const RETRYABLE = new Set<ErrorCode>(["RATE_LIMITED", "INTERNAL"]);

export interface Pagination {
  page: number;
  limit: number;
  total: number;
}

export interface IntegrationResult {
  data: unknown;
  pagination?: Pagination;
}

interface Ids {
  requestId: string;
  correlationId: string;
}

const ID_PATTERN = /^[A-Za-z0-9._:-]{8,100}$/;
const pickId = (value: string | null) => (value && ID_PATTERN.test(value) ? value : randomUUID());

function send(status: number, body: object, ids: Ids) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", "X-Request-ID": ids.requestId } });
}

/**
 * Wraps an integration route: request/correlation ids, the envelope, error
 * mapping without leaking internals, and one structured log line per call.
 */
export function integrationRoute<Ctx>(fn: (req: Request, ctx: Ctx) => Promise<IntegrationResult>) {
  return async (req: Request, ctx: Ctx) => {
    const started = performance.now();
    const ids: Ids = { requestId: pickId(req.headers.get("x-request-id")), correlationId: pickId(req.headers.get("x-correlation-id")) };
    const path = new URL(req.url).pathname;
    const actorId = req.headers.get("x-hermes-actor-id") ?? undefined;
    let status = 200;
    try {
      const result = await fn(req, ctx);
      return send(200, { success: true, data: result.data, meta: { ...ids, ...(result.pagination ? { pagination: result.pagination } : {}) }, error: null }, ids);
    } catch (error) {
      const validation = error instanceof ZodError;
      const appError = validation ? null : toAppError(error);
      const code: ErrorCode = validation ? "VALIDATION" : appError!.code;
      status = STATUS_BY_CODE[code];
      if (code === "INTERNAL") log.error("integration route failed", { path, ...ids, err: (error as Error)?.message });
      return send(
        status,
        {
          success: false,
          data: null,
          meta: ids,
          error: {
            code: HERMES_CODE[code],
            message: validation ? "The request parameters are invalid." : appError!.message,
            retryable: RETRYABLE.has(code),
            ...(validation ? { fields: fieldErrors(error) } : {}),
          },
        },
        ids,
      );
    } finally {
      log.info("integration call", { method: req.method, path, status, actorId, ...ids, ms: Math.round(performance.now() - started) });
    }
  };
}
