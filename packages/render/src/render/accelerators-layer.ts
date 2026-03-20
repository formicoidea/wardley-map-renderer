/**
 * AcceleratorsLayer — renders accelerator / deaccelerator arrows on the map.
 *
 * Part of the modular rendering architecture (gameplay layer, between steps and labels in z-order).
 * Pure function: takes RenderContext, returns SVG fragment strings.
 *
 * Visual spec (faithful to OWM — damonsk/onlinewardleymaps):
 *   - Accelerator: rightward directional arrow (▶ style SVG path)
 *   - Deaccelerator: same arrow rotated 180° (◀ style)
 *   - Default stroke colour: #000000 (black)
 *   - Arrow size: ~30px wide, ~20px tall
 *   - Label rendered beside the arrow
 *
 * @module render/accelerators-layer
 */

import type { RenderContext, LayerRenderer } from "./types.js";
import { esc } from "./svg-composer.js";

// ── Visual constants ─────────────────────────────────────────────────

/** Arrow half-height (vertical extent from center) */
const ARROW_HALF_H = 10;

/** Arrow width (horizontal extent) */
const ARROW_W = 30;

/** Arrow shaft width as fraction of total height */
const SHAFT_HALF_H = 4;

/** Arrow head starts at this fraction of total width */
const HEAD_START_RATIO = 0.55;

/** Default arrow stroke colour */
const ARROW_STROKE = "#000000";

/** Default arrow fill colour */
const ARROW_FILL = "#000000";

/** Label font size */
const LABEL_FONT_SIZE = 12;

/** Gap between arrow and label */
const LABEL_GAP = 6;

// ── Arrow path builder ──────────────────────────────────────────────

/**
 * Build a rightward-pointing arrow SVG path string centred at (0, 0).
 *
 * Shape (pointing right →):
 *
 *              ╱‾‾‾‾‾╲
 *   ══════════╱       ▷
 *   ══════════╲       ╱
 *              ╲_____╱
 *
 * The path is drawn as a closed polygon:
 *   - Shaft: rectangle from left edge to HEAD_START
 *   - Head: triangle from HEAD_START to tip
 */
export function buildArrowPath(): string {
  const hw = ARROW_W / 2;
  const headX = -hw + ARROW_W * HEAD_START_RATIO;

  // Path points (clockwise from top-left of shaft)
  const points = [
    // Shaft top-left
    `M ${-hw} ${-SHAFT_HALF_H}`,
    // Shaft top-right (where head starts)
    `L ${headX} ${-SHAFT_HALF_H}`,
    // Head top
    `L ${headX} ${-ARROW_HALF_H}`,
    // Tip (rightmost point)
    `L ${hw} 0`,
    // Head bottom
    `L ${headX} ${ARROW_HALF_H}`,
    // Shaft bottom-right
    `L ${headX} ${SHAFT_HALF_H}`,
    // Shaft bottom-left
    `L ${-hw} ${SHAFT_HALF_H}`,
    // Close
    `Z`,
  ];

  return points.join(" ");
}

// ── Layer renderer ───────────────────────────────────────────────────

/**
 * Render accelerator / deaccelerator arrows.
 *
 * Each accelerator from `ctx.map.accelerators` is rendered as:
 *   1. A directional arrow path at the accelerator's position
 *      - accelerator: points right (no rotation)
 *      - deaccelerator: points left (rotate 180°)
 *   2. A text label beside the arrow
 *
 * @param ctx - RenderContext with pre-computed geometry and map data
 * @returns Array of SVG fragment strings (empty if no accelerators)
 */
export const renderAcceleratorsLayer: LayerRenderer = (
  ctx: RenderContext
): string[] => {
  const accelerators = ctx.map.accelerators;
  if (!accelerators || accelerators.length === 0) return [];

  const parts: string[] = [];
  const fontFamily = ctx.resolvedConfig.fontFamily;
  const arrowD = buildArrowPath();

  for (const acc of accelerators) {
    const cx = ctx.evoToX(acc.position.evolution.scalar);
    const cy = ctx.visToY(acc.position.visibility.scalar);

    const isDeaccelerator = acc.type === "deaccelerator";
    const rotation = isDeaccelerator ? 180 : 0;

    // Arrow path with optional rotation
    parts.push(
      `<path d="${arrowD}" ` +
        `transform="translate(${cx}, ${cy})${rotation ? ` rotate(${rotation})` : ""}" ` +
        `fill="${ARROW_FILL}" stroke="${ARROW_STROKE}" stroke-width="1" />`
    );

    // Label: to the right of accelerator, to the left of deaccelerator
    const labelX = isDeaccelerator
      ? cx - ARROW_W / 2 - LABEL_GAP
      : cx + ARROW_W / 2 + LABEL_GAP;
    const textAnchor = isDeaccelerator ? "end" : "start";

    parts.push(
      `<text x="${labelX}" y="${cy}" text-anchor="${textAnchor}" ` +
        `dominant-baseline="central" ` +
        `font-family="${fontFamily}" font-size="${LABEL_FONT_SIZE}" ` +
        `fill="${ARROW_STROKE}">${esc(acc.label)}</text>`
    );
  }

  return parts;
};
