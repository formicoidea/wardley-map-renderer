import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { apiKeyAuth } from "./middleware/api-key.js";
import { rateLimiter } from "./middleware/rate-limiter.js";
import { v1 } from "./routes/v1.js";
import { rfc7807ErrorHandler, rfc7807NotFound } from "./middleware/error-handler.js";

const app = new Hono();

app.use("*", cors());

// ── API key authentication on /v1/* routes (except /v1/docs/*) ──
app.use("/v1/*", async (c, next) => {
  // Skip auth for documentation endpoints
  if (c.req.path.startsWith("/v1/docs/")) {
    return next();
  }
  return apiKeyAuth()(c, next);
});

// ── Rate limiting on /v1/* routes (except /v1/docs/*) ───────────
app.use("/v1/*", async (c, next) => {
  // Skip rate limiting for documentation endpoints
  if (c.req.path.startsWith("/v1/docs/")) {
    return next();
  }
  return rateLimiter()(c, next);
});

// ── Global error handler — RFC 7807 Problem Details ─────────
app.onError(rfc7807ErrorHandler);

// ── Health check (root — not versioned) ──────────────────────
app.get("/health", (c) =>
  c.json({
    name: "WardleyAPI",
    version: "0.1.0",
    status: "ok",
  })
);

app.get("/", (c) =>
  c.json({
    name: "WardleyAPI",
    version: "0.1.0",
    status: "ok",
    endpoints: {
      "GET  /health": "Health check",
      "POST /v1/render": "Render a Wardley Map to PNG (default) or SVG (Accept: image/svg+xml)",
      "POST /v1/generate": "Generate a Wardley Map from a prompt",
      "GET  /v1/docs/openapi.json": "OpenAPI 3.1 specification (no auth required)",
    },
  })
);

// ── v1 API routes ────────────────────────────────────────────
app.route("/v1", v1);

// ── 404 catch-all — RFC 7807 Problem Details ────────────────
app.notFound(rfc7807NotFound);

// ── Start (only when run directly, not when imported by tests) ──
const isTestEnv =
  process.env.NODE_ENV === "test" ||
  process.env.VITEST === "true" ||
  typeof (globalThis as any).__vitest_worker__ !== "undefined";

if (!isTestEnv) {
  const port = parseInt(process.env.PORT || "3000", 10);

  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`WardleyAPI running at http://localhost:${info.port}`);
    console.log(`  GET  /health        Health check`);
    console.log(`  POST /v1/render     WardleyMap JSON body, Accept: image/png (default)|image/svg+xml`);
    console.log(`  POST /v1/generate   { "prompt": "...", "format": "json|owm|both" }`);
  });
}

export { app };
