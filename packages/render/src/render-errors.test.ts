/**
 * Tests for error handling on the POST /render endpoint.
 *
 * Verifies that the POST /render endpoint returns proper RFC 7807
 * Problem Details JSON error responses for all error conditions.
 */

import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { renderRoute, negotiateFormat } from "./render-route.js";
import { rfc7807ErrorHandler, rfc7807NotFound } from "./middleware/error-handler.js";

// ── Test app setup ──────────────────────────────────────────────────

function createTestApp() {
  const app = new Hono();

  // Use the production RFC 7807 error handler
  app.onError(rfc7807ErrorHandler);

  app.post("/render", renderRoute);

  // Method not allowed
  app.all("/render", (c) =>
    c.json(
      {
        type: "about:blank",
        title: "Method Not Allowed",
        status: 405,
        detail: "Use POST for /render",
      },
      405
    )
  );

  // 404 catch-all
  app.notFound(rfc7807NotFound);

  return app;
}

// ── Valid test map for success baseline ──────────────────────────────

const VALID_MAP = {
  title: "Test Map",
  components: [
    {
      id: "user",
      label: { name: "User" },
      type: "anchor",
      position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.1 } },
    },
    {
      id: "svc",
      label: { name: "Service" },
      type: "component",
      nature: "activity",
      position: { evolution: { scalar: 0.6 }, visibility: { scalar: 0.5 } },
    },
  ],
  relations: [{ source: "user", target: "svc" }],
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
    expect(res.headers.get("content-type")).toContain("json");
    const json = await res.json();
    expect(json).toHaveProperty("title");
    expect(json.title).toBe("Bad Request");
  });

  it("returns 422 JSON when required fields are missing", async () => {
    const res = await postRender(app, { title: "Missing components" });
    expect(res.status).toBe(422);
    expect(res.headers.get("content-type")).toContain("json");
    const json = await res.json();
    expect(json).toHaveProperty("title");
    expect(json).toHaveProperty("errors");
    expect(Array.isArray(json.errors)).toBe(true);
  });

  it("returns 200 for empty components (renders fond de carte)", async () => {
    const res = await postRender(app, {
      title: "Empty",
      components: [],
      relations: [],
    });
    // Empty maps are valid — render axes/title only (fond de carte)
    expect(res.status).toBe(200);
  });

  it("returns 422 JSON when evolution is out of range", async () => {
    const res = await postRender(app, {
      title: "Bad evolution",
      components: [
        {
          id: "x",
          label: { name: "X" },
          type: "anchor",
          position: { evolution: { scalar: 2.0 }, visibility: { scalar: 0.1 } },
        },
      ],
      relations: [],
    });
    expect(res.status).toBe(422);
    expect(res.headers.get("content-type")).toContain("json");
    const json = await res.json();
    expect(json).toHaveProperty("title");
  });

  it("returns 422 with errors array for schema validation errors", async () => {
    const res = await postRender(app, {
      title: 123, // wrong type
      components: "not an array",
      relations: [],
    });
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.detail).toBe("Invalid WardleyMap JSON");
    expect(json.errors).toBeDefined();
    expect(json.errors.length).toBeGreaterThan(0);
    // Each error should have path and message
    for (const err of json.errors) {
      expect(err).toHaveProperty("path");
      expect(err).toHaveProperty("message");
    }
  });

  // ── 406 Not Acceptable ──────────────────────────────────

  it("returns 406 JSON for unsupported Accept header", async () => {
    const res = await postRender(app, VALID_MAP, {
      Accept: "application/pdf",
    });
    expect(res.status).toBe(406);
    expect(res.headers.get("content-type")).toContain("json");
    const json = await res.json();
    expect(json.title).toBe("Not Acceptable");
    expect(json.detail).toContain("image/svg+xml");
    expect(json.detail).toContain("image/png");
  });

  it("returns 406 JSON for text/html Accept", async () => {
    const res = await postRender(app, VALID_MAP, {
      Accept: "text/html",
    });
    expect(res.status).toBe(406);
    const json = await res.json();
    expect(json).toHaveProperty("title");
  });

  // ── 415 Unsupported Media Type ──────────────────────────

  it("returns 415 JSON when Content-Type is not JSON", async () => {
    const res = await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(VALID_MAP),
    });
    expect(res.status).toBe(415);
    expect(res.headers.get("content-type")).toContain("json");
    const json = await res.json();
    expect(json.title).toBe("Unsupported Media Type");
    expect(json.detail).toContain("json");
  });

  it("returns 415 JSON when Content-Type is multipart/form-data", async () => {
    const res = await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "multipart/form-data" },
      body: JSON.stringify(VALID_MAP),
    });
    expect(res.status).toBe(415);
    const json = await res.json();
    expect(json.title).toBe("Unsupported Media Type");
  });

  // ── 405 Method Not Allowed ──────────────────────────────

  it("returns 405 JSON for GET /render", async () => {
    const res = await app.request("/render", { method: "GET" });
    expect(res.status).toBe(405);
    expect(res.headers.get("content-type")).toContain("json");
    const json = await res.json();
    expect(json.title).toBe("Method Not Allowed");
  });

  // ── 404 Not Found ───────────────────────────────────────

  it("returns 404 JSON for unknown routes", async () => {
    const res = await app.request("/nonexistent", { method: "GET" });
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("json");
    const json = await res.json();
    expect(json.title).toBe("Not Found");
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
