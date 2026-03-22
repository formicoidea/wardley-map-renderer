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
import { renderToHTML } from "./render-html.js";
import { HttpProblem } from "./middleware/error-handler.js";
import { ProblemTypes } from "./middleware/problem-details.js";

// ── Content Negotiation ──────────────────────────────────────────────

const SUPPORTED_FORMATS = new Map<string, "svg" | "png" | "html">([
  ["text/html", "html"],
  ["image/svg+xml", "svg"],
  ["image/png", "png"],
  ["image/*", "png"],
  ["*/*", "png"],
]);

/**
 * Parse the Accept header and determine the best supported format.
 * Returns "html", "svg", "png", or null if no supported format matches.
 */
export function negotiateFormat(accept: string | undefined): "svg" | "png" | "html" | null {
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
 *   - text/html      → Interactive HTML artifact with embedded SVG
 *   - image/svg+xml  → SVG
 *   - image/png      → PNG (default)
 *   - unsupported    → 406 Not Acceptable
 */
export async function renderRoute(c: Context): Promise<Response> {
  // ── Validate Content-Type ──────────────────────────────
  const contentType = c.req.header("Content-Type") ?? "";
  if (!contentType.includes("application/json") && !contentType.includes("text/json")) {
    throw new HttpProblem(415, "Unsupported Media Type", {
      type: ProblemTypes.UNSUPPORTED_MEDIA_TYPE,
      detail: "Content-Type must be application/json",
    });
  }

  // ── Parse body ──────────────────────────────────────────
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HttpProblem(400, "Bad Request", {
      type: ProblemTypes.BAD_REQUEST,
      detail: "Request body must be valid JSON",
    });
  }

  // ── Validate against WardleyMap schema ──────────────────
  const parsed = WardleyMapSchema.safeParse(body);
  if (!parsed.success) {
    throw new HttpProblem(422, "Validation Error", {
      type: ProblemTypes.VALIDATION_ERROR,
      detail: "Invalid WardleyMap JSON",
      errors: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
        code: issue.code,
      })),
    });
  }

  const map = sanitizeMap(parsed.data);

  // ── Content negotiation ─────────────────────────────────
  const accept = c.req.header("Accept");
  const format = negotiateFormat(accept);

  if (format === null) {
    throw new HttpProblem(406, "Not Acceptable", {
      type: ProblemTypes.NOT_ACCEPTABLE,
      detail: "Supported formats: text/html, image/svg+xml, image/png. Set Accept header accordingly.",
    });
  }

  // ── Extract renderConfig → renderOptions ────────────────
  const rc = map.renderConfig;
  const renderOptions = rc ? {
    width: rc.spatial?.width,
    height: rc.spatial?.height,
    background: { color: rc.styling?.background?.color },
    // Map new nested background toggles → RenderOptions flags
    showAxes: rc.styling?.background?.evolutionXAxis?.show,
    showValueChain: rc.styling?.background?.valueChainYAxis?.show,
    showPhaseLabels: rc.styling?.background?.evolutionPhases?.showPhaseDividerAndLabel,
    fontFamily: rc.typography?.fontFamily,
    labelScale: rc.typography?.labelScale,
    avoidCollisions: rc.avoidCollisions,
    excludeComponentTypes: rc.filters?.excludeComponentTypes,
    typeColors: rc.styling?.palette,
    evolveStyles: rc.styling?.evolveStyles,
  } : undefined;

  // ── Render via modular pipeline ─────────────────────────
  try {
    if (format === "html") {
      const html = await renderToHTML(map, { ...renderOptions, interactive: true });
      return new Response(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    } else if (format === "svg") {
      const svg = renderToSVG(map, renderOptions);
      return new Response(svg, {
        status: 200,
        headers: {
          "Content-Type": "image/svg+xml; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    } else {
      const png = await renderToPNG(map, renderOptions);
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
    throw new HttpProblem(500, "Internal Server Error", {
      type: ProblemTypes.INTERNAL_ERROR,
      detail,
    });
  }
}
