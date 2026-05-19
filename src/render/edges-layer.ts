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
import { renderEdge } from "./svg-primitives.js";

// ── Layer renderer ──────────────────────────────────────────────────

/**
 * Render edge lines as SVG line elements.
 *
 * Each edge from the RenderContext has pre-computed pixel endpoints
 * and a reference to the original Relation (which may carry a Flow
 * with style metadata, or a relation type for visual differentiation).
 *
 * Delegates SVG fragment generation to svg-primitives.renderEdge()
 * for zero renderer drift between server and client.
 *
 * @param ctx - RenderContext with pre-computed edge geometry
 * @returns Array of SVG fragment strings
 */
export const renderEdgesLayer: LayerRenderer = (
  ctx: RenderContext
): string[] => {
  if (ctx.edges.length === 0) return [];

  const parts: string[] = [];
  const excluded = new Set(ctx.resolvedConfig.excludeComponentTypes);
  const baseStrokeWidth = ctx.resolvedConfig.strokeWidth;
  const interactive = ctx.options?.interactive === true;

  for (const edge of ctx.edges) {
    const { x1, y1, x2, y2, relation } = edge;

    // Skip edges where source or target component type is excluded
    if (excluded.size > 0) {
      const srcComp = ctx.componentById.get(relation.source);
      const tgtComp = ctx.componentById.get(relation.target);
      if (srcComp && excluded.has(srcComp.type)) continue;
      if (tgtComp && excluded.has(tgtComp.type)) continue;
    }

    // Delegate to shared svg-primitives.ts
    parts.push(renderEdge({
      x1, y1, x2, y2,
      relationType: relation.type ?? "DependsOn",
      flowStyle: (relation.flow?.style as "solid" | "dashed" | "bold" | undefined) ?? "solid",
      baseStrokeWidth,
      relationId: relation.id,
      interactive,
    }));
  }

  return parts;
};
