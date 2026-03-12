/**
 * Tests for AC 12: Errors returned as JSON with 4xx/5xx status codes
 *
 * Verifies that the POST /render endpoint returns proper JSON error responses
 * for all error conditions.
 */

import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { renderRoute, negotiateFormat } from "./render.js";

// ── Test app setup ──────────────────────────────────────────────────

function createTestApp() {
  const app = new Hono();

  // Global error handler (mirrors server.ts)
  app.onError((err, c) => {
    const status =
      "status" in err && typeof err.status === "number" ? err.status : 500;
    return c.json(
      {
        error: status >= 500 ? "Internal Server Error" : "Request Error",
        message: err.message || "An unexpected error occurred",
      },
      status as any
    );
  });

  app.post("/render", renderRoute);

  // Method not allowed
  app.all("/render", (c) =>
    c.json(
      { error: "Method Not Allowed", message: "Use POST for /render" },
      405
    )
  );

  // 404 catch-all
  app.notFound((c) =>
    c.json(
      {
        error: "Not Found",
        message: `No route for ${c.req.method} ${c.req.path}`,
      },
      404
    )
  );

  return app;
}

// ── Valid test map for success baseline ──────────────────────────────

const VALID_MAP = {
  title: "Test Map",
  components: [
    {
      id: "user",
      label: "User",
      type: "anchor",
      nature: null,
      evolution: 0.5,
      visibility: 0.1,
    },
    {
      id: "svc",
      label: "Service",
      type: "capacity",
      nature: "activity",
      evolution: 0.6,
      visibility: 0.5,
    },
  ],
  relations: [{ from: "user", to: "svc" }],
};

// ── Helper ──────────────────────────────────────────────────────────

async function postRender(
  app: ReturnType<typeof createTestApp>,
  body: unknown,
  headers: Record<string, string> = {}
) {
  const defaultHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...headers,
  };
  return app.request("/render", {
    method: "POST",
    headers: defaultHeaders,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

// ── Tests ───────────────────────────────────────────────────────────

describe("POST /render error handling", () => {
  const app = createTestApp();

  // ── 400 Bad Request ──────────────────────────────────────

  it("returns 400 JSON for invalid JSON body", async () => {
    const res = await postRender(app, "not valid json {{{");
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("application/json");
    const json = await res.json();
    expect(json).toHaveProperty("error");
    expect(json.error).toMatch(/invalid/i);
  });

  it("returns 400 JSON when required fields are missing", async () => {
    const res = await postRender(app, { title: "Missing components" });
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("application/json");
    const json = await res.json();
    expect(json).toHaveProperty("error");
    expect(json).toHaveProperty("details");
    expect(Array.isArray(json.details)).toBe(true);
  });

  it("returns 400 JSON when components array is empty", async () => {
    const res = await postRender(app, {
      title: "Empty",
      components: [],
      relations: [],
    });
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("application/json");
    const json = await res.json();
    expect(json).toHaveProperty("error");
  });

  it("returns 400 JSON when evolution is out of range", async () => {
    const res = await postRender(app, {
      title: "Bad evolution",
      components: [
        {
          id: "x",
          label: "X",
          type: "anchor",
          nature: null,
          evolution: 2.0,
          visibility: 0.1,
        },
      ],
      relations: [],
    });
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("application/json");
    const json = await res.json();
    expect(json).toHaveProperty("error");
  });

  it("returns 400 with details array for schema validation errors", async () => {
    const res = await postRender(app, {
      title: 123, // wrong type
      components: "not an array",
      relations: [],
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid WardleyMap JSON");
    expect(json.details).toBeDefined();
    expect(json.details.length).toBeGreaterThan(0);
    // Each detail should have path and message
    for (const detail of json.details) {
      expect(detail).toHaveProperty("path");
      expect(detail).toHaveProperty("message");
    }
  });

  // ── 406 Not Acceptable ──────────────────────────────────

  it("returns 406 JSON for unsupported Accept header", async () => {
    const res = await postRender(app, VALID_MAP, {
      Accept: "application/pdf",
    });
    expect(res.status).toBe(406);
    expect(res.headers.get("content-type")).toContain("application/json");
    const json = await res.json();
    expect(json.error).toBe("Not Acceptable");
    expect(json.message).toContain("image/svg+xml");
    expect(json.message).toContain("image/png");
  });

  it("returns 406 JSON for text/html Accept", async () => {
    const res = await postRender(app, VALID_MAP, {
      Accept: "text/html",
    });
    expect(res.status).toBe(406);
    const json = await res.json();
    expect(json).toHaveProperty("error");
  });

  // ── 415 Unsupported Media Type ──────────────────────────

  it("returns 415 JSON when Content-Type is not JSON", async () => {
    const res = await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(VALID_MAP),
    });
    expect(res.status).toBe(415);
    expect(res.headers.get("content-type")).toContain("application/json");
    const json = await res.json();
    expect(json.error).toBe("Unsupported Media Type");
    expect(json.message).toContain("application/json");
  });

  it("returns 415 JSON when Content-Type is multipart/form-data", async () => {
    const res = await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "multipart/form-data" },
      body: JSON.stringify(VALID_MAP),
    });
    expect(res.status).toBe(415);
    const json = await res.json();
    expect(json.error).toBe("Unsupported Media Type");
  });

  // ── 405 Method Not Allowed ──────────────────────────────

  it("returns 405 JSON for GET /render", async () => {
    const res = await app.request("/render", { method: "GET" });
    expect(res.status).toBe(405);
    expect(res.headers.get("content-type")).toContain("application/json");
    const json = await res.json();
    expect(json.error).toBe("Method Not Allowed");
  });

  // ── 404 Not Found ───────────────────────────────────────

  it("returns 404 JSON for unknown routes", async () => {
    const res = await app.request("/nonexistent", { method: "GET" });
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    const json = await res.json();
    expect(json.error).toBe("Not Found");
  });

  // ── Success baseline (confirms non-error paths work) ───

  it("returns 200 SVG for valid map with Accept: image/svg+xml", async () => {
    const res = await postRender(app, VALID_MAP, {
      Accept: "image/svg+xml",
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/svg+xml");
  });

  it("returns 200 PNG for valid map with default Accept", async () => {
    const res = await postRender(app, VALID_MAP);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/png");
  });
});

// ── negotiateFormat unit tests ──────────────────────────────────────

describe("negotiateFormat", () => {
  it("returns 'png' for undefined Accept", () => {
    expect(negotiateFormat(undefined)).toBe("png");
  });

  it("returns 'png' for */*", () => {
    expect(negotiateFormat("*/*")).toBe("png");
  });

  it("returns 'png' for image/*", () => {
    expect(negotiateFormat("image/*")).toBe("png");
  });

  it("returns 'png' for image/png", () => {
    expect(negotiateFormat("image/png")).toBe("png");
  });

  it("returns 'svg' for image/svg+xml", () => {
    expect(negotiateFormat("image/svg+xml")).toBe("svg");
  });

  it("returns null for unsupported type", () => {
    expect(negotiateFormat("application/pdf")).toBeNull();
  });

  it("respects quality factors (svg preferred)", () => {
    expect(
      negotiateFormat("image/png;q=0.5, image/svg+xml;q=1.0")
    ).toBe("svg");
  });

  it("returns null for all q=0", () => {
    expect(negotiateFormat("image/png;q=0, image/svg+xml;q=0")).toBeNull();
  });
});
