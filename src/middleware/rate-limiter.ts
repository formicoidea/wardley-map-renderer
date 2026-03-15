/**
 * Application-level rate limiting middleware for Hono.
 *
 * Uses a sliding-window counter per client IP to enforce request limits.
 * Returns RFC 7807 Problem Details with Retry-After header on 429.
 *
 * Standard rate limit headers (RFC 6585 + draft-ietf-httpapi-ratelimit-headers):
 *   - X-RateLimit-Limit: max requests per window
 *   - X-RateLimit-Remaining: remaining requests in current window
 *   - X-RateLimit-Reset: Unix timestamp when the window resets
 *   - Retry-After: seconds until the client can retry (only on 429)
 *
 * Configuration via environment variables:
 *   - RATE_LIMIT_MAX: max requests per window (default: 100)
 *   - RATE_LIMIT_WINDOW_MS: window size in milliseconds (default: 60000 = 1 minute)
 *
 * @module middleware/rate-limiter
 */

import type { Context, MiddlewareHandler, Next } from "hono";

// ── Types ────────────────────────────────────────────────────────────

export interface RateLimiterOptions {
  /** Maximum number of requests per window (default: 100) */
  max?: number;
  /** Window size in milliseconds (default: 60_000 = 1 minute) */
  windowMs?: number;
  /** Function to extract the client identifier (default: IP-based) */
  keyGenerator?: (c: Context) => string;
}

interface WindowEntry {
  /** Number of requests made in the current window */
  count: number;
  /** Timestamp (ms) when the current window started */
  windowStart: number;
}

// ── In-memory store ──────────────────────────────────────────────────

/**
 * Simple in-memory sliding window store.
 * Suitable for single-process deployments (PaaS).
 * For multi-instance deployments, replace with Redis-backed store.
 */
export class RateLimitStore {
  private entries = new Map<string, WindowEntry>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly windowMs: number) {
    // Periodic cleanup to prevent memory leaks from stale entries
    this.cleanupInterval = setInterval(() => this.cleanup(), windowMs * 2);
    // Allow the process to exit even if the interval is active
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Increment the counter for the given key and return current state.
   */
  increment(key: string, now: number): { count: number; windowStart: number } {
    const entry = this.entries.get(key);

    if (!entry || now - entry.windowStart >= this.windowMs) {
      // New window
      const newEntry: WindowEntry = { count: 1, windowStart: now };
      this.entries.set(key, newEntry);
      return { ...newEntry };
    }

    // Same window — increment
    entry.count++;
    return { count: entry.count, windowStart: entry.windowStart };
  }

  /**
   * Remove expired entries to prevent memory leaks.
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (now - entry.windowStart >= this.windowMs) {
        this.entries.delete(key);
      }
    }
  }

  /**
   * Stop the cleanup interval (for tests).
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /** Exposed for testing */
  get size(): number {
    return this.entries.size;
  }
}

// ── Default key generator ────────────────────────────────────────────

/**
 * Extract client IP from standard proxy headers or connection info.
 */
function defaultKeyGenerator(c: Context): string {
  return (
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    c.req.header("cf-connecting-ip") ||
    "unknown"
  );
}

// ── Middleware factory ───────────────────────────────────────────────

/**
 * Creates a rate limiting middleware.
 *
 * @param opts - Rate limiter configuration
 * @returns Hono middleware handler
 *
 * @example
 * ```ts
 * app.use("/v1/*", rateLimiter({ max: 100, windowMs: 60_000 }));
 * ```
 */
export function rateLimiter(opts?: RateLimiterOptions): MiddlewareHandler {
  const max = opts?.max ?? parseInt(process.env.RATE_LIMIT_MAX || "100", 10);
  const windowMs =
    opts?.windowMs ?? parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10);
  const keyGenerator = opts?.keyGenerator ?? defaultKeyGenerator;

  const store = new RateLimitStore(windowMs);

  return async (c: Context, next: Next) => {
    const key = keyGenerator(c);
    const now = Date.now();
    const { count, windowStart } = store.increment(key, now);

    const remaining = Math.max(0, max - count);
    const resetMs = windowStart + windowMs;
    const resetSec = Math.ceil(resetMs / 1000);

    // Always set informational rate limit headers
    c.header("X-RateLimit-Limit", String(max));
    c.header("X-RateLimit-Remaining", String(remaining));
    c.header("X-RateLimit-Reset", String(resetSec));

    if (count > max) {
      const retryAfter = Math.ceil((resetMs - now) / 1000);

      c.header("Retry-After", String(retryAfter));

      return c.json(
        {
          type: "https://wardleyapi.dev/problems/rate-limit-exceeded",
          title: "Too Many Requests",
          status: 429,
          detail: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
          retryAfter,
        },
        429,
        { "Content-Type": "application/problem+json" }
      );
    }

    await next();
  };
}

/**
 * Create a rate limiter with a custom store (for testing).
 * Returns both the middleware and the store for inspection.
 */
export function createRateLimiter(opts?: RateLimiterOptions) {
  const max = opts?.max ?? 100;
  const windowMs = opts?.windowMs ?? 60_000;
  const keyGenerator = opts?.keyGenerator ?? defaultKeyGenerator;

  const store = new RateLimitStore(windowMs);
  const middleware = rateLimiter({ max, windowMs, keyGenerator });

  return { middleware, store };
}
