/**
 * RFC 7807 Problem Details error-handling middleware for Hono.
 *
 * Catches all thrown errors (including HTTPException from Hono),
 * maps them to RFC 7807 format with LLM-actionable `hint` fields,
 * and sets Content-Type to application/problem+json.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc7807
 * @module middleware/error-handler
 */

import type { Context, ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import {
  ProblemTypes,
  PROBLEM_CONTENT_TYPE,
  PROBLEM_HINTS,
  type ProblemDetail,
} from "./problem-details.js";

// ── Re-export ProblemDetail type for backward compat ────────────────

export type { ProblemDetail } from "./problem-details.js";

// ── Custom HttpProblem error class ───────────────────────────────────

/**
 * Throwable error that carries RFC 7807 Problem Details fields.
 * When caught by the onError middleware, it is serialized as-is.
 */
export class HttpProblem extends Error {
  public readonly status: number;
  public readonly problemType: string;
  public readonly title: string;
  public readonly detail?: string;
  public readonly instance?: string;
  public readonly hint?: string;
  public readonly errors?: Array<{ path: string; message: string; code?: string }>;

  constructor(
    status: number,
    title: string,
    opts?: {
      detail?: string;
      type?: string;
      instance?: string;
      hint?: string;
      errors?: Array<{ path: string; message: string; code?: string }>;
    }
  ) {
    super(opts?.detail ?? title);
    this.name = "HttpProblem";
    this.status = status;
    this.title = title;
    this.detail = opts?.detail;
    this.problemType = opts?.type ?? "about:blank";
    this.instance = opts?.instance;
    this.hint = opts?.hint ?? PROBLEM_HINTS[this.problemType];
    this.errors = opts?.errors;
  }

  toProblemDetail(): ProblemDetail {
    const problem: ProblemDetail = {
      type: this.problemType,
      title: this.title,
      status: this.status,
    };
    if (this.detail !== undefined) problem.detail = this.detail;
    if (this.instance !== undefined) problem.instance = this.instance;
    if (this.hint !== undefined) problem.hint = this.hint;
    if (this.errors !== undefined) (problem as any).errors = this.errors;
    return problem;
  }
}

// ── Status code to default title mapping ─────────────────────────────

const STATUS_TITLES: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  406: "Not Acceptable",
  409: "Conflict",
  415: "Unsupported Media Type",
  422: "Unprocessable Entity",
  429: "Too Many Requests",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
};

function defaultTitle(status: number): string {
  return STATUS_TITLES[status] ?? (status >= 500 ? "Server Error" : "Client Error");
}

// ── Helper to build a Problem JSON response ──────────────────────────

function problemResponse(c: Context, problem: ProblemDetail): Response {
  return c.json(problem, problem.status as any, {
    "Content-Type": PROBLEM_CONTENT_TYPE,
  });
}

// ── onError handler ──────────────────────────────────────────────────

/**
 * Hono onError hook that maps all thrown errors to RFC 7807 Problem
 * Details JSON responses with LLM-actionable hints.
 *
 * Supports:
 * - HttpProblem (custom class) → serialized directly with hint
 * - Hono HTTPException → mapped to problem with status + message
 * - ZodError → mapped to 400 with validation errors array + hint
 * - Generic Error → mapped to 500 with hint
 */
export const rfc7807ErrorHandler: ErrorHandler = (err, c) => {
  // ── HttpProblem (our custom class) ──
  if (err instanceof HttpProblem) {
    if (err.status >= 500) {
      console.error(`[error] ${err.status} ${err.title}:`, err.detail ?? err.message);
    }
    // Set Retry-After header for rate limit errors (429)
    if (err.status === 429 && "retryAfter" in err) {
      c.header("Retry-After", String((err as any).retryAfter));
    }
    return problemResponse(c, err.toProblemDetail());
  }

  // ── Hono HTTPException ──
  if (err instanceof HTTPException) {
    const status = err.status;
    const problem: ProblemDetail = {
      type: "about:blank",
      title: defaultTitle(status),
      status,
    };
    if (err.message && err.message !== problem.title) {
      problem.detail = err.message;
    }
    if (status >= 500) {
      console.error(`[error] ${status} ${problem.title}:`, err.message);
    }
    return problemResponse(c, problem);
  }

  // ── ZodError (schema validation) ──
  if (err instanceof ZodError) {
    const problem: ProblemDetail = {
      type: ProblemTypes.VALIDATION_ERROR,
      title: "Bad Request",
      status: 400,
      detail: "Request validation failed",
      hint: PROBLEM_HINTS[ProblemTypes.VALIDATION_ERROR],
    };
    (problem as any).errors = err.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
      code: issue.code,
    }));
    return problemResponse(c, problem);
  }

  // ── Generic / unknown errors → 500 ──
  const message = err instanceof Error ? err.message : "An unexpected error occurred";
  console.error("[error] 500 Internal Server Error:", message);

  const problem: ProblemDetail = {
    type: ProblemTypes.INTERNAL_ERROR,
    title: "Internal Server Error",
    status: 500,
    // Don't leak internal details in production
    detail: process.env.NODE_ENV === "production" ? undefined : message,
    hint: PROBLEM_HINTS[ProblemTypes.INTERNAL_ERROR],
  };
  return problemResponse(c, problem);
};

// ── notFound handler (also RFC 7807) ─────────────────────────────────

/**
 * Hono notFound hook that returns RFC 7807 Problem Details.
 */
export function rfc7807NotFound(c: Context): Response {
  const problem: ProblemDetail = {
    type: ProblemTypes.NOT_FOUND,
    title: "Not Found",
    status: 404,
    detail: `No route for ${c.req.method} ${c.req.path}`,
    hint: PROBLEM_HINTS[ProblemTypes.NOT_FOUND],
  };
  return problemResponse(c, problem);
}
