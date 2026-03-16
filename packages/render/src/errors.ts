/**
 * Typed error factory functions and RFC 7807 mapper.
 *
 * Provides concrete error subclasses for each known error category
 * (validation, auth, rate-limit, not-found, internal, not-acceptable,
 * method-not-allowed) plus convenience factory functions and a
 * standalone toProblemDetails mapper.
 *
 * All error classes extend HttpProblem from the error-handler middleware,
 * so they are automatically handled by the global onError hook.
 *
 * @see https://www.rfc-editor.org/rfc/rfc7807
 * @module errors
 */

import { HttpProblem, type ProblemDetail } from "./middleware/error-handler.js";

export { HttpProblem, type ProblemDetail };

const TYPE_PREFIX = "https://wardleyapi.dev/problems";

// ── Concrete error classes ──────────────────────────────────

export class ValidationError extends HttpProblem {
  constructor(detail: string, errors?: Array<{ path: string; message: string }>) {
    super(422, "Validation Error", {
      type: `${TYPE_PREFIX}/validation-error`,
      detail,
      errors,
    });
    this.name = "ValidationError";
  }
}

export class AuthenticationError extends HttpProblem {
  constructor(detail = "Missing or invalid API key") {
    super(401, "Authentication Required", {
      type: `${TYPE_PREFIX}/authentication-error`,
      detail,
    });
    this.name = "AuthenticationError";
  }
}

export class RateLimitError extends HttpProblem {
  public readonly retryAfter: number;

  constructor(opts: { detail?: string; retryAfter: number }) {
    super(429, "Rate Limit Exceeded", {
      type: `${TYPE_PREFIX}/rate-limit-exceeded`,
      detail: opts.detail ?? "Too many requests. Please retry later.",
    });
    this.name = "RateLimitError";
    this.retryAfter = opts.retryAfter;
  }

  override toProblemDetail(): ProblemDetail & { retryAfter: number } {
    return { ...super.toProblemDetail(), retryAfter: this.retryAfter };
  }
}

export class NotFoundError extends HttpProblem {
  constructor(detail = "The requested resource was not found") {
    super(404, "Not Found", {
      type: `${TYPE_PREFIX}/not-found`,
      detail,
    });
    this.name = "NotFoundError";
  }
}

export class InternalError extends HttpProblem {
  constructor(detail = "An unexpected error occurred") {
    super(500, "Internal Server Error", {
      type: `${TYPE_PREFIX}/internal-error`,
      detail,
    });
    this.name = "InternalError";
  }
}

export class NotAcceptableError extends HttpProblem {
  constructor(detail = "The requested media type is not supported") {
    super(406, "Not Acceptable", {
      type: `${TYPE_PREFIX}/not-acceptable`,
      detail,
    });
    this.name = "NotAcceptableError";
  }
}

export class MethodNotAllowedError extends HttpProblem {
  constructor(detail = "HTTP method not allowed for this endpoint") {
    super(405, "Method Not Allowed", {
      type: `${TYPE_PREFIX}/method-not-allowed`,
      detail,
    });
    this.name = "MethodNotAllowedError";
  }
}

// ── Factory functions ───────────────────────────────────────

export function validationError(detail: string, errors?: Array<{ path: string; message: string }>) {
  return new ValidationError(detail, errors);
}

export function authenticationError(detail?: string) {
  return new AuthenticationError(detail);
}

export function rateLimitError(retryAfter: number, detail?: string) {
  return new RateLimitError({ retryAfter, detail });
}

export function notFoundError(detail?: string) {
  return new NotFoundError(detail);
}

export function internalError(detail?: string) {
  return new InternalError(detail);
}

export function notAcceptableError(detail?: string) {
  return new NotAcceptableError(detail);
}

export function methodNotAllowedError(detail?: string) {
  return new MethodNotAllowedError(detail);
}

// ── Standalone error-to-RFC7807 mapper ──────────────────────

/**
 * Converts any error into an RFC 7807 ProblemDetail object.
 *
 * - HttpProblem instances (including our typed subclasses) → toProblemDetail()
 * - Unknown errors → 500 Internal Server Error
 */
export function toProblemDetails(err: unknown, instance?: string): ProblemDetail {
  if (err instanceof HttpProblem) {
    const pd = err.toProblemDetail();
    if (instance) pd.instance = instance;
    return pd;
  }

  const detail =
    err instanceof Error ? err.message : "An unexpected error occurred";

  const problem: ProblemDetail = {
    type: `${TYPE_PREFIX}/internal-error`,
    title: "Internal Server Error",
    status: 500,
    detail,
  };
  if (instance) problem.instance = instance;
  return problem;
}
