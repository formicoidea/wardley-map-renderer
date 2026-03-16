/**
 * HTTP route handler for POST /render — content negotiation + rendering.
 *
 * Delegates rendering to the modular pipeline (render-orchestrator).
 * Extracted from the legacy monolithic render.ts.
 *
 * @module render-route
 */

import type { Context } from "hono";
import { WardleyMapSchema, sanitizeMap } from "./schema.js";
import { renderToSVG, renderToPNG } from "./render-orchestrator.js";
import { HttpProblem } from "./middleware/error-handler.js";

// ── Content Negotiation ──────────────────────────────────────────────

const SUPPORTED_FORMATS = new Map<string, "svg" | "png">([
  ["image/svg+xml", "svg"],
  ["image/png", "png"],
  ["image/*", "png"],
  ["*/*", "png"],
]);

/**
 * Parse the Accept header and determine the best supported format.
 * Returns "svg", "png", or null if no supported format matches.
 */
export function negotiateFormat(accept: string | undefined): "svg" | "png" | null {
  if (!accept) return "png";

  const types = accept
    .split(",")
    .map((part) => {
      const [type, ...params] = part.trim().split(";");
      const qParam = params.find((p) => p.trim().startsWith("q="));
      const q = qParam ? parseFloat(qParam.trim().slice(2)) : 1.0;
      return { type: type.trim().toLowerCase(), q };
    })
    .filter((t) => t.q > 0)
    .sort((a, b) => b.q - a.q);

  for (const { type } of types) {
    const format = SUPPORTED_FORMATS.get(type);
    if (format) return format;
  }

  return null;
}

// ── Hono Route Handler ──────────────────────────────────────────────

/**
 * POST /render route handler.
 *
 * Accepts WardleyMap JSON as the POST body.
 * Uses the Accept header for content negotiation:
 *   - image/svg+xml  → SVG
 *   - image/png      → PNG (default)
 *   - unsupported    → 406 Not Acceptable
 */
export async function renderRoute(c: Context): Promise<Response> {
  // ── Validate Content-Type ──────────────────────────────
  const contentType = c.req.header("Content-Type") ?? "";
  if (!contentType.includes("application/json") && !contentType.includes("text/json")) {
    throw new HttpProblem(415, "Unsupported Media Type", {
      detail: "Content-Type must be application/json",
    });
  }

  // ── Parse body ──────────────────────────────────────────
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HttpProblem(400, "Bad Request", {
      detail: "Request body must be valid JSON",
    });
  }

  // ── Validate against WardleyMap schema ──────────────────
  const parsed = WardleyMapSchema.safeParse(body);
  if (!parsed.success) {
    throw new HttpProblem(422, "Validation Error", {
      detail: "Invalid WardleyMap JSON",
      errors: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  const map = sanitizeMap(parsed.data);

  // ── Content negotiation ─────────────────────────────────
  const accept = c.req.header("Accept");
  const format = negotiateFormat(accept);

  if (format === null) {
    throw new HttpProblem(406, "Not Acceptable", {
      detail: "Supported formats: image/svg+xml, image/png. Set Accept header accordingly.",
    });
  }

  // ── Render via modular pipeline ─────────────────────────
  try {
    if (format === "svg") {
      const svg = renderToSVG(map);
      return new Response(svg, {
        status: 200,
        headers: {
          "Content-Type": "image/svg+xml; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    } else {
      const png = await renderToPNG(map);
      return new Response(new Uint8Array(png), {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Content-Length": String(png.length),
          "Cache-Control": "no-store",
        },
      });
    }
  } catch (err) {
    if (err instanceof HttpProblem) throw err;
    const detail = err instanceof Error ? err.message : "Rendering failed";
    console.error("[render] Error:", detail);
    throw new HttpProblem(500, "Internal Server Error", { detail });
  }
}
