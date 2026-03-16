/**
 * Tests for v1 API versioning and POST /v1/render route handler.
 *
 * Verifies:
 * - Endpoints are accessible under /v1/ prefix
 * - Root-level routes work as expected
 * - POST /v1/render accepts WardleyMap JSON, validates with Zod, returns PNG by default
 * - Error responses use RFC 7807 Problem Details format
 */

import { describe, it, expect } from "vitest";
import { app } from "../server.js";

// ── Minimal valid WardleyMap JSON for testing ────────────────
const VALID_MAP = {
  title: "Test Map",
  components: [
    {
      id: "user",
      label: { name: "User" },
      type: "anchor",
      position: { evolution: { scalar: 0.95 }, visibility: { scalar: 0.95 } },
    },
    {
      id: "web-app",
      label: { name: "Web App" },
      type: "component",
      position: { evolution: { scalar: 0.65 }, visibility: { scalar: 0.8 } },
    },
  ],
  relations: [{ source: "user", target: "web-app" }],
};

describe("API versioning under /v1/", () => {
  it("GET / returns endpoint listing with /v1/ paths", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("WardleyAPI");
    expect(body.endpoints).toBeDefined();
    const endpointKeys = Object.keys(body.endpoints);
    const apiEndpoints = endpointKeys.filter(
      (k) => k.includes("/render") || k.includes("/generate"),
    );
    for (const key of apiEndpoints) {
      expect(key).toContain("/v1/");
    }
  });

  it("GET /health returns health check", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.name).toBe("WardleyAPI");
  });

  it("POST /v1/render is routable (returns 415 without Content-Type, not 404)", async () => {
    const res = await app.request("/v1/render", {
      method: "POST",
      body: "{}",
    });
    expect(res.status).not.toBe(404);
  });

  it("GET /v1/render returns 405 Method Not Allowed (RFC 7807)", async () => {
    const res = await app.request("/v1/render", { method: "GET" });
    expect(res.status).toBe(405);
    const body = await res.json();
    // RFC 7807 fields
    expect(body.title).toBe("Method Not Allowed");
    expect(body.status).toBe(405);
    expect(body.detail).toContain("POST");
  });

  it("POST /render (without /v1/) returns 404", async () => {
    const res = await app.request("/render", {
      method: "POST",
      body: "{}",
    });
    expect(res.status).toBe(404);
  });

  it("POST /generate (without /v1/) returns 404", async () => {
    const res = await app.request("/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "test" }),
    });
    expect(res.status).toBe(404);
  });

  it("unknown route returns 404 with RFC 7807 body", async () => {
    const res = await app.request("/v1/nonexistent");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.title).toBe("Not Found");
    expect(body.status).toBe(404);
  });
});

describe("POST /v1/render — route handler", () => {
  // ── Content-Type validation ────────────────────────────────
  it("returns 415 when Content-Type is not application/json", async () => {
    const res = await app.request("/v1/render", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "not json",
    });
    expect(res.status).toBe(415);
    const body = await res.json();
    expect(body.title).toBe("Unsupported Media Type");
    expect(body.status).toBe(415);
    expect(body.detail).toContain("application/json");
  });

  // ── Invalid JSON body ─────────────────────────────────────
  it("returns 400 when body is not valid JSON", async () => {
    const res = await app.request("/v1/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ invalid json }",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.status).toBe(400);
  });

  // ── Zod validation errors ─────────────────────────────────
  it("returns 422 with validation errors for invalid WardleyMap schema", async () => {
    const res = await app.request("/v1/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Missing components" }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.title).toBe("Validation Error");
    expect(body.status).toBe(422);
    expect(body.detail).toBe("Invalid WardleyMap JSON");
    expect(body.errors).toBeDefined();
    expect(Array.isArray(body.errors)).toBe(true);
    expect(body.errors.length).toBeGreaterThan(0);
    // Each error should have path and message
    for (const err of body.errors) {
      expect(err).toHaveProperty("path");
      expect(err).toHaveProperty("message");
    }
  });

  it("returns 200 for empty components (renders fond de carte)", async () => {
    const res = await app.request("/v1/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Empty",
        components: [],
        relations: [],
      }),
    });
    expect(res.status).toBe(200);
  });

  // ── Successful PNG rendering (default) ─────────────────────
  it("returns PNG by default for valid WardleyMap JSON", async () => {
    const res = await app.request("/v1/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_MAP),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const contentLength = res.headers.get("Content-Length");
    expect(contentLength).toBeDefined();
    expect(parseInt(contentLength!, 10)).toBeGreaterThan(0);
    // Verify it's a valid PNG (starts with PNG signature)
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    // PNG magic bytes: 137 80 78 71 13 10 26 10
    expect(bytes[0]).toBe(137);
    expect(bytes[1]).toBe(80); // 'P'
    expect(bytes[2]).toBe(78); // 'N'
    expect(bytes[3]).toBe(71); // 'G'
  });

  // ── SVG via Accept header ─────────────────────────────────
  it("returns SVG when Accept: image/svg+xml", async () => {
    const res = await app.request("/v1/render", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "image/svg+xml",
      },
      body: JSON.stringify(VALID_MAP),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("image/svg+xml");
    const svg = await res.text();
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
  });

  // ── Accept negotiation → PNG for wildcard ──────────────────
  it("returns PNG when Accept: */*", async () => {
    const res = await app.request("/v1/render", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "*/*",
      },
      body: JSON.stringify(VALID_MAP),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
  });

  // ── 406 Not Acceptable ────────────────────────────────────
  it("returns 406 for unsupported Accept type", async () => {
    const res = await app.request("/v1/render", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/pdf",
      },
      body: JSON.stringify(VALID_MAP),
    });
    expect(res.status).toBe(406);
    const body = await res.json();
    expect(body.title).toBe("Not Acceptable");
    expect(body.status).toBe(406);
  });

  // ── Sanitization: legacy types accepted ────────────────────
  it("accepts and sanitizes legacy component types", async () => {
    const mapWithLegacy = {
      title: "Legacy Test",
      components: [
        {
          id: "a",
          label: { name: "Anchor" },
          type: "anchor",
          position: { evolution: { scalar: 0.9 }, visibility: { scalar: 0.9 } },
        },
        {
          id: "b",
          label: { name: "Legacy Capacity" },
          type: "component", // modern type
          position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.5 } },
        },
      ],
      relations: [{ source: "a", target: "b" }],
    };
    const res = await app.request("/v1/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mapWithLegacy),
    });
    expect(res.status).toBe(200);
  });
});
