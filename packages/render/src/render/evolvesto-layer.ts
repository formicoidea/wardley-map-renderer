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

import type { RenderContext, LayerRenderer, EvolveGeometry } from "./types.js";

// ── Visual constants ─────────────────────────────────────────────────

/** Arrow style per evolve type */
const EVOLVE_STYLES: Record<
  EvolveGeometry["evolveType"],
  { stroke: string; dasharray: string }
> = {
  natural: { stroke: "#dc2626", dasharray: "6,3" },
  ecosystem: { stroke: "#2563eb", dasharray: "6,3" },
  forced: { stroke: "#9333ea", dasharray: "6,3" },
  late: { stroke: "#999999", dasharray: "6,3" },
};

const ARROWHEAD_SIZE = 8;

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Generate an SVG polygon arrowhead pointing from (fromX,fromY) to (toX,toY).
 * Returns the points attribute for a triangle polygon.
 */
function arrowheadPoints(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  size: number
): string {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return "";

  // Unit vector along the arrow direction
  const ux = dx / len;
  const uy = dy / len;

  // Perpendicular vector
  const px = -uy;
  const py = ux;

  // Arrowhead tip is at (toX, toY)
  // Two base points are offset back along the arrow and out perpendicular
  const half = size / 2;
  const baseX = toX - ux * size;
  const baseY = toY - uy * size;

  const p1x = baseX + px * half;
  const p1y = baseY + py * half;
  const p2x = baseX - px * half;
  const p2y = baseY - py * half;

  return `${toX},${toY} ${p1x},${p1y} ${p2x},${p2y}`;
}

// ── Layer renderer ───────────────────────────────────────────────────

/**
 * Render all evolvesTo arrows as dashed lines with arrowheads.
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

  for (const evolve of ctx.evolves) {
    const defaults = EVOLVE_STYLES[evolve.evolveType] ?? EVOLVE_STYLES.natural;
    // _default provides a mid-level fallback between per-type override and hardcoded defaults.
    // Resolution order (highest wins): per-type override → _default → hardcoded renderer defaults
    const configDefault = configEvolveStyles._default;
    const override = configEvolveStyles[evolve.evolveType as keyof typeof configEvolveStyles];
    const style = {
      stroke: override?.stroke ?? configDefault?.stroke ?? defaults.stroke,
      dasharray: override?.strokeDasharray ?? configDefault?.strokeDasharray ?? defaults.dasharray,
    };

    // Dashed line from source to target
    parts.push(
      `<line x1="${evolve.fromX}" y1="${evolve.fromY}" ` +
        `x2="${evolve.toX}" y2="${evolve.toY}" ` +
        `stroke="${style.stroke}" stroke-width="${arrowStrokeWidth}" ` +
        `stroke-dasharray="${style.dasharray}" />`
    );

    // Arrowhead at target end
    const pts = arrowheadPoints(
      evolve.fromX,
      evolve.fromY,
      evolve.toX,
      evolve.toY,
      ARROWHEAD_SIZE
    );
    if (pts) {
      parts.push(
        `<polygon points="${pts}" fill="${style.stroke}" />`
      );
    }
  }

  // ── Inertia barriers (thick vertical lines at phase boundaries) ──
  const INERTIA_STROKE_WIDTH = 6;
  const INERTIA_COLOR = "#000000";
  for (const barrier of ctx.inertiaBarriers) {
    parts.push(
      `<line x1="${barrier.x}" y1="${barrier.y1}" ` +
        `x2="${barrier.x}" y2="${barrier.y2}" ` +
        `stroke="${INERTIA_COLOR}" stroke-width="${INERTIA_STROKE_WIDTH}" />`
    );
  }

  return parts;
};
