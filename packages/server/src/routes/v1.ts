/**
 * v1 API router — all versioned endpoints live under /v1/.
 *
 * Routes:
 *   POST /v1/render — Render a WardleyMap JSON to SVG or PNG
 *
 * Content negotiation via Accept header on /render:
 *   image/svg+xml → SVG
 *   image/png     → PNG (default)
 *
 * @module routes/v1
 */

import { Hono } from "hono";

export const v1 = new Hono();

// ── Render endpoint (placeholder — wired to @wardleyapi/render) ──
v1.post("/render", async (c) => {
  // TODO: wire to @wardleyapi/render pipeline once the render package is scaffolded
  const body = await c.req.json();
  const accept = c.req.header("Accept") || "image/png";

  if (accept.includes("image/svg+xml")) {
    return c.text("<svg></svg>", 200, {
      "Content-Type": "image/svg+xml",
    });
  }

  if (accept.includes("image/png") || accept === "*/*") {
    // Placeholder — return empty PNG response
    return c.body(new ArrayBuffer(0), 200, {
      "Content-Type": "image/png",
    });
  }

  return c.json(
    {
      type: "about:blank",
      title: "Not Acceptable",
      status: 406,
      detail: `Unsupported Accept type: ${accept}. Use image/svg+xml or image/png.`,
    },
    406,
  );
});

// ── Method Not Allowed for /render ──────────────────────────
v1.all("/render", (c) =>
  c.json(
    {
      type: "about:blank",
      title: "Method Not Allowed",
      status: 405,
      detail: "Use POST for /v1/render",
    },
    405,
  ),
);
