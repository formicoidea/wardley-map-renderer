// Integration tests for POST /v1/render endpoint.
//
// Sub-AC 3 of AC 2: Verifies:
//   - PNG by default (no Accept, Accept: wildcard, or Accept: image/png)
//   - SVG when Accept: image/svg+xml
//   - Proper error responses for invalid input (RFC 7807 format)
//
// Uses the full app from server.ts to exercise the /v1/ route prefix.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { app } from "../server.js";

// ── Ensure API key auth is in dev mode (no WARDLEY_API_KEY set) ──
const originalKey = process.env.WARDLEY_API_KEY;
beforeAll(() => { delete process.env.WARDLEY_API_KEY; });
afterAll(() => {
  if (originalKey !== undefined) process.env.WARDLEY_API_KEY = originalKey;
});

// ── Minimal valid WardleyMap JSON ──────────────────────────────
const VALID_MAP = {
  title: "Integration Test Map",
  components: [
    {
      id: "user",
      label: { name: "User" },
      type: "anchor",
      position: { evolution: { scalar: 0.9 }, visibility: { scalar: 0.95 } },
    },
    {
      id: "webapp",
      label: { name: "Web App" },
      type: "component",
      position: { evolution: { scalar: 0.65 }, visibility: { scalar: 0.7 } },
    },
  ],
  relations: [
    { id: "rel-user-webapp", source: "user", target: "webapp", type: "DependsOn" },
  ],
};

/** Helper: POST /v1/render with given Accept header */
function postRender(body: unknown, accept?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (accept !== undefined) headers["Accept"] = accept;
  return app.request("/v1/render", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

// ── PNG default behaviour ─────────────────────────────────────
describe("POST /v1/render — PNG default", () => {
  it("returns PNG when no Accept header is sent", async () => {
    const res = await postRender(VALID_MAP);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    const buf = new Uint8Array(await res.arrayBuffer());
    // PNG magic bytes: 0x89 P N G
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50);
    expect(buf[2]).toBe(0x4e);
    expect(buf[3]).toBe(0x47);
  });

  it("returns PNG when Accept: */*", async () => {
    const res = await postRender(VALID_MAP, "*/*");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
  });

  it("returns PNG when Accept: image/png", async () => {
    const res = await postRender(VALID_MAP, "image/png");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    const buf = new Uint8Array(await res.arrayBuffer());
    expect(buf[0]).toBe(0x89);
  });
});

// ── SVG via Accept header ─────────────────────────────────────
describe("POST /v1/render — SVG via Accept header", () => {
  it("returns SVG when Accept: image/svg+xml", async () => {
    const res = await postRender(VALID_MAP, "image/svg+xml");
    expect(res.status).toBe(200);
    const ct = res.headers.get("Content-Type") ?? "";
    expect(ct).toContain("image/svg+xml");
    const body = await res.text();
    expect(body).toContain("<svg");
    expect(body).toContain("</svg>");
  });

  it("SVG contains the map title", async () => {
    const res = await postRender(VALID_MAP, "image/svg+xml");
    const svg = await res.text();
    expect(svg).toContain("Integration Test Map");
  });

  it("SVG contains component labels", async () => {
    const res = await postRender(VALID_MAP, "image/svg+xml");
    const svg = await res.text();
    expect(svg).toContain("User");
    expect(svg).toContain("Web App");
  });
});

// ── Error responses (RFC 7807) ────────────────────────────────
describe("POST /v1/render — error responses", () => {
  it("returns 415 when Content-Type is not application/json", async () => {
    const res = await app.request("/v1/render", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(VALID_MAP),
    });
    expect(res.status).toBe(415);
    const body = await res.json();
    // RFC 7807: must have type, title, status
    expect(body.type).toBeDefined();
    expect(body.title).toBe("Unsupported Media Type");
    expect(body.status).toBe(415);
  });

  it("returns 400 for malformed JSON body", async () => {
    const res = await app.request("/v1/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ not valid json",
    });
    // ValidationError from errors.ts uses 422; check actual behavior
    const body = await res.json();
    expect(body.status).toBeGreaterThanOrEqual(400);
    expect(body.status).toBeLessThan(500);
    expect(body.type).toBeDefined();
    expect(body.title).toBeDefined();
  });

  it("returns validation error when title is missing", async () => {
    const res = await postRender({
      components: [
        { id: "c1", label: { name: "X" }, type: "component", position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.5 } } },
      ],
      relations: [],
    });
    const body = await res.json();
    expect(body.status).toBeGreaterThanOrEqual(400);
    expect(body.status).toBeLessThan(500);
    expect(body.type).toBeDefined();
    expect(body.title).toBeDefined();
    expect(body.detail).toContain("Invalid WardleyMap");
  });

  it("returns 200 for empty components (renders fond de carte)", async () => {
    const res = await postRender({
      title: "Empty",
      components: [],
      relations: [],
    });
    expect(res.status).toBe(200);
  });

  it("returns validation error when evolution is out of range", async () => {
    const res = await postRender({
      title: "Bad Evolution",
      components: [
        { id: "c1", label: { name: "X" }, type: "component", position: { evolution: { scalar: 1.5 }, visibility: { scalar: 0.5 } } },
      ],
      relations: [],
    });
    const body = await res.json();
    expect(body.status).toBeGreaterThanOrEqual(400);
    expect(body.status).toBeLessThan(500);
  });

  it("returns validation error for completely invalid body (not an object)", async () => {
    const res = await postRender("just a string");
    const body = await res.json();
    expect(body.status).toBeGreaterThanOrEqual(400);
    expect(body.status).toBeLessThan(500);
  });

  it("returns 406 for unsupported Accept header", async () => {
    const res = await postRender(VALID_MAP, "text/plain");
    expect(res.status).toBe(406);
    const body = await res.json();
    expect(body.type).toBeDefined();
    expect(body.title).toBe("Not Acceptable");
    expect(body.status).toBe(406);
  });

  it("returns 406 for Accept: application/json (render only produces images)", async () => {
    const res = await postRender(VALID_MAP, "application/json");
    expect(res.status).toBe(406);
    const body = await res.json();
    expect(body.title).toBe("Not Acceptable");
  });

  it("error responses use application/problem+json content type", async () => {
    const res = await postRender(VALID_MAP, "text/plain");
    const ct = res.headers.get("Content-Type") ?? "";
    expect(ct).toContain("application/problem+json");
  });
});
