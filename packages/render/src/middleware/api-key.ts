/**
 * API Key authentication middleware for Hono.
 *
 * Validates API key from:
 *   1. Authorization header (Bearer scheme): `Authorization: Bearer <key>`
 *   2. X-API-Key header: `X-API-Key: <key>`
 *
 * Returns RFC 7807 (Problem Details) compliant 401 responses on failure.
 *
 * Configuration:
 *   - Via environment variable: WARDLEY_API_KEY
 *   - Via Hono env bindings (for Cloudflare Workers, etc.)
 *
 * @module middleware/api-key
 */

import type { Context, Next } from "hono";

/**
 * RFC 7807 Problem Details for authentication errors.
 */
export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
}

/**
 * Extract API key from request headers.
 *
 * Checks in order:
 *   1. Authorization: Bearer <key>
 *   2. X-API-Key: <key>
 *
 * Returns an object with the key or an error detail for malformed auth.
 */
function extractApiKey(c: Context): { key: string } | { error: string } | null {
  const authHeader = c.req.header("Authorization");
  const xApiKey = c.req.header("X-API-Key");

  // 1. Authorization header
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match) {
      const token = match[1].trim();
      if (token) return { key: token };
    }

    // Authorization header present but not Bearer scheme, and no X-API-Key fallback
    if (!xApiKey) {
      return { error: "Invalid Authorization scheme. Use Bearer <api-key> or X-API-Key header." };
    }
  }

  // 2. X-API-Key header
  if (xApiKey) {
    const trimmed = xApiKey.trim();
    if (trimmed) return { key: trimmed };
  }

  return null;
}

/**
 * Creates an API key authentication middleware.
 *
 * The middleware checks for a valid API key in:
 *   - Authorization header with Bearer scheme
 *   - X-API-Key header
 *
 * The expected key is read from `env.WARDLEY_API_KEY` (Hono bindings)
 * or falls back to `process.env.WARDLEY_API_KEY`.
 *
 * If no key is configured (env var not set), auth is skipped (dev mode).
 *
 * Public routes (health check, root) should be registered BEFORE this middleware
 * or this middleware should be scoped to /v1/* only.
 */
export function apiKeyAuth() {
  return async (c: Context, next: Next) => {
    const expectedKey = getApiKey(c);

    // If no API key is configured, skip auth (dev mode)
    if (!expectedKey) {
      await next();
      return;
    }

    const result = extractApiKey(c);

    // Malformed auth header (e.g. Basic scheme without X-API-Key)
    if (result && "error" in result) {
      return unauthorized(c, result.error);
    }

    // No credentials provided
    if (!result) {
      return unauthorized(
        c,
        "Missing API key. Provide it via Authorization: Bearer <key> or X-API-Key header."
      );
    }

    // Constant-time comparison to prevent timing attacks
    if (!timingSafeEqual(result.key, expectedKey)) {
      return unauthorized(c, "Invalid API key.");
    }

    await next();
  };
}

/**
 * Get the API key from Hono env bindings or process.env.
 */
function getApiKey(c: Context): string | undefined {
  // Hono bindings (for Cloudflare Workers, etc.)
  const env = c.env as Record<string, unknown> | undefined;
  if (env?.WARDLEY_API_KEY && typeof env.WARDLEY_API_KEY === "string") {
    return env.WARDLEY_API_KEY;
  }
  // Node.js fallback
  return process.env.WARDLEY_API_KEY;
}

/**
 * Return a 401 response with RFC 7807 Problem Details.
 *
 * Sets Content-Type to application/problem+json per RFC 7807 §3.
 * Includes WWW-Authenticate header per RFC 7235.
 */
function unauthorized(c: Context, detail: string) {
  const problem: ProblemDetail = {
    type: "https://wardleyapi.dev/problems/unauthorized",
    title: "Unauthorized",
    status: 401,
    detail,
    instance: c.req.path,
  };

  return c.json(problem, 401, {
    "Content-Type": "application/problem+json",
    "WWW-Authenticate": 'Bearer realm="WardleyAPI"',
  });
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do a comparison to avoid length-based timing leak
    let result = a.length ^ b.length;
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      result |= (a.charCodeAt(i % a.length) ?? 0) ^ (b.charCodeAt(i % b.length) ?? 0);
    }
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
