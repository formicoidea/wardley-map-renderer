/**
 * v1 API router — all versioned endpoints live under /v1/.
 *
 * Routes:
 *   POST /v1/render   — Render a WardleyMap JSON to SVG or PNG
 *   POST /v1/generate — Generate a Wardley Map from a prompt
 *
 * Content negotiation via Accept header on /render:
 *   image/svg+xml → SVG
 *   image/png     → PNG (default)
 *
 * @module routes/v1
 */

import { Hono } from "hono";
import { generateMap } from "../llm.js";
import { validateMap, toOWM } from "../schema.js";
import { renderRoute } from "../render.js";
import { HttpProblem } from "../middleware/error-handler.js";
import { getOpenApiDocument } from "../openapi.js";

export const v1 = new Hono();

// ── OpenAPI spec endpoint (no auth required — registered before auth middleware) ──
v1.get("/docs/openapi.json", (c) => {
  return c.json(getOpenApiDocument());
});

// ── Render endpoint ─────────────────────────────────────────
// Content negotiation via Accept header:
//   image/svg+xml → SVG
//   image/png     → PNG (default when no/ambiguous Accept header)
//   unsupported   → 406 Not Acceptable
v1.post("/render", renderRoute);

// ── Method Not Allowed for /render ──────────────────────────
v1.all("/render", (c) => {
  throw new HttpProblem(405, "Method Not Allowed", {
    detail: "Use POST for /v1/render",
  });
});

// ── Generate endpoint ───────────────────────────────────────
v1.post("/generate", async (c) => {
  const body = await c.req.json<{ prompt: string; format?: string }>();

  if (!body.prompt || typeof body.prompt !== "string") {
    return c.json({ error: "Missing 'prompt' field (string)" }, 400);
  }

  const format = body.format || "json"; // "json" | "owm" | "both"

  try {
    const startTime = Date.now();
    const map = await generateMap(body.prompt);
    const elapsed = Date.now() - startTime;

    // Run validation (Engine 3)
    const warnings = validateMap(map);

    // Build response based on requested format
    const response: Record<string, unknown> = {
      meta: {
        elapsed_ms: elapsed,
        warnings,
        engine: "llm-only-v1",
      },
    };

    if (format === "json" || format === "both") {
      response.map = map;
    }
    if (format === "owm" || format === "both") {
      response.owm = toOWM(map);
    }

    return c.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Generation failed:", message);
    return c.json({ error: message }, 500);
  }
});
