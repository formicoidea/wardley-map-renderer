/**
 * EdgesLayer — renders relation edges (dependency lines) between components.
 *
 * Part of the 8-layer modular rendering architecture (Layer 4).
 * Uses pre-computed EdgeGeometry from the RenderContext (Phase 1 output).
 *
 * Supports three line styles from the Flow schema:
 *   - "solid" (default): simple solid line
 *   - "dashed": dashed line with stroke-dasharray
 *   - "bold": thicker solid line (2× width)
 *
 * Pure function: takes RenderContext, returns SVG fragment strings.
 *
 * @module render/edges-layer
 */

import type { RenderContext, LayerRenderer } from "./types.js";

// ── Visual constants ────────────────────────────────────────────────

/** Default edge stroke color */
const EDGE_COLOR = "#999999";
/** Default edge stroke width */
const EDGE_STROKE_WIDTH = 1.5;
/** Dashed edge dash array */
const EDGE_DASH_ARRAY = "6,4";

// ── Layer renderer ──────────────────────────────────────────────────

/**
 * Render edge lines as SVG line elements.
 *
 * Each edge from the RenderContext has pre-computed pixel endpoints
 * and a reference to the original Relation (which may carry a Flow
 * with style metadata).
 *
 * @param ctx - RenderContext with pre-computed edge geometry
 * @returns Array of SVG fragment strings
 */
export const renderEdgesLayer: LayerRenderer = (
  ctx: RenderContext
): string[] => {
  if (ctx.edges.length === 0) return [];

  const parts: string[] = [];

  for (const edge of ctx.edges) {
    const { x1, y1, x2, y2, relation } = edge;

    // Determine flow style from the relation's flow metadata
    const flowStyle = relation.flow?.style ?? "solid";

    // Build style attributes based on flow style
    let strokeWidth = EDGE_STROKE_WIDTH;
    let dashAttr = "";

    switch (flowStyle) {
      case "dashed":
        dashAttr = ` stroke-dasharray="${EDGE_DASH_ARRAY}"`;
        break;
      case "bold":
        strokeWidth = EDGE_STROKE_WIDTH * 2;
        break;
      // "solid" is the default — no extra attributes
    }

    parts.push(
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ` +
        `stroke="${EDGE_COLOR}" stroke-width="${strokeWidth}"${dashAttr} />`
    );
  }

  return parts;
};
