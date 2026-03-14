/**
 * SVG Composer — Phase 2 of the 2-phase rendering pipeline.
 *
 * Orchestrates the 8 visual layers in z-order, assembles the final
 * SVG document from their fragments, and wraps with SVG header/footer.
 *
 * Architecture:
 *   Phase 1: buildRenderContext(map) → RenderContext (build-context.ts)
 *   Phase 2: composeSVG(ctx) → SVG string (this module)
 *
 * Each layer is a pure function: (ctx: RenderContext) → string[]
 * Layers are called in ascending order; output fragments are concatenated.
 *
 * The 8 canonical layers (in z-order, back to front):
 *   1. title       — map title text above plot area
 *   2. axes        — plot border, grid lines, axis labels, direction indicators
 *   3. pipelines   — pipeline background rectangles (visual container, no label impact)
 *   4. edges       — relation lines between components
 *   5. evolvesTo   — evolvesTo movement arrows (dashed)
 *   6. nodes       — component circles/markers
 *   7. labels      — component text labels (with collision avoidance)
 *   8. notes       — note annotations
 *
 * Two usage modes:
 *   a) Global registry — uses registerLayer/getOrderedLayers from registry.ts
 *   b) Explicit layers — pass LayerRegistration[] to composeSVG()
 *
 * @module render/svg-composer
 */

import type { WardleyMap } from "../schema.js";
import type { RenderContext, LayerRegistration } from "./types.js";
import { buildRenderContext } from "./build-context.js";
import { getOrderedLayers } from "./registry.js";

// ── SVG helpers ──────────────────────────────────────────────────────

/** Escape text for XML/SVG attribute/content safety */
export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Background pseudo-layer ──────────────────────────────────────────

/**
 * Render the SVG background rect.
 * Always rendered first (z-order 0), before the 8 named layers.
 */
function renderBackground(ctx: RenderContext): string {
  return `<rect width="${ctx.canvasWidth}" height="${ctx.canvasHeight}" fill="#ffffff" />`;
}

// ── SVG document structure ───────────────────────────────────────────

/** Generate the SVG opening tag with proper namespace and viewBox. */
function svgHeader(ctx: RenderContext): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `width="${ctx.canvasWidth}" height="${ctx.canvasHeight}" ` +
    `viewBox="0 0 ${ctx.canvasWidth} ${ctx.canvasHeight}">`
  );
}

/** Generate the SVG closing tag. */
function svgFooter(): string {
  return "</svg>";
}

// ── Core composition ─────────────────────────────────────────────────

/**
 * Compose the final SVG document by orchestrating layers in z-order.
 *
 * This is the main entry point for Phase 2 of the rendering pipeline.
 * It takes a pre-computed RenderContext and an ordered list of layer
 * registrations, calls each layer's render function, and concatenates
 * the results into a complete SVG document.
 *
 * Each layer's output is wrapped in a `<g data-layer="...">` group
 * for debugging and DOM inspection.
 *
 * The background rect is always rendered first (before named layers).
 *
 * @param ctx    - RenderContext built from Phase 1 (buildRenderContext)
 * @param layers - Ordered layer registrations (defaults to global registry)
 * @returns Complete SVG document as a string
 */
export function composeSVG(
  ctx: RenderContext,
  layers?: readonly LayerRegistration[]
): string {
  const orderedLayers = layers ?? getOrderedLayers();
  const parts: string[] = [];

  // SVG document open
  parts.push(svgHeader(ctx));

  // Background (always first, before named layers)
  parts.push(renderBackground(ctx));

  // Render each layer in z-order
  for (const layer of orderedLayers) {
    const fragments = layer.render(ctx);
    if (fragments.length > 0) {
      parts.push(`<g data-layer="${esc(layer.name)}">`);
      parts.push(...fragments);
      parts.push("</g>");
    }
  }

  // SVG document close
  parts.push(svgFooter());

  return parts.join("\n");
}

// ── High-level API ───────────────────────────────────────────────────

/**
 * Render a WardleyMap to a complete SVG string using the 2-phase pipeline.
 *
 * This is the top-level function that replaces the monolithic renderMapToSVG().
 * It:
 *   1. Builds a RenderContext (Phase 1 — geometry)
 *   2. Calls composeSVG with the registered layers (Phase 2 — SVG)
 *
 * Uses the global layer registry by default. Pass explicit layers
 * to override.
 *
 * @param map    - Validated WardleyMap (e.g., from sanitizeMap())
 * @param layers - Optional explicit layer list (defaults to global registry)
 * @returns Complete SVG document string
 */
export function renderMapToSVGComposed(
  map: WardleyMap,
  layers?: readonly LayerRegistration[]
): string {
  const ctx = buildRenderContext(map);
  return composeSVG(ctx, layers);
}

/**
 * Convenience: render a WardleyMap to SVG with only specific layers.
 *
 * Filters the global registry to include only the named layers,
 * preserving their z-order. Useful for testing or generating
 * partial SVGs (e.g., just the axes + nodes).
 *
 * @param map        - Validated WardleyMap
 * @param layerNames - Layer names to include
 * @returns SVG string with only the specified layers
 */
export function renderMapToSVGPartial(
  map: WardleyMap,
  layerNames: readonly string[]
): string {
  const nameSet = new Set(layerNames);
  const allLayers = getOrderedLayers();
  const filtered = allLayers.filter((l) => nameSet.has(l.name));
  return renderMapToSVGComposed(map, filtered);
}
