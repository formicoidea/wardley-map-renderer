/**
 * @wardleyapi/server — Hono HTTP API entry point.
 *
 * Provides versioned REST endpoints for the Wardley Map render engine.
 *
 * Routes:
 *   GET  /health     — Health check (unversioned)
 *   POST /v1/render  — Render a WardleyMap JSON to SVG or PNG
 *
 * @module @wardleyapi/server
 */

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { v1 } from "./routes/v1.js";

export const app = new Hono();

app.use("*", cors());

// ── Global error handler — RFC 7807 problem+json ─────────────
app.onError((err, c) => {
  const status =
    "status" in err && typeof err.status === "number" ? err.status : 500;
  return c.json(
    {
      type: "about:blank",
      title: status >= 500 ? "Internal Server Error" : "Request Error",
      status,
      detail: err.message || "An unexpected error occurred",
    },
    status as any,
  );
});

// ── Health check (unversioned) ───────────────────────────────
app.get("/health", (c) =>
  c.json({
    name: "@wardleyapi/server",
    version: "0.1.0",
    status: "ok",
  }),
);

app.get("/", (c) =>
  c.json({
    name: "@wardleyapi/server",
    version: "0.1.0",
    status: "ok",
    endpoints: {
      "GET  /health": "Health check",
      "POST /v1/render":
        "Render a Wardley Map to PNG (default) or SVG (Accept: image/svg+xml)",
    },
  }),
);

// ── v1 API routes ────────────────────────────────────────────
app.route("/v1", v1);

// ── 404 catch-all — RFC 7807 ─────────────────────────────────
app.notFound((c) =>
  c.json(
    {
      type: "about:blank",
      title: "Not Found",
      status: 404,
      detail: `No route for ${c.req.method} ${c.req.path}`,
    },
    404,
  ),
);

// ── Start server (when run directly) ─────────────────────────
const port = parseInt(process.env.PORT || "3000", 10);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`@wardleyapi/server running at http://localhost:${info.port}`);
  console.log(
    `  POST /v1/render     WardleyMap JSON body, Accept: image/png|image/svg+xml`,
  );
});

export { v1 };
