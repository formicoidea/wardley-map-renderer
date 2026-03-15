/**
 * RFC 7807 Problem Details for HTTP APIs
 * @see https://datatracker.ietf.org/doc/html/rfc7807
 *
 * Provides Zod schemas and TypeScript types for standardized
 * error responses across the WardleyAPI service.
 */

import { z } from "zod";

/**
 * Base RFC 7807 Problem Details schema.
 *
 * All five standard fields from RFC 7807 §3.1:
 * - type:     A URI reference identifying the problem type (default "about:blank")
 * - title:    A short, human-readable summary of the problem type
 * - status:   The HTTP status code
 * - detail:   A human-readable explanation specific to this occurrence
 * - instance: A URI reference identifying the specific occurrence
 *
 * The schema also allows additional extension members via passthrough(),
 * as permitted by RFC 7807 §3.2.
 */
export const ProblemDetailSchema = z
  .object({
    type: z
      .string()
      .url()
      .default("about:blank")
      .describe(
        "A URI reference [RFC3986] that identifies the problem type."
      ),
    title: z
      .string()
      .describe(
        "A short, human-readable summary of the problem type."
      ),
    status: z
      .number()
      .int()
      .min(100)
      .max(599)
      .describe("The HTTP status code."),
    detail: z
      .string()
      .optional()
      .describe(
        "A human-readable explanation specific to this occurrence of the problem."
      ),
    instance: z
      .string()
      .optional()
      .describe(
        "A URI reference that identifies the specific occurrence of the problem."
      ),
  })
  .passthrough();

/** TypeScript type inferred from the ProblemDetail Zod schema */
export type ProblemDetail = z.infer<typeof ProblemDetailSchema>;

// ── Pre-defined problem types for WardleyAPI ──────────────────────────

const PROBLEM_TYPE_BASE = "https://api.wardleyapi.com/problems";

/**
 * Well-known problem type URIs used by the WardleyAPI service.
 * Extensible — new types can be added without breaking existing consumers.
 */
export const ProblemTypes = {
  /** Request body failed Zod schema validation */
  VALIDATION_ERROR: `${PROBLEM_TYPE_BASE}/validation-error`,
  /** Missing or invalid Bearer token */
  AUTHENTICATION_ERROR: `${PROBLEM_TYPE_BASE}/authentication-error`,
  /** Rate limit exceeded */
  RATE_LIMIT_EXCEEDED: `${PROBLEM_TYPE_BASE}/rate-limit-exceeded`,
  /** Requested resource not found */
  NOT_FOUND: `${PROBLEM_TYPE_BASE}/not-found`,
  /** Accept header requests an unsupported media type */
  NOT_ACCEPTABLE: `${PROBLEM_TYPE_BASE}/not-acceptable`,
  /** Internal server error during rendering or processing */
  INTERNAL_ERROR: `${PROBLEM_TYPE_BASE}/internal-error`,
} as const;

export type ProblemType = (typeof ProblemTypes)[keyof typeof ProblemTypes];

// ── Validation error extension ────────────────────────────────────────

/**
 * Extended Problem Detail for validation errors.
 * Adds a `errors` array with per-field details, following the
 * "extension members" pattern from RFC 7807 §3.2.
 */
export const ValidationProblemDetailSchema = ProblemDetailSchema.extend({
  type: z.literal(ProblemTypes.VALIDATION_ERROR),
  errors: z
    .array(
      z.object({
        field: z.string().describe("JSON Pointer or dotted path to the invalid field"),
        message: z.string().describe("Human-readable validation error message"),
        code: z.string().optional().describe("Machine-readable error code from Zod"),
      })
    )
    .describe("Per-field validation errors"),
});

export type ValidationProblemDetail = z.infer<
  typeof ValidationProblemDetailSchema
>;

// ── Factory helpers ───────────────────────────────────────────────────

/**
 * Create a ProblemDetail response object.
 * Merges required fields with optional extension members.
 */
export function createProblemDetail(
  params: {
    type?: string;
    title: string;
    status: number;
    detail?: string;
    instance?: string;
  } & Record<string, unknown>
): ProblemDetail {
  return {
    type: params.type ?? "about:blank",
    ...params,
  };
}

/**
 * Create a validation ProblemDetail from Zod errors.
 */
export function createValidationProblem(
  errors: Array<{ field: string; message: string; code?: string }>,
  detail?: string,
  instance?: string
): ValidationProblemDetail {
  return {
    type: ProblemTypes.VALIDATION_ERROR,
    title: "Validation Error",
    status: 422,
    detail: detail ?? "The request body failed schema validation.",
    instance,
    errors,
  };
}

/** RFC 7807 content type */
export const PROBLEM_CONTENT_TYPE = "application/problem+json";
