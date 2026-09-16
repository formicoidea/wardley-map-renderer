/**
 * Render orchestrator — public API for the modular rendering pipeline.
 *
 * Chains Phase 1 (buildRenderContext) → Phase 2 (composeSVG) using the
 * 9-layer modular renderer from src/render/.
 *
 * Architecture:
 *   Phase 1 — buildRenderContext(map):
 *     Computes all pixel positions from normalized [0-1] coordinates.
 *     Applies pipeline containment, resolves component positions,
 *     pipeline rects, edges, evolution arrows. Pure function, no SVG output.
 *
 *   Phase 2 — composeSVG(ctx, layers):
 *     Generates SVG string by calling each layer renderer in z-order.
 *     9 layers: title → axes → pipelines → edges → evolvesTo → nodes → labels → notes → legend
 *
 * @module render-orchestrator
 */

import { sanitizeMap, type WardleyMap } from "./schema.js";
import {
  buildRenderContext,
  composeSVG,
  type RenderContext,
  type RenderOptions,
} from "./render/index.js";
// Layer list + filters.layers toggle filter (shared with the browser renderer)
import { LAYERS, applyLayerToggles } from "./render/layer-list.js";

// ── Public types ────────────────────────────────────────────────────

/** Options for the orchestrator render() function */
export interface OrchestrationOptions {
  /** Output format — "svg" returns SVG string, "png" returns PNG Buffer */
  format?: "svg" | "png";
  /** Skip sanitizeMap (if input is already sanitized) */
  preSanitized?: boolean;
  /** Phase 2 visual styling options */
  renderOptions?: RenderOptions;
}

/** Result of a render call */
export interface RenderResult {
  /** The rendered output — SVG string or PNG Buffer */
  data: string | Buffer;
  /** MIME type of the output */
  contentType: "image/svg+xml" | "image/png";
  /** Format shorthand */
  format: "svg" | "png";
  /** The RenderContext from Phase 1 (available for inspection/testing) */
  context: RenderContext;
}

// ── Main orchestrator ───────────────────────────────────────────────

/**
 * Main orchestrator: render a WardleyMap to SVG or PNG.
 *
 * Pipeline:
 *   1. sanitizeMap() — clamp coordinates, deduplicate relations
 *   2. Phase 1: buildRenderContext() — pixel positions, pipeline containment
 *   3. Phase 2: composeSVG() — assemble SVG string from 9 layers
 *   4. (optional) SVG→PNG rasterisation via resvg-js
 */
export async function render(
  inputMap: WardleyMap,
  options: OrchestrationOptions = {}
): Promise<RenderResult> {
  const { format = "svg", preSanitized = false, renderOptions } = options;

  // Step 1: Sanitize
  const map = preSanitized ? inputMap : sanitizeMap(inputMap);

  // Step 2: Phase 1 — Geometry computation
  const ctx = buildRenderContext(map, renderOptions);

  // Step 3: Phase 2 — SVG generation via layers (filtered by filters.layers)
  const activeLayers = applyLayerToggles(LAYERS, ctx.resolvedConfig.layerToggles);
  const svg = composeSVG(ctx, activeLayers);

  // Step 4: Optional PNG rasterisation
  if (format === "png") {
    const pngBuffer = await rasterizeSVG(svg, ctx.canvasWidth, ctx.resolvedConfig.background.color);
    return {
      data: pngBuffer,
      contentType: "image/png",
      format: "png",
      context: ctx,
    };
  }

  return {
    data: svg,
    contentType: "image/svg+xml",
    format: "svg",
    context: ctx,
  };
}

// ── Convenience functions ───────────────────────────────────────────

/**
 * Render to SVG string only (synchronous).
 */
export function renderToSVG(
  inputMap: WardleyMap,
  renderOptions?: RenderOptions
): string {
  const map = sanitizeMap(inputMap);
  const ctx = buildRenderContext(map, renderOptions);
  const activeLayers = applyLayerToggles(LAYERS, ctx.resolvedConfig.layerToggles);
  return composeSVG(ctx, activeLayers);
}

/**
 * Render to PNG Buffer (async due to font loading + rasterisation).
 */
export async function renderToPNG(
  inputMap: WardleyMap,
  renderOptions?: RenderOptions
): Promise<Buffer> {
  const map = sanitizeMap(inputMap);
  const ctx = buildRenderContext(map, renderOptions);
  const activeLayers = applyLayerToggles(LAYERS, ctx.resolvedConfig.layerToggles);
  const svg = composeSVG(ctx, activeLayers);
  return rasterizeSVG(svg, ctx.canvasWidth, ctx.resolvedConfig.background.color);
}

/**
 * Execute Phase 1 only — compute geometry without rendering SVG.
 */
export function computeMapGeometry(
  inputMap: WardleyMap,
  renderOptions?: RenderOptions
): RenderContext {
  const map = sanitizeMap(inputMap);
  return buildRenderContext(map, renderOptions);
}

// ── PNG rasterisation (lazy font loading) ───────────────────────────

// resvg-js 2.6.2 `font.fontFiles` is `string[]` (file PATHS), not buffers:
// passing a Uint8Array silently loads nothing and resvg falls back to a system font.
// SemiBold (600, title) and Bold (700, legend title) are bundled because system
// fonts are disabled: without them resvg renders those texts in Regular.
const INTER_FONT_FILES = ["Inter-Regular.ttf", "Inter-SemiBold.ttf", "Inter-Bold.ttf"];

let interFontPaths: string[] | undefined;

async function resolveInterFontPaths(): Promise<string[]> {
  if (interFontPaths !== undefined) return interFontPaths;

  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const fontDir = path.join(import.meta.dirname ?? ".", "assets", "fonts");

  const found: string[] = [];
  for (const file of INTER_FONT_FILES) {
    const fontPath = path.join(fontDir, file);
    try {
      await fs.access(fontPath);
      found.push(fontPath);
    } catch {
      console.warn(`[render] Inter font not found at ${fontPath}`);
    }
  }
  // Without Regular, fall back to resvg defaults (sans-serif) rather than a partial set.
  interFontPaths = found[0]?.endsWith(INTER_FONT_FILES[0]) ? found : [];
  if (interFontPaths.length === 0) console.warn("[render] Inter unavailable, using default sans-serif");
  return interFontPaths;
}

async function rasterizeSVG(svg: string, width: number, backgroundColor?: string): Promise<Buffer> {
  const { Resvg } = await import("@resvg/resvg-js");
  const fontPaths = await resolveInterFontPaths();

  const opts: any = {
    background: backgroundColor ?? "#ffffff",
    fitTo: { mode: "width" as const, value: width },
  };

  if (fontPaths.length > 0) {
    // System fonts off → deterministic output across machines.
    opts.font = {
      fontFiles: fontPaths,
      loadSystemFonts: false,
      defaultFontFamily: "Inter",
    };
  }

  const resvg = new Resvg(svg, opts);
  const rendered = resvg.render();
  return Buffer.from(rendered.asPng());
}

// ── Re-exports for convenience ──────────────────────────────────────

export type {
  RenderContext,
  RenderGeometry,
  RenderOptions,
  LayerRegistration,
} from "./render/index.js";
