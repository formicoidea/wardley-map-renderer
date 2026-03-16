/**
 * EdgesLayer — renders relation edges between components.
 *
 * Part of the 9-layer modular rendering architecture (Layer 4).
 * Uses pre-computed EdgeGeometry from the RenderContext (Phase 1 output).
 *
 * Supports three relation types with distinct visual styles:
 *   - DependsOn (default): solid grey line — standard dependency
 *   - Flow: dashed blue line — data/value/information flow
 *   - Constraint: dotted red line — regulatory/policy/structural constraint
 *
 * Additionally, the Flow schema on any relation can override the line style:
 *   - "solid" (default): simple solid line
 *   - "dashed": dashed line with stroke-dasharray
 *   - "bold": thicker solid line (2× width)
 *
 * Pure function: takes RenderContext, returns SVG fragment strings.
 *
 * @module render/edges-layer
 */

import type { RenderContext, LayerRenderer } from "./types.js";
import type { RelationType } from "../schema.js";

// ── Visual constants ────────────────────────────────────────────────

/** Default edge stroke width */
const EDGE_STROKE_WIDTH = 1.5;

/** Default visual style per relation type */
interface RelationVisualStyle {
  readonly color: string;
  readonly dashArray: string; // empty string = solid
}

const RELATION_TYPE_STYLES: Record<RelationType, RelationVisualStyle> = {
  DependsOn: { color: "#999999", dashArray: "" },
  Flow:      { color: "#2563eb", dashArray: "8,4" },
  Constraint:{ color: "#dc2626", dashArray: "3,3" },
};

// ── Layer renderer ──────────────────────────────────────────────────

/**
 * Render edge lines as SVG line elements.
 *
 * Each edge from the RenderContext has pre-computed pixel endpoints
 * and a reference to the original Relation (which may carry a Flow
 * with style metadata, or a relation type for visual differentiation).
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

    // Resolve base visual style from relation type
    const relType = relation.type ?? "DependsOn";
    const typeStyle = RELATION_TYPE_STYLES[relType] ?? RELATION_TYPE_STYLES.DependsOn;

    let strokeColor = typeStyle.color;
    let strokeWidth = EDGE_STROKE_WIDTH;
    let dashArray = typeStyle.dashArray;

    // Flow metadata can override line style (solid/dashed/bold)
    const flowStyle = relation.flow?.style ?? "solid";
    switch (flowStyle) {
      case "dashed":
        dashArray = "6,4";
        break;
      case "bold":
        strokeWidth = EDGE_STROKE_WIDTH * 2;
        break;
      // "solid" keeps the type's default dash pattern
    }

    const dashAttr = dashArray ? ` stroke-dasharray="${dashArray}"` : "";

    parts.push(
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ` +
        `stroke="${strokeColor}" stroke-width="${strokeWidth}"${dashAttr} />`
    );
  }

  return parts;
};
