/**
 * EvolvesToLayer — renders evolution arrows between component positions.
 *
 * Part of the 9-layer modular rendering architecture (Layer 5).
 * Pure function: takes RenderContext, returns SVG fragment strings.
 *
 * Evolution arrows are drawn as dashed lines with an arrowhead,
 * visually styled per evolveType:
 *   - natural:   red dashed arrow (default movement)
 *   - ecosystem: blue dashed arrow (platform/ecosystem pull)
 *   - forced:    purple dashed arrow (regulatory/market pressure)
 *
 * This layer also owns the other evolution-axis annotations (all drawn behind
 * nodes, all hidden by `filters.layers.evolvesTo: false`):
 *   - `position.evolution.range` → thin low-opacity line spanning [min, max]
 *     at the component's visibility (drawn first, behind the arrows).
 *   - component-level `inertia` → short thick bar just beside the node, on the
 *     side the component would move towards (direction of its first evolvesTo
 *     target, rightwards by default). Skipped when an inertia-flagged evolvesTo
 *     arrow already draws phase barriers for that component (no double-draw).
 *
 * @module render/evolvesto-layer
 */

import type { RenderContext, LayerRenderer } from "./types.js";
import {
  renderEvolveArrow,
  renderInertiaBarrier,
  renderEvolutionRange,
  COMPONENT_INERTIA_GAP,
  COMPONENT_INERTIA_HALF_HEIGHT,
} from "./svg-primitives.js";
import { effectiveVisualRadius } from "./accelerators-layer.js";

/** Component types rendered as circle nodes (mirrors nodes-layer). */
const NODE_TYPES = new Set(["component", "user-need", "anchor", "ecosystem", "market"]);

// ── Layer renderer ───────────────────────────────────────────────────

/**
 * Render evolution ranges, evolvesTo arrows, and inertia barriers/bars.
 *
 * Delegates SVG fragment generation to svg-primitives for zero renderer drift.
 *
 * @param ctx - RenderContext with pre-computed evolve arrow geometry
 * @returns Array of SVG fragment strings
 */
export const renderEvolvesToLayer: LayerRenderer = (
  ctx: RenderContext
): string[] => {
  const parts: string[] = [];
  const excluded = new Set(ctx.resolvedConfig.excludeComponentTypes);
  const nodes = ctx.nodes.filter(
    (n) => NODE_TYPES.has(n.component.type) && !excluded.has(n.component.type)
  );

  // ── Evolution ranges (behind everything else in this layer) ──
  for (const node of nodes) {
    const range = node.component.position.evolution.range;
    if (!range) continue;
    parts.push(renderEvolutionRange(ctx.evoToX(range[0]), ctx.evoToX(range[1]), node.cy));
  }

  const configEvolveStyles = ctx.resolvedConfig.evolveStyles;
  const arrowStrokeWidth = ctx.resolvedConfig.strokeWidth;
  const interactive = ctx.options?.interactive === true;

  for (const evolve of ctx.evolves) {
    const configDefault = configEvolveStyles._default;
    const override = configEvolveStyles[evolve.evolveType as keyof typeof configEvolveStyles];

    parts.push(renderEvolveArrow({
      fromX: evolve.fromX,
      fromY: evolve.fromY,
      toX: evolve.toX,
      toY: evolve.toY,
      evolveType: evolve.evolveType,
      componentId: evolve.component.id,
      arrowStrokeWidth,
      styleOverride: override as { stroke?: string; strokeDasharray?: string } | undefined,
      styleDefault: configDefault as { stroke?: string; strokeDasharray?: string } | undefined,
      interactive,
    }));
  }

  // ── Inertia barriers (thick vertical lines at phase boundaries) ──
  const withBarrier = new Set<string>();
  for (const barrier of ctx.inertiaBarriers) {
    withBarrier.add(barrier.component.id);
    parts.push(renderInertiaBarrier(barrier.x, barrier.y1, barrier.y2));
  }

  // ── Component-level inertia bars (beside the node) ──
  for (const node of nodes) {
    const comp = node.component;
    if (!comp.inertia || withBarrier.has(comp.id)) continue;
    const firstArrow = ctx.evolves.find((e) => e.component.id === comp.id);
    const dir = firstArrow && firstArrow.toX < node.cx ? -1 : 1;
    const x = node.cx + dir * (effectiveVisualRadius(comp, ctx) + COMPONENT_INERTIA_GAP);
    parts.push(renderInertiaBarrier(
      x,
      node.cy - COMPONENT_INERTIA_HALF_HEIGHT,
      node.cy + COMPONENT_INERTIA_HALF_HEIGHT,
    ));
  }

  return parts;
};
