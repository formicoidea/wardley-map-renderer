/**
 * Integration tests for POST /render endpoint content negotiation.
 *
 * AC 2: Accept image/svg+xml returns SVG, Accept image/png or ambiguous returns PNG by default.
 */
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { renderRoute } from "./render.js";

const app = new Hono();
app.post("/render", renderRoute);

const VALID_MAP = {
  title: "Test Map",
  components: [
    { id: "c1", label: "User", type: "anchor", nature: null, evolution: 0.9, visibility: 0.1 },
    { id: "c2", label: "Web App", type: "capacity", nature: "activity", evolution: 0.6, visibility: 0.3 },
  ],
  relations: [{ from: "c1", to: "c2", type: "dependency" }],
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
    expect(body.error).toBe("Not Acceptable");
  });
});
