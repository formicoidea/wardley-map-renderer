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
 * @module render/evolvesto-layer
 */

import type { RenderContext, LayerRenderer } from "./types.js";
import { renderEvolveArrow, renderInertiaBarrier } from "./svg-primitives.js";

// ── Layer renderer ───────────────────────────────────────────────────

/**
 * Render all evolvesTo arrows as dashed lines with arrowheads.
 *
 * Delegates SVG fragment generation to svg-primitives for zero renderer drift.
 *
 * @param ctx - RenderContext with pre-computed evolve arrow geometry
 * @returns Array of SVG fragment strings
 */
export const renderEvolvesToLayer: LayerRenderer = (
  ctx: RenderContext
): string[] => {
  if (ctx.evolves.length === 0) return [];

  const parts: string[] = [];
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
  for (const barrier of ctx.inertiaBarriers) {
    parts.push(renderInertiaBarrier(barrier.x, barrier.y1, barrier.y2));
  }

  return parts;
};
