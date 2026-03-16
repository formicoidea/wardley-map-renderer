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

// ── Visual constants ────────────────────────────────────────────────

/** Pipeline rectangle fill color (white semi-transparent) */
const PIPELINE_FILL = "rgba(255, 255, 255, 0.35)";
/** Pipeline rectangle stroke color */
const PIPELINE_STROKE = "#999999";
/** Pipeline rectangle stroke width */
const PIPELINE_STROKE_WIDTH = 1;
/** Pipeline rectangle corner radius */
const PIPELINE_RX = 0;
/** Handle square half-size in pixels (same as NODE_RADIUS for visual consistency) */
const HANDLE_HALF = 7;

// ── Layer renderer ──────────────────────────────────────────────────

/**
 * Render pipeline rectangles as background SVG elements.
 *
 * Each pipeline from the RenderContext is rendered as a rounded rectangle
 * with semi-transparent fill. Pipelines are purely visual background
 * elements — they don't affect label placement or collision avoidance.
 *
 * Skips degenerate pipelines (zero or negative area).
 *
 * @param ctx - RenderContext with pre-computed pipeline geometry
 * @returns Array of SVG fragment strings
 */
export const renderPipelinesLayer: LayerRenderer = (
  ctx: RenderContext
): string[] => {
  if (ctx.pipelines.length === 0) return [];

  const parts: string[] = [];

  for (const p of ctx.pipelines) {
    // Skip degenerate pipelines (zero-area)
    if (p.width <= 0 || p.height <= 0) continue;

    parts.push(
      `<rect x="${p.x}" y="${p.y}" width="${p.width}" height="${p.height}" ` +
        `rx="${PIPELINE_RX}" ry="${PIPELINE_RX}" ` +
        `fill="${PIPELINE_FILL}" stroke="${PIPELINE_STROKE}" ` +
        `stroke-width="${PIPELINE_STROKE_WIDTH}" />`
    );

    // Handle squares are rendered in nodes-layer (same z-index as component nodes)
  }

  return parts;
};
