/**
 * Tests for API key authentication middleware.
 *
 * Verifies:
 * - Requests without Authorization header → 401
 * - Requests with invalid key → 401
 * - Requests with valid key → pass through
 * - Public routes (/, /health) are NOT protected
 * - RFC 7807 error format on 401
 * - X-API-Key header support
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Hono } from "hono";
import { apiKeyAuth } from "./api-key.js";

const TEST_API_KEY = "test-secret-key-12345";

/**
 * Build a minimal test app that mirrors server.ts structure:
 * - Public routes at / and /health
 * - API key middleware on /v1/*
 * - A protected /v1/ping endpoint
 */
function createTestApp() {
  const app = new Hono();

  // Public routes (no auth)
  app.get("/", (c) => c.json({ status: "ok" }));
  app.get("/health", (c) => c.json({ status: "ok" }));

  // API key middleware on /v1/*
  app.use("/v1/*", apiKeyAuth());

  // Protected routes
  app.get("/v1/ping", (c) => c.json({ message: "pong" }));
  app.post("/v1/render", (c) => c.json({ message: "rendered" }));

  return app;
}

describe("API key authentication middleware", () => {
  let originalEnv: string | undefined;
  let app: ReturnType<typeof createTestApp>;

  beforeAll(() => {
    originalEnv = process.env.WARDLEY_API_KEY;
    process.env.WARDLEY_API_KEY = TEST_API_KEY;
    app = createTestApp();
  });

  afterAll(() => {
    if (originalEnv === undefined) {
      delete process.env.WARDLEY_API_KEY;
    } else {
      process.env.WARDLEY_API_KEY = originalEnv;
    }
  });

  // ── 401: Missing Authorization header ──────────────────────

  it("returns 401 when no Authorization header is provided", async () => {
    const res = await app.request("/v1/ping");
    expect(res.status).toBe(401);
  });

  it("returns RFC 7807 problem detail on missing auth", async () => {
    const res = await app.request("/v1/ping");
    const body = await res.json();
    expect(body.type).toBe("https://api.wardleyapi.com/problems/authentication-error");
    expect(body.title).toBe("Unauthorized");
    expect(body.status).toBe(401);
    expect(body.detail).toContain("Missing API key");
  });

  it("returns WWW-Authenticate header on 401", async () => {
    const res = await app.request("/v1/ping");
    expect(res.headers.get("WWW-Authenticate")).toContain("Bearer");
  });

  it("returns Content-Type: application/problem+json on 401", async () => {
    const res = await app.request("/v1/ping");
    expect(res.headers.get("Content-Type")).toContain("application/problem+json");
  });

  it("includes instance field in RFC 7807 response", async () => {
    const res = await app.request("/v1/ping");
    const body = await res.json();
    expect(body.instance).toBe("/v1/ping");
  });

  // ── 401: Invalid key ──────────────────────────────────────

  it("returns 401 with an invalid Bearer API key", async () => {
    const res = await app.request("/v1/ping", {
      headers: { Authorization: "Bearer wrong-key" },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.detail).toContain("Invalid API key");
  });

  it("returns 401 with empty Bearer token", async () => {
    const res = await app.request("/v1/ping", {
      headers: { Authorization: "Bearer " },
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 with invalid X-API-Key", async () => {
    const res = await app.request("/v1/ping", {
      headers: { "X-API-Key": "wrong-key" },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.detail).toContain("Invalid API key");
  });

  // ── 200: Valid key passes through ─────────────────────────

  it("passes through with a valid Bearer API key (GET)", async () => {
    const res = await app.request("/v1/ping", {
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe("pong");
  });

  it("passes through with a valid Bearer API key (POST)", async () => {
    const res = await app.request("/v1/render", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TEST_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe("rendered");
  });

  it("passes through with a valid X-API-Key header", async () => {
    const res = await app.request("/v1/ping", {
      headers: { "X-API-Key": TEST_API_KEY },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe("pong");
  });

  it("passes through with X-API-Key on POST endpoint", async () => {
    const res = await app.request("/v1/render", {
      method: "POST",
      headers: {
        "X-API-Key": TEST_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe("rendered");
  });

  it("X-API-Key is used when non-Bearer Authorization is present", async () => {
    const res = await app.request("/v1/ping", {
      headers: {
        Authorization: "Basic somecreds",
        "X-API-Key": TEST_API_KEY,
      },
    });
    // X-API-Key should be used as fallback when Authorization is non-Bearer
    expect(res.status).toBe(200);
  });

  it("returns 401 with non-Bearer scheme and no X-API-Key", async () => {
    const res = await app.request("/v1/ping", {
      headers: { Authorization: `Basic ${TEST_API_KEY}` },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.detail).toContain("Invalid Authorization scheme");
  });

  it("is case-insensitive for Bearer scheme", async () => {
    const res = await app.request("/v1/ping", {
      headers: { Authorization: `bearer ${TEST_API_KEY}` },
    });
    expect(res.status).toBe(200);
  });

  // ── Public routes are NOT protected ───────────────────────

  it("GET / is accessible without auth", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
  });

  it("GET /health is accessible without auth", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
  });

  // ── Auth disabled when no key configured ──────────────────

  it("skips auth when WARDLEY_API_KEY is not set", async () => {
    const saved = process.env.WARDLEY_API_KEY;
    delete process.env.WARDLEY_API_KEY;

    const noKeyApp = createTestApp();
    const res = await noKeyApp.request("/v1/ping");
    expect(res.status).toBe(200);

    process.env.WARDLEY_API_KEY = saved;
  });
});
