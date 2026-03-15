/**
 * OpenAPI route definitions for WardleyAPI v1.
 *
 * Registers the following routes in the OpenAPI registry:
 *   - POST /v1/render/svg — Render WardleyMap JSON to SVG
 *   - POST /v1/render/png — Render WardleyMap JSON to PNG
 *   - GET  /v1/health     — Health check
 *
 * Note: The actual implementation uses a single POST /v1/render endpoint
 * with Accept-header content negotiation. The OpenAPI spec documents
 * them as separate logical operations for clarity and client codegen.
 *
 * @module openapi/routes
 */

import { z } from "zod";
import { WardleyMapSchema } from "../schema.js";
import { registerRoute } from "./registry.js";

// ── Shared schemas for responses ────────────────────────────────

/** RFC 7807 Problem Details response schema */
export const ProblemDetailSchema = z.object({
  type: z.string().describe("URI reference identifying the problem type"),
  title: z.string().describe("Short human-readable summary"),
  status: z.number().int().describe("HTTP status code"),
  detail: z.string().optional().describe("Human-readable explanation"),
  instance: z.string().optional().describe("URI identifying this occurrence"),
  errors: z
    .array(
      z.object({
        path: z.string(),
        message: z.string(),
      })
    )
    .optional()
    .describe("Validation error details"),
});

/** Health check response schema */
export const HealthResponseSchema = z.object({
  name: z.string().describe("Service name"),
  version: z.string().describe("Service version (semver)"),
  status: z.enum(["ok", "degraded"]).describe("Service health status"),
});

// ── Bearer auth security requirement ────────────────────────────

const bearerAuth = [{ BearerAuth: [] }];

// ── Route registrations ─────────────────────────────────────────

/**
 * Register all v1 API routes in the OpenAPI registry.
 * Call once at application startup.
 */
export function registerV1Routes(): void {
  // ── POST /v1/render/svg ────────────────────────────────────
  registerRoute({
    method: "POST",
    path: "/v1/render/svg",
    operationId: "renderSvg",
    summary: "Render a Wardley Map as SVG",
    description:
      "Accepts a WardleyMap JSON payload and returns an SVG image. " +
      "Equivalent to POST /v1/render with Accept: image/svg+xml.",
    tags: ["render"],
    security: bearerAuth,
    request: {
      contentType: "application/json",
      schema: WardleyMapSchema,
      description: "WardleyMap JSON object to render",
    },
    responses: {
      "200": {
        description: "SVG image of the rendered Wardley Map",
        contentType: "image/svg+xml",
        // SVG response is a raw string — no Zod schema needed
      },
      "400": {
        description: "Invalid request body (malformed JSON)",
        contentType: "application/problem+json",
        schema: ProblemDetailSchema,
      },
      "401": {
        description: "Missing or invalid API key",
        contentType: "application/problem+json",
        schema: ProblemDetailSchema,
      },
      "422": {
        description: "WardleyMap JSON validation failed",
        contentType: "application/problem+json",
        schema: ProblemDetailSchema,
      },
      "429": {
        description: "Rate limit exceeded",
        contentType: "application/problem+json",
        schema: ProblemDetailSchema,
      },
      "500": {
        description: "Internal server error during rendering",
        contentType: "application/problem+json",
        schema: ProblemDetailSchema,
      },
    },
  });

  // ── POST /v1/render/png ────────────────────────────────────
  registerRoute({
    method: "POST",
    path: "/v1/render/png",
    operationId: "renderPng",
    summary: "Render a Wardley Map as PNG",
    description:
      "Accepts a WardleyMap JSON payload and returns a PNG image. " +
      "Equivalent to POST /v1/render with Accept: image/png.",
    tags: ["render"],
    security: bearerAuth,
    request: {
      contentType: "application/json",
      schema: WardleyMapSchema,
      description: "WardleyMap JSON object to render",
    },
    responses: {
      "200": {
        description: "PNG image of the rendered Wardley Map",
        contentType: "image/png",
        // PNG response is binary — no Zod schema
      },
      "400": {
        description: "Invalid request body (malformed JSON)",
        contentType: "application/problem+json",
        schema: ProblemDetailSchema,
      },
      "401": {
        description: "Missing or invalid API key",
        contentType: "application/problem+json",
        schema: ProblemDetailSchema,
      },
      "422": {
        description: "WardleyMap JSON validation failed",
        contentType: "application/problem+json",
        schema: ProblemDetailSchema,
      },
      "429": {
        description: "Rate limit exceeded",
        contentType: "application/problem+json",
        schema: ProblemDetailSchema,
      },
      "500": {
        description: "Internal server error during rendering",
        contentType: "application/problem+json",
        schema: ProblemDetailSchema,
      },
    },
  });

  // ── GET /v1/health ─────────────────────────────────────────
  registerRoute({
    method: "GET",
    path: "/v1/health",
    operationId: "healthCheck",
    summary: "Health check endpoint",
    description:
      "Returns the service name, version, and health status. " +
      "Does not require authentication.",
    tags: ["operations"],
    // No security — health check is public
    responses: {
      "200": {
        description: "Service is healthy",
        contentType: "application/json",
        schema: HealthResponseSchema,
      },
    },
  });
}
