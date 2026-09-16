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
 * The 9 canonical layers (in z-order, back to front):
 *   1. title       — map title text above plot area
 *   2. axes        — plot border, grid lines, axis labels, direction indicators
 *   3. pipelines   — pipeline background rectangles (visual container, no label impact)
 *   4. edges       — relation lines between components
 *   5. evolvesTo   — evolvesTo movement arrows (dashed)
 *   6. nodes       — component circles/markers
 *   7. labels      — component text labels (with collision avoidance)
 *   8. notes       — note annotations
 *   9. legend      — legend overlay (visibility controlled by legend.show)
 *
 * Two usage modes:
 *   a) Global registry — uses registerLayer/getOrderedLayers from registry.ts
 *   b) Explicit layers — pass LayerRegistration[] to composeSVG()
 *
 * @module render/svg-composer
 */

import type { WardleyMap } from "../schema.js";
import type { LayerRegistration } from "./types.js";
import { buildRenderContext } from "./build-context.js";
import { getOrderedLayers } from "./registry.js";
import { composeSVG } from "./compose-core.js";

// Core composition lives in compose-core.ts (zod-free); re-exported here.
export { composeSVG, scaledFontSize, esc } from "./compose-core.js";

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
