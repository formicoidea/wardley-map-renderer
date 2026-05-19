/**
 * PipelinesLayer — renders pipeline components as background visual rectangles.
 *
 * Part of the 9-layer modular rendering architecture (Layer 3).
 * Pipelines are rendered as semi-transparent rounded rectangles in the
 * background, behind edges and component nodes. They have no impact on
 * label placement (treated as fond visuel per specification).
 *
 * Pure function: takes RenderContext, returns SVG fragment strings.
 *
 * @module render/pipelines-layer
 */

import type { RenderContext, LayerRenderer } from "./types.js";
import { renderPipeline } from "./svg-primitives.js";

// ── Layer renderer ──────────────────────────────────────────────────

/**
 * Render pipeline rectangles as background SVG elements.
 *
 * Delegates SVG fragment generation to svg-primitives.renderPipeline()
 * for zero renderer drift between server and client.
 *
 * @param ctx - RenderContext with pre-computed pipeline geometry
 * @returns Array of SVG fragment strings
 */
export const renderPipelinesLayer: LayerRenderer = (
  ctx: RenderContext
): string[] => {
  if (ctx.pipelines.length === 0) return [];

  // Skip entire layer if "pipeline" type is excluded
  if (ctx.resolvedConfig.excludeComponentTypes.includes("pipeline")) return [];

  const parts: string[] = [];
  const interactive = ctx.options?.interactive === true;

  for (const p of ctx.pipelines) {
    const svg = renderPipeline({
      x: p.x,
      y: p.y,
      width: p.width,
      height: p.height,
      componentId: p.component.id,
      interactive,
    });
    if (svg) parts.push(svg);
  }

  return parts;
};
