/**
 * Integration tests for POST /render endpoint content negotiation.
 *
 * AC 2: Accept image/svg+xml returns SVG, Accept image/png or ambiguous returns PNG by default.
 */
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { renderRoute } from "./render-route.js";
import { rfc7807ErrorHandler } from "./middleware/error-handler.js";

const app = new Hono();

// Install the RFC 7807 error handler (same as production server)
app.onError(rfc7807ErrorHandler);

app.post("/render", renderRoute);

const VALID_MAP = {
  title: "Test Map",
  components: [
    { id: "c1", label: { name: "User" }, type: "anchor", position: { evolution: { scalar: 0.9 }, visibility: { scalar: 0.1 } } },
    { id: "c2", label: { name: "Web App" }, type: "component", nature: "activity", position: { evolution: { scalar: 0.6 }, visibility: { scalar: 0.3 } } },
  ],
  relations: [{ source: "c1", target: "c2", type: "DependsOn" }],
};

function post(accept?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (accept !== undefined) headers["Accept"] = accept;
  return app.request("/render", {
    method: "POST",
    headers,
    body: JSON.stringify(VALID_MAP),
  });
}

describe("POST /render content negotiation", () => {
  it("returns SVG when Accept: image/svg+xml", async () => {
    const res = await post("image/svg+xml");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("image/svg+xml");
    const body = await res.text();
    expect(body).toContain("<svg");
    expect(body).toContain("</svg>");
  });

  it("returns PNG when Accept: image/png", async () => {
    const res = await post("image/png");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    const buf = Buffer.from(await res.arrayBuffer());
    // PNG magic bytes
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50); // P
    expect(buf[2]).toBe(0x4e); // N
    expect(buf[3]).toBe(0x47); // G
  });

  it("returns PNG by default when Accept: */*", async () => {
    const res = await post("*/*");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
  });

  it("returns PNG by default when no Accept header", async () => {
    const res = await post(undefined);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
  });

  it("returns 406 for unsupported Accept: text/plain", async () => {
    const res = await post("text/plain");
    expect(res.status).toBe(406);
    const body = await res.json();
    // RFC 7807 Problem Details format
    expect(body.title).toBe("Not Acceptable");
    expect(body.status).toBe(406);
  });

  it("SVG response contains valid SVG document with Wardley Map elements", async () => {
    const res = await post("image/svg+xml");
    expect(res.status).toBe(200);
    const svg = await res.text();
    // Should contain the map title
    expect(svg).toContain("Test Map");
    // Should contain component labels
    expect(svg).toContain("User");
    expect(svg).toContain("Web App");
  });

  it("PNG response has non-zero Content-Length", async () => {
    const res = await post("image/png");
    expect(res.status).toBe(200);
    const contentLength = res.headers.get("Content-Length");
    expect(contentLength).toBeTruthy();
    expect(parseInt(contentLength!)).toBeGreaterThan(0);
  });

  it("returns Cache-Control: no-store for SVG", async () => {
    const res = await post("image/svg+xml");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns Cache-Control: no-store for PNG", async () => {
    const res = await post("image/png");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("prefers SVG when quality factor is higher for svg", async () => {
    const res = await post("image/png;q=0.5, image/svg+xml;q=1.0");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("image/svg+xml");
  });

  it("prefers PNG when quality factor is higher for png", async () => {
    const res = await post("image/svg+xml;q=0.5, image/png;q=1.0");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
  });
});
