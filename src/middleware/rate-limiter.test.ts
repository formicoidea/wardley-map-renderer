/**
 * Tests for rate limiting middleware.
 *
 * Verifies:
 * - Requests within limit pass through with rate limit headers
 * - Requests exceeding limit get 429 with Retry-After header
 * - RFC 7807 Problem Details format on 429
 * - Window resets after expiry
 * - Different clients have separate counters
 * - Rate limit headers are always present (X-RateLimit-Limit, Remaining, Reset)
 */

import { describe, it, expect, afterEach } from "vitest";
import { Hono } from "hono";
import { rateLimiter, RateLimitStore } from "./rate-limiter.js";

function createTestApp(opts?: { max?: number; windowMs?: number }) {
  const app = new Hono();

  app.use(
    "/v1/*",
    rateLimiter({
      max: opts?.max ?? 3,
      windowMs: opts?.windowMs ?? 60_000,
      // Use a header to simulate different clients in tests
      keyGenerator: (c) => c.req.header("X-Test-Client") || "default",
    })
  );

  app.get("/v1/ping", (c) => c.json({ message: "pong" }));
  app.post("/v1/render", (c) => c.json({ message: "rendered" }));

  // Public route (no rate limiting)
  app.get("/health", (c) => c.json({ status: "ok" }));

  return app;
}

describe("Rate limiting middleware", () => {
  // ── Requests within limit pass through ────────────────────────

  it("allows requests within the rate limit", async () => {
    const app = createTestApp({ max: 3 });

    const res = await app.request("/v1/ping", {
      headers: { "X-Test-Client": "client-a" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe("pong");
  });

  it("sets X-RateLimit-Limit header", async () => {
    const app = createTestApp({ max: 5 });

    const res = await app.request("/v1/ping", {
      headers: { "X-Test-Client": "client-limit" },
    });
    expect(res.headers.get("X-RateLimit-Limit")).toBe("5");
  });

  it("sets X-RateLimit-Remaining header (decrements)", async () => {
    const app = createTestApp({ max: 3 });

    const res1 = await app.request("/v1/ping", {
      headers: { "X-Test-Client": "client-remain" },
    });
    expect(res1.headers.get("X-RateLimit-Remaining")).toBe("2");

    const res2 = await app.request("/v1/ping", {
      headers: { "X-Test-Client": "client-remain" },
    });
    expect(res2.headers.get("X-RateLimit-Remaining")).toBe("1");

    const res3 = await app.request("/v1/ping", {
      headers: { "X-Test-Client": "client-remain" },
    });
    expect(res3.headers.get("X-RateLimit-Remaining")).toBe("0");
  });

  it("sets X-RateLimit-Reset header as Unix timestamp", async () => {
    const app = createTestApp({ max: 3 });

    const res = await app.request("/v1/ping", {
      headers: { "X-Test-Client": "client-reset" },
    });

    const reset = parseInt(res.headers.get("X-RateLimit-Reset")!, 10);
    expect(reset).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  // ── 429 when limit is exceeded ────────────────────────────────

  it("returns 429 when rate limit is exceeded", async () => {
    const app = createTestApp({ max: 2 });

    // Two allowed requests
    await app.request("/v1/ping", {
      headers: { "X-Test-Client": "client-429" },
    });
    await app.request("/v1/ping", {
      headers: { "X-Test-Client": "client-429" },
    });

    // Third request should be rate limited
    const res = await app.request("/v1/ping", {
      headers: { "X-Test-Client": "client-429" },
    });
    expect(res.status).toBe(429);
  });

  it("returns Retry-After header on 429", async () => {
    const app = createTestApp({ max: 1 });

    await app.request("/v1/ping", {
      headers: { "X-Test-Client": "client-retry" },
    });

    const res = await app.request("/v1/ping", {
      headers: { "X-Test-Client": "client-retry" },
    });
    expect(res.status).toBe(429);

    const retryAfter = res.headers.get("Retry-After");
    expect(retryAfter).toBeTruthy();
    const seconds = parseInt(retryAfter!, 10);
    expect(seconds).toBeGreaterThan(0);
    expect(seconds).toBeLessThanOrEqual(60);
  });

  it("returns RFC 7807 Problem Details on 429", async () => {
    const app = createTestApp({ max: 1 });

    await app.request("/v1/ping", {
      headers: { "X-Test-Client": "client-rfc" },
    });

    const res = await app.request("/v1/ping", {
      headers: { "X-Test-Client": "client-rfc" },
    });
    expect(res.status).toBe(429);

    const body = await res.json();
    expect(body.type).toBe(
      "https://wardleyapi.dev/problems/rate-limit-exceeded"
    );
    expect(body.title).toBe("Too Many Requests");
    expect(body.status).toBe(429);
    expect(body.detail).toContain("Rate limit exceeded");
    expect(body.retryAfter).toBeTypeOf("number");
    expect(body.retryAfter).toBeGreaterThan(0);
  });

  it("returns Content-Type: application/problem+json on 429", async () => {
    const app = createTestApp({ max: 1 });

    await app.request("/v1/ping", {
      headers: { "X-Test-Client": "client-ct" },
    });

    const res = await app.request("/v1/ping", {
      headers: { "X-Test-Client": "client-ct" },
    });
    expect(res.headers.get("Content-Type")).toContain(
      "application/problem+json"
    );
  });

  // ── Remaining stays at 0 after limit ──────────────────────────

  it("X-RateLimit-Remaining stays at 0 after limit exceeded", async () => {
    const app = createTestApp({ max: 1 });

    await app.request("/v1/ping", {
      headers: { "X-Test-Client": "client-zero" },
    });

    const res = await app.request("/v1/ping", {
      headers: { "X-Test-Client": "client-zero" },
    });
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
  });

  // ── Different clients have separate counters ──────────────────

  it("tracks different clients separately", async () => {
    const app = createTestApp({ max: 1 });

    // Client A exhausts its limit
    await app.request("/v1/ping", {
      headers: { "X-Test-Client": "client-x" },
    });
    const resA = await app.request("/v1/ping", {
      headers: { "X-Test-Client": "client-x" },
    });
    expect(resA.status).toBe(429);

    // Client B should still be allowed
    const resB = await app.request("/v1/ping", {
      headers: { "X-Test-Client": "client-y" },
    });
    expect(resB.status).toBe(200);
  });

  // ── POST endpoints also rate limited ──────────────────────────

  it("rate limits POST endpoints too", async () => {
    const app = createTestApp({ max: 1 });

    await app.request("/v1/render", {
      method: "POST",
      headers: { "X-Test-Client": "client-post" },
    });

    const res = await app.request("/v1/render", {
      method: "POST",
      headers: { "X-Test-Client": "client-post" },
    });
    expect(res.status).toBe(429);
  });

  // ── Public routes are not rate limited ────────────────────────

  it("does not rate limit routes outside /v1/*", async () => {
    const app = createTestApp({ max: 1 });

    // Multiple requests to /health should all succeed
    const res1 = await app.request("/health");
    const res2 = await app.request("/health");
    const res3 = await app.request("/health");

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res3.status).toBe(200);
  });
});

describe("RateLimitStore", () => {
  let store: RateLimitStore;

  afterEach(() => {
    store?.destroy();
  });

  it("starts a new window on first request", () => {
    store = new RateLimitStore(60_000);
    const now = Date.now();
    const result = store.increment("key1", now);

    expect(result.count).toBe(1);
    expect(result.windowStart).toBe(now);
  });

  it("increments within the same window", () => {
    store = new RateLimitStore(60_000);
    const now = Date.now();

    store.increment("key1", now);
    const result = store.increment("key1", now + 100);

    expect(result.count).toBe(2);
  });

  it("resets when window expires", () => {
    store = new RateLimitStore(1000); // 1 second window
    const now = Date.now();

    store.increment("key1", now);
    store.increment("key1", now + 100);

    // After window expires
    const result = store.increment("key1", now + 1500);
    expect(result.count).toBe(1);
  });

  it("tracks separate keys independently", () => {
    store = new RateLimitStore(60_000);
    const now = Date.now();

    store.increment("key1", now);
    store.increment("key1", now);
    const r1 = store.increment("key1", now);

    const r2 = store.increment("key2", now);

    expect(r1.count).toBe(3);
    expect(r2.count).toBe(1);
  });
});
