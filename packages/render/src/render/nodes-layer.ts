/**
 * NodesLayer — renders component nodes as circles on the map.
 *
 * Part of the 9-layer modular rendering architecture (Layer 6).
 * Pure function: takes RenderContext, returns SVG fragment strings.
 *
 * Node appearance varies by component type:
 *   - component:  solid white circle with black stroke (standard)
 *   - user-need:  solid white circle with black stroke (same visual, distinct semantically)
 *   - anchor:     solid white circle with black stroke + person silhouette inside
 *   - pipeline:   no node circle rendered (pipeline has its own rect in pipelines-layer)
 *   - note:       no node circle rendered (notes are text-only in notes-layer)
 *
 * Optional color override is supported via component.color field.
 *
 * @module render/nodes-layer
 */

import type { RenderContext, LayerRenderer } from "./types.js";
import { resolveColor, resolveTypeStyle } from "../schema.js";
import type { NodeRadii } from "../schema.js";
import {
  renderComponentNode,
  renderPipelineHandleSquare,
  renderMethodIndicator as renderMethodIndicatorPrimitive,
  NODE_FILL, NODE_STROKE,
  METHOD_AURA_R as METHOD_AURA_R_CONST,
  MARKET_OUTER_R as MARKET_OUTER_R_CONST,
  MARKET_TRIANGLE_R as MARKET_TRIANGLE_R_CONST,
  MARKET_VERTEX_R as MARKET_VERTEX_R_CONST,
  SIN60 as SIN60_CONST,
  COS60 as COS60_CONST,
} from "./svg-primitives.js";

// ── Visual constants (delegated to svg-primitives.ts) ─────────────────

const METHOD_DEFAULT_COLOR = "#888888"; // fallback for unknown method types

/** Component types that render as a circle node */
const NODE_TYPES = new Set(["component", "user-need", "anchor", "ecosystem", "market"]);

// ── Re-export renderMethodIndicator from primitives ──────────────────
export const renderMethodIndicator = renderMethodIndicatorPrimitive;

// ── Exported constants for testing ──────────────────────────────────
export const METHOD_AURA_R = METHOD_AURA_R_CONST;
export { METHOD_DEFAULT_COLOR };
export const MARKET_OUTER_R = MARKET_OUTER_R_CONST;
export const MARKET_TRIANGLE_R = MARKET_TRIANGLE_R_CONST;
export const MARKET_VERTEX_R = MARKET_VERTEX_R_CONST;
export const SIN60 = SIN60_CONST;
export const COS60 = COS60_CONST;

// ── Layer renderer ───────────────────────────────────────────────────

/**
 * Resolve the effective node radius for a given component type.
 * Delegates to `resolveTypeStyle` — the canonical TypeStyleMap per-type-with-fallback lookup.
 * Lookup precedence: nodeRadii[type] → nodeRadii._default
 *
 * NodeRadii is a TypeStyleMap<number>: _default is required, so the result is always a number.
 */
function resolveNodeRadius(
  type: string,
  nodeRadii: NodeRadii
): number {
  // resolveTypeStyle returns T | undefined; NodeRadii guarantees _default is present,
  // so the result is always a number.  The non-null assertion is safe here.
  return resolveTypeStyle<number>(nodeRadii, type) as number;
}

/**
 * Render component nodes as SVG circles.
 *
 * Skips pipeline and note types (they have their own visual layers).
 * Applies optional color override from component.color field.
 *
 * @param ctx - RenderContext with pre-computed node geometry
 * @returns Array of SVG fragment strings
 */
export const renderNodesLayer: LayerRenderer = (
  ctx: RenderContext
): string[] => {
  const parts: string[] = [];
  const { nodeRadii, typeColors, excludeComponentTypes, strokeWidth } = ctx.resolvedConfig;
  const excluded = new Set(excludeComponentTypes);
  const interactive = ctx.options?.interactive === true;

  for (const node of ctx.nodes) {
    const comp = node.component;

    // Skip non-node types
    if (!NODE_TYPES.has(comp.type)) continue;

    // Skip excluded component types
    if (excluded.has(comp.type)) continue;

    // Resolve per-type radius: nodeRadii[type] → nodeRadii._default
    const r = resolveNodeRadius(comp.type, nodeRadii);

    // Color precedence: component.color > typeColors[type] > typeColors._default > node default
    const typeColor = typeColors[comp.type] ?? typeColors._default;
    const stroke = comp.color
      ? resolveColor(comp.color)
      : typeColor
        ? resolveColor(typeColor)
        : NODE_STROKE;

    // Method indicator data: resolved from renderConfig.methods
    let method: { color: string; position: number } | undefined;
    if (comp.method) {
      const methodCfg = ctx.resolvedConfig.methods.find(m => m.type === comp.method!.type);
      if (methodCfg) {
        const legendKeys = Object.keys(methodCfg.legend);
        const position = legendKeys.indexOf(comp.method.preconisation);
        if (position >= 0) {
          method = { color: methodCfg.color, position };
        }
      }
    }

    // Delegate to shared svg-primitives.ts for zero renderer drift
    parts.push(renderComponentNode({
      id: comp.id,
      type: comp.type,
      cx: node.cx,
      cy: node.cy,
      radius: r,
      stroke,
      strokeWidth,
      method,
      interactive,
    }));
  }

  // Render pipeline handle squares at same z-level as component nodes
  // (only if "pipeline" type is not excluded)
  if (!excluded.has("pipeline")) {
    for (const p of ctx.pipelines) {
      const pr = resolveNodeRadius("pipeline", nodeRadii);
      parts.push(renderPipelineHandleSquare(p.handleX, p.handleY, pr, strokeWidth));
    }
  }

  return parts;
};
