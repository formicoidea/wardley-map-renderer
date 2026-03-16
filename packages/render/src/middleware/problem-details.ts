/**
 * RFC 7807 Problem Details — Zod schemas, typed constants, and factory helpers.
 *
 * Provides a structured, machine-readable error contract that helps both
 * human developers and LLM agents understand and recover from API errors.
 *
 * Key additions over basic RFC 7807:
 *   - `hint`: LLM-actionable suggestion for how to fix the error
 *   - Typed problem URIs via `ProblemTypes` constants
 *   - Zod schemas for response validation (useful in tests + client SDKs)
 *
 * @see https://datatracker.ietf.org/doc/html/rfc7807
 * @module middleware/problem-details
 */

import { z } from "zod";

// ── Problem type URI base ───────────────────────────────────────────

const PROBLEM_TYPE_BASE = "https://api.wardleyapi.com/problems";

/**
 * Well-known problem type URIs used by the WardleyAPI service.
 * Each URI uniquely identifies an error category, enabling LLM agents
 * to pattern-match errors and apply targeted recovery strategies.
 */
export const ProblemTypes = {
  /** Request body failed Zod schema validation (422) */
  VALIDATION_ERROR: `${PROBLEM_TYPE_BASE}/validation-error`,
  /** Missing or invalid API key (401) */
  AUTHENTICATION_ERROR: `${PROBLEM_TYPE_BASE}/authentication-error`,
  /** Rate limit exceeded (429) */
  RATE_LIMIT_EXCEEDED: `${PROBLEM_TYPE_BASE}/rate-limit-exceeded`,
  /** Requested resource not found (404) */
  NOT_FOUND: `${PROBLEM_TYPE_BASE}/not-found`,
  /** Accept header requests an unsupported media type (406) */
  NOT_ACCEPTABLE: `${PROBLEM_TYPE_BASE}/not-acceptable`,
  /** Content-Type is not application/json (415) */
  UNSUPPORTED_MEDIA_TYPE: `${PROBLEM_TYPE_BASE}/unsupported-media-type`,
  /** Request body is not valid JSON (400) */
  BAD_REQUEST: `${PROBLEM_TYPE_BASE}/bad-request`,
  /** Internal server error during rendering or processing (500) */
  INTERNAL_ERROR: `${PROBLEM_TYPE_BASE}/internal-error`,
} as const;

export type ProblemType = (typeof ProblemTypes)[keyof typeof ProblemTypes];

// ── RFC 7807 content type ───────────────────────────────────────────

export const PROBLEM_CONTENT_TYPE = "application/problem+json";

// ── ProblemDetail Zod schema ────────────────────────────────────────

/**
 * Base RFC 7807 Problem Details schema.
 *
 * All five standard fields from RFC 7807 §3.1 plus:
 *   - `hint`: LLM-actionable recovery suggestion (extension member)
 *
 * Uses `.passthrough()` to allow additional extension members
 * as permitted by RFC 7807 §3.2.
 */
export const ProblemDetailSchema = z
  .object({
    type: z
      .string()
      .url()
      .default("about:blank")
      .describe("A URI reference that identifies the problem type."),
    title: z
      .string()
      .describe("A short, human-readable summary of the problem type."),
    status: z
      .number()
      .int()
      .min(100)
      .max(599)
      .describe("The HTTP status code."),
    detail: z
      .string()
      .optional()
      .describe("A human-readable explanation specific to this occurrence."),
    instance: z
      .string()
      .optional()
      .describe("A URI reference identifying the specific occurrence."),
    hint: z
      .string()
      .optional()
      .describe(
        "LLM-actionable suggestion: what to check or fix to resolve this error."
      ),
  })
  .passthrough();

export type ProblemDetail = z.infer<typeof ProblemDetailSchema>;

// ── Validation error extension ──────────────────────────────────────

/**
 * Extended Problem Detail for validation errors.
 * Adds an `errors` array with per-field details (RFC 7807 §3.2 extension).
 */
export const ValidationProblemDetailSchema = ProblemDetailSchema.extend({
  type: z.literal(ProblemTypes.VALIDATION_ERROR),
  errors: z
    .array(
      z.object({
        path: z
          .string()
          .describe("Dotted path to the invalid field (e.g. components.0.evolution)"),
        message: z.string().describe("Human-readable validation error message"),
        code: z
          .string()
          .optional()
          .describe("Machine-readable error code from Zod"),
      })
    )
    .describe("Per-field validation errors"),
});

export type ValidationProblemDetail = z.infer<typeof ValidationProblemDetailSchema>;

// ── LLM hints for common error types ────────────────────────────────

/**
 * Pre-built hint messages keyed by problem type URI.
 * These are designed to help an LLM agent understand what went wrong
 * and how to fix it in subsequent requests.
 */
export const PROBLEM_HINTS: Record<string, string> = {
  [ProblemTypes.VALIDATION_ERROR]:
    "Fix the validation errors listed in the 'errors' array. " +
    "Each entry has a 'path' (dotted JSON path) and 'message'. " +
    "Common issues: position.evolution.scalar and position.visibility.scalar must be numbers in [0, 1]; " +
    "component type must be one of: component, user-need, pipeline, note, anchor; " +
    "relations need valid source/target component IDs.",

  [ProblemTypes.AUTHENTICATION_ERROR]:
    "Provide a valid API key via 'Authorization: Bearer <key>' header " +
    "or 'X-API-Key: <key>' header. In dev mode (no WARDLEY_API_KEY env var), " +
    "authentication is skipped.",

  [ProblemTypes.RATE_LIMIT_EXCEEDED]:
    "Wait for the number of seconds in the 'retryAfter' field before retrying. " +
    "Monitor 'X-RateLimit-Remaining' response header to stay within quota.",

  [ProblemTypes.NOT_FOUND]:
    "Check the request URL. Available endpoints: " +
    "POST /v1/render (render a map), GET /health (health check), " +
    "GET /v1/docs/openapi.json (API spec).",

  [ProblemTypes.NOT_ACCEPTABLE]:
    "Set the Accept header to 'image/png' (default) or 'image/svg+xml'. " +
    "If no Accept header is provided, PNG is returned by default.",

  [ProblemTypes.UNSUPPORTED_MEDIA_TYPE]:
    "Set the Content-Type header to 'application/json'. " +
    "The request body must be a JSON object conforming to the WardleyMap schema.",

  [ProblemTypes.BAD_REQUEST]:
    "The request body is not valid JSON. " +
    "Ensure: no trailing commas, all strings double-quoted, no comments, " +
    "and the body is a complete JSON object.",

  [ProblemTypes.INTERNAL_ERROR]:
    "This is a server-side error. If your WardleyMap JSON is valid, " +
    "try simplifying the map (fewer components or relations) and retry.",
};

// ── Factory helpers ─────────────────────────────────────────────────

/**
 * Create a ProblemDetail response object with automatic hint injection.
 * If no hint is provided, looks up the default hint by problem type URI.
 */
export function createProblemDetail(
  params: {
    type?: string;
    title: string;
    status: number;
    detail?: string;
    instance?: string;
    hint?: string;
  } & Record<string, unknown>
): ProblemDetail {
  const type = params.type ?? "about:blank";
  return {
    ...params,
    type,
    hint: params.hint ?? PROBLEM_HINTS[type],
  };
}

/**
 * Create a validation ProblemDetail from field-level errors.
 * Automatically sets the type URI, title, status, and LLM hint.
 */
export function createValidationProblem(
  errors: Array<{ path: string; message: string; code?: string }>,
  detail?: string,
  instance?: string
): ValidationProblemDetail {
  return {
    type: ProblemTypes.VALIDATION_ERROR,
    title: "Validation Error",
    status: 422,
    detail: detail ?? "The request body failed schema validation.",
    instance,
    hint: PROBLEM_HINTS[ProblemTypes.VALIDATION_ERROR],
    errors,
  };
}
